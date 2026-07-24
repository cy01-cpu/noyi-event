"use server"

import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/prisma"
import { getCheckInWindow } from "@/lib/event-time"
import { sendPromotionEmails } from "@/lib/promotion"
import {
  cancelRegistrationAndPromote,
  setRefundStatus,
} from "@/lib/registration"

type TogglePaymentResult =
  | { success: true }
  | { success: false; error: string }

export async function togglePaymentStatus(
  registrationId: string,
  isPaid: boolean,
  // 繳費稽核軌跡：操作者自填的站別/姓名（仿報到的 gate 欄位模式，選填）
  operator?: string
): Promise<TogglePaymentResult> {
  try {
    // 已取消的報名一律改走退費標記（ToggleRefundedButton），這裡是
    // 後端防呆：畫面上 TogglePaidButton 只在未取消時渲染，但若使用者
    // 分頁停在取消前的舊畫面、其他人先把這筆取消並標記退費，這裡沒擋
    // 就會把 isPaid 改掉，讓 refunded 變成孤兒紀錄（已退費卻查無繳費）。
    const current = await prisma.registration.findUnique({
      where: { id: registrationId },
      select: { status: true },
    })
    if (!current) {
      return { success: false, error: "找不到這筆報名" }
    }
    if (current.status === "CANCELLED") {
      return {
        success: false,
        error: "這筆報名已取消，繳費狀態請改用退費標記操作",
      }
    }

    const paidBy = operator?.trim().slice(0, 50) || null

    const registration = await prisma.registration.update({
      where: { id: registrationId },
      data: {
        isPaid,
        // 標記已繳費時記錄當下時間與經手人，取消標記則一併清空
        // （雙向可切換，點錯可復原）
        paidAt: isPaid ? new Date() : null,
        paidBy: isPaid ? paidBy : null,
      },
    })

    revalidatePath(`/events/${registration.eventId}/attendees`)
    return { success: true }
  } catch {
    return { success: false, error: "更新繳費狀態時發生錯誤，請稍後再試" }
  }
}

export type CancelRegistrationResult =
  | { success: true; promotedCount: number }
  | { success: false; error: string }

// C1 取消報名（內部人員代操作）。取消＋候補自動遞補的行鎖交易
// 抽在 src/lib/registration.ts 的 cancelRegistrationAndPromote
// （與驗證腳本共用同一份邏輯）。
// 此 action 與本頁其他 action 相同，掛在 /events 路徑下受 proxy
// 通行碼保護，不另做驗證。
export async function cancelRegistration(
  registrationId: string
): Promise<CancelRegistrationResult> {
  try {
    const result = await cancelRegistrationAndPromote(registrationId)

    if (result.outcome === "not_found") {
      return { success: false, error: "找不到這筆報名" }
    }
    if (result.outcome === "already_cancelled") {
      return { success: false, error: "這筆報名已經是取消狀態" }
    }
    if (result.outcome === "checked_in") {
      return { success: false, error: "已報到的報名無法取消" }
    }

    // 轉正狀態已在交易內定案，交易外寄通知信；失敗記入 email-failures
    // 清單（/api/health 可視化），不影響取消結果。
    if (result.promoted.length > 0) {
      await sendPromotionEmails(result.promoted, result.event)
    }

    revalidatePath(`/events/${result.event.id}/attendees`)
    revalidatePath(`/events/${result.event.id}/register`)
    // 取消 CONFIRMED 報名（或候補自動遞補）會改變「已報名 X」的計算基準，
    // /events 是靜態預渲染頁，同一套理由見 register/actions.ts 的說明。
    revalidatePath("/events")
    return { success: true, promotedCount: result.promoted.length }
  } catch {
    return { success: false, error: "取消報名時發生錯誤，請稍後再試" }
  }
}

type UndoCheckInResult =
  | { success: true }
  | { success: false; error: string }

// 取消報到（誤刷復原用）。直接刪除 CheckIn 紀錄即可讓該報名回到「尚未
// 報到」，之後可重新掃碼——比照繳費標記類按鈕的簡單模式，不另外留稽核
// 欄位（何時、被誰取消報到，這裡不記錄）。
//
// 報到有效窗關閉後一律拒絕：窗口關閉代表對方已經無法重新掃碼報到，
// 這時候取消只會讓「已報到」的正確紀錄永久消失且無法挽回，跟報名/
// 報到本身「窗口外一律擋下」是同一套時間邊界原則，不開放「允許但警告」
// 的例外——畫面上按鈕本身在窗口關閉後就不會出現（見 UndoCheckInButton），
// 這裡是繞過前端時的硬性防線。
export async function undoCheckIn(
  registrationId: string
): Promise<UndoCheckInResult> {
  try {
    const registration = await prisma.registration.findUnique({
      where: { id: registrationId },
      select: { eventId: true, event: { select: { startAt: true, endAt: true } } },
    })
    if (!registration) {
      return { success: false, error: "找不到這筆報名" }
    }

    if (new Date() > getCheckInWindow(registration.event).closesAt) {
      return {
        success: false,
        error: "報到時間已截止，取消後對方將無法重新報到，已擋下此操作",
      }
    }

    await prisma.checkIn.delete({ where: { registrationId } })

    revalidatePath(`/events/${registration.eventId}/attendees`)
    return { success: true }
  } catch {
    return { success: false, error: "這筆報名尚未報到，或取消報到時發生錯誤" }
  }
}

type ToggleRefundResult =
  | { success: true }
  | { success: false; error: string }

// 退費標記：已繳費的報名被取消後追蹤退費進度。經手人與標記已繳費
// 共用同一個「收費經手人/站別」輸入框的值（PaidOperatorProvider）。
export async function toggleRefundStatus(
  registrationId: string,
  refunded: boolean,
  operator?: string
): Promise<ToggleRefundResult> {
  try {
    const refundedBy = operator?.trim().slice(0, 50) || null
    const result = await setRefundStatus(registrationId, refunded, refundedBy)

    if (result.outcome === "not_found") {
      return { success: false, error: "找不到這筆報名" }
    }
    if (result.outcome === "not_paid") {
      return { success: false, error: "這筆報名沒有繳費紀錄，無退費可標記" }
    }

    revalidatePath(`/events/${result.registration.eventId}/attendees`)
    return { success: true }
  } catch {
    return { success: false, error: "更新退費狀態時發生錯誤，請稍後再試" }
  }
}
