import type { Event, Prisma, Registration } from "@prisma/client"

import { recordEmailFailure } from "@/lib/email-failures"
import { sendRegistrationConfirmation } from "@/lib/email/registration-confirmation"

// C1 候補自動轉正的共用核心。呼叫端（活動編輯 src/lib/events.ts、
// 取消報名 attendees/actions.ts、人工工具 scripts/promote-waitlisted.ts）
// 必須已在同一個交易內對該 Event 列取得行鎖（SELECT ... FOR UPDATE），
// 轉正筆數才不會被同時進行的報名/編輯穿透而超賣——鎖的取得留在呼叫端，
// 是因為各流程上鎖的時機與後續動作不同，這裡只負責「鎖內的轉正計算與寫入」。
//
// 回傳「本次轉正的報名」原始資料（呼叫端在交易提交後用 sendPromotionEmails
// 寄信）；dryRun 時只計算名單不寫入，供人工工具預演。
export async function promoteWaitlistedInTx(
  tx: Prisma.TransactionClient,
  event: Pick<Event, "id" | "capacity" | "status">,
  options: { dryRun?: boolean } = {}
): Promise<Registration[]> {
  // 已取消的活動不遞補（轉正信等於通知參加一場不存在的活動）；
  // 草稿同理——回到 OPEN/CLOSED 的那次儲存會再走到這裡補做遞補。
  if (event.status === "CANCELLED" || event.status === "DRAFT") {
    return []
  }

  const confirmedCount = await tx.registration.count({
    where: { eventId: event.id, status: "CONFIRMED" },
  })

  // capacity 為 null（不限名額）理論上不會有候補，防禦性處理成全部轉正
  const slots =
    event.capacity === null
      ? Number.MAX_SAFE_INTEGER
      : event.capacity - confirmedCount

  if (slots <= 0) {
    return []
  }

  // 與報名成立同一套公平規則：依報名時間先到先得
  const promotable = await tx.registration.findMany({
    where: { eventId: event.id, status: "WAITLISTED" },
    orderBy: { createdAt: "asc" },
    take: slots,
  })

  if (promotable.length > 0 && !options.dryRun) {
    await tx.registration.updateMany({
      where: { id: { in: promotable.map((r) => r.id) } },
      data: { status: "CONFIRMED" },
    })
  }

  return promotable
}

export type PromotionEmailReport = {
  sent: number
  failures: { name: string; email: string; reason: string }[]
}

// 交易提交後對轉正名單寄「報名成功確認信」（含 QR Code 報到憑證，
// 與正常報名成功走同一個版型）。寄信絕不放進交易內：Resend 往返慢
// 且可能失敗，不能拖住或回滾已定案的轉正。
// 失敗處理與報名主流程一致：記 log ＋寫入 email-failures 清單
// （/api/health 可視化），狀態已是 CONFIRMED，承辦人依名單手動補寄。
export async function sendPromotionEmails(
  promoted: Registration[],
  event: Event
): Promise<PromotionEmailReport> {
  let sent = 0
  const failures: PromotionEmailReport["failures"] = []

  for (const r of promoted) {
    try {
      // 名單來自轉正寫入前的查詢結果，寄信時以轉正後狀態為準
      // （CONFIRMED 才會走含 QR Code 的成功信版型）
      await sendRegistrationConfirmation({ ...r, status: "CONFIRMED" }, event)
      sent += 1
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      console.error(`候補轉正通知信寄送失敗: ${r.name} <${r.email}>`, err)
      failures.push({ name: r.name, email: r.email, reason })
      await recordEmailFailure({
        registrationId: r.id,
        email: r.email,
        eventTitle: event.title,
        reason,
      })
    }
  }

  return { sent, failures }
}
