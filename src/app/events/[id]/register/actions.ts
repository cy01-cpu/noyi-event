"use server"

import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { isRegistrationClosed } from "@/lib/event-time"
import { insertRegistrationWithCapacityCheck } from "@/lib/registration"
import {
  checkRateLimit,
  createRateLimiter,
  getClientIp,
} from "@/lib/rate-limit"
import { recordEmailFailure } from "@/lib/email-failures"
import {
  registrationFormSchema,
  type RegistrationFormValues,
} from "@/lib/validations/registration"
import type { CustomFieldValues } from "@/lib/validations/event-form-field"
import { sendRegistrationConfirmation } from "@/lib/email/registration-confirmation"

type CreateRegistrationResult =
  | { success: true; status: "CONFIRMED" | "WAITLISTED" }
  | { success: false; error: string }

export async function createRegistration(
  eventId: string,
  values: RegistrationFormValues,
  customFieldValues: CustomFieldValues = {}
): Promise<CreateRegistrationResult> {
  // 公開表單的機器人防線採 IP 限流而非 CAPTCHA（與長輩友善的設計原則衝突）。
  // 額度放在「真人不會踩到、腳本灌水會被擋」的量級。與登入不同，這裡
  // Upstash 未設定時照常放行：報名是核心業務，可用性優先於灌水防護。
  const limiter = createRateLimiter(
    "noyi-event:registration",
    // 同一來源 IP 每分鐘最多送出 5 次報名
    5,
    "1 m"
  )
  const rateLimit = await checkRateLimit(limiter, await getClientIp())
  if (rateLimit === "limited") {
    return { success: false, error: "操作太頻繁，請稍候一分鐘再送出" }
  }

  const parsed = registrationFormSchema.safeParse(values)

  if (!parsed.success) {
    return { success: false, error: "表單資料有誤，請確認後再試一次" }
  }

  const data = parsed.data

  // 這裡的查詢只做「快速失敗」的友善提示與取得寄信用的活動資料；
  // 真正具決定性的 capacity/status 判斷在交易內取得行鎖後重讀最新值
  // （見 src/lib/registration.ts），不依賴這份鎖外的舊值。
  const event = await prisma.event.findUnique({ where: { id: eventId } })

  if (!event) {
    return { success: false, error: "找不到此活動" }
  }

  if (event.status !== "OPEN") {
    return { success: false, error: "此活動目前未開放報名" }
  }

  if (isRegistrationClosed(event)) {
    return { success: false, error: "此活動已結束，無法報名" }
  }

  // 注意：這裡刻意不檢查 event.requirePayment。「繳費對帳」是規劃中的
  // 功能 #7（承辦人事後手動標記 isPaid，非線上金流），設計上報名流程
  // 不卡繳費、一律先成立，這是既定決策而非遺漏。
  try {
    // 名額判斷與寫入包含行鎖保護（防併發超賣），細節見 src/lib/registration.ts。
    // phone 未填時存 null（而非空字串），刻意利用 Postgres unique 限制中
    // 「NULL 不等於 NULL」的特性：不收電話的活動，同名同姓的不同真人
    // 才不會被誤判為重複報名而擋下。
    const result = await insertRegistrationWithCapacityCheck(eventId, {
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      branch: data.branch ?? null,
      note: data.note || null,
      customFieldValues,
    })

    if (result.outcome === "not_found") {
      return { success: false, error: "找不到此活動" }
    }
    if (result.outcome === "not_open") {
      // 上面的快速檢查通過後、取得行鎖前，活動剛好被關閉的邊界情況
      return { success: false, error: "此活動目前未開放報名" }
    }
    if (result.outcome === "ended") {
      return { success: false, error: "此活動已結束，無法報名" }
    }
    if (result.outcome === "invalid_custom_fields") {
      // 承辦人剛好在使用者填表過程中改動了欄位定義，client 端送出的
      // 是瞬間過期的 schema——請使用者重新整理頁面拿最新題目再送一次
      return {
        success: false,
        error: "表單題目剛好被更新，請重新整理頁面後再填寫一次",
      }
    }

    const registration = result.registration

    try {
      await sendRegistrationConfirmation(registration, event)
    } catch (emailErr) {
      // 資料庫已成功寫入才是最重要的事，寄信失敗不應讓報名流程失敗。
      // 除了 log，另寫入 Redis 失敗清單讓 /api/health 可回報（見
      // src/lib/email-failures.ts），承辦人可據此手動補寄。
      console.error("寄送報名確認信失敗:", emailErr)
      await recordEmailFailure({
        registrationId: registration.id,
        email: registration.email,
        eventTitle: event.title,
        reason: emailErr instanceof Error ? emailErr.message : String(emailErr),
      })
    }

    return {
      success: true,
      status: registration.status as "CONFIRMED" | "WAITLISTED",
    }
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return {
        success: false,
        error: "您已經用這個 Email 和姓名報名過這場活動了",
      }
    }
    return { success: false, error: "報名時發生錯誤，請稍後再試" }
  }
}
