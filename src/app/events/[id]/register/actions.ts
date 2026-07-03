"use server"

import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { insertRegistrationWithCapacityCheck } from "@/lib/registration"
import {
  registrationFormSchema,
  type RegistrationFormValues,
} from "@/lib/validations/registration"
import { sendRegistrationConfirmation } from "@/lib/email/registration-confirmation"

type CreateRegistrationResult =
  | { success: true; status: "CONFIRMED" | "WAITLISTED" }
  | { success: false; error: string }

export async function createRegistration(
  eventId: string,
  values: RegistrationFormValues
): Promise<CreateRegistrationResult> {
  const parsed = registrationFormSchema.safeParse(values)

  if (!parsed.success) {
    return { success: false, error: "表單資料有誤，請確認後再試一次" }
  }

  const data = parsed.data

  const event = await prisma.event.findUnique({ where: { id: eventId } })

  if (!event) {
    return { success: false, error: "找不到此活動" }
  }

  if (event.status !== "OPEN") {
    return { success: false, error: "此活動目前未開放報名" }
  }

  // 注意：這裡刻意不檢查 event.requirePayment。「繳費對帳」是規劃中的
  // 功能 #7（承辦人事後手動標記 isPaid，非線上金流），設計上報名流程
  // 不卡繳費、一律先成立，這是既定決策而非遺漏。
  try {
    // 名額判斷與寫入包含行鎖保護（防併發超賣），細節見 src/lib/registration.ts。
    // phone 未填時存 null（而非空字串），刻意利用 Postgres unique 限制中
    // 「NULL 不等於 NULL」的特性：不收電話的活動，同名同姓的不同真人
    // 才不會被誤判為重複報名而擋下。
    const registration = await insertRegistrationWithCapacityCheck(event, {
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      branch: data.branch ?? null,
      note: data.note || null,
    })

    try {
      await sendRegistrationConfirmation(registration, event)
    } catch (emailErr) {
      // 資料庫已成功寫入才是最重要的事，寄信失敗不應讓報名流程失敗。
      // 先記錄錯誤，之後可以再考慮加上重試機制。
      console.error("寄送報名確認信失敗:", emailErr)
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
