import type { Event, Registration } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { isRegistrationClosed } from "@/lib/event-time"
import { promoteWaitlistedInTx } from "@/lib/promotion"

type NewRegistrationData = {
  name: string
  email: string
  phone: string | null
  branch: string | null
  note: string | null
}

export type CapacityCheckedInsertResult =
  | { outcome: "created"; registration: Registration }
  | { outcome: "not_found" }
  | { outcome: "not_open" }
  // 活動時間上已結束（報名開放到活動結束為止，見 src/lib/event-time.ts）
  | { outcome: "ended" }

// 把「名額判斷 + 寫入報名」抽成獨立函式的原因：
// 1. Server Action（actions.ts）與併發測試腳本（scripts/concurrency-test.ts）
//    共用同一份邏輯，測試測的就是上線的程式碼
// 2. 這段是全系統需要行鎖保護的關鍵區段之一（另一處是 src/lib/events.ts
//    的活動編輯），獨立出來邊界清楚
export async function insertRegistrationWithCapacityCheck(
  eventId: string,
  data: NewRegistrationData
): Promise<CapacityCheckedInsertResult> {
  return prisma.$transaction(async (tx) => {
    // 先對這一筆 Event 加資料庫行鎖（SELECT ... FOR UPDATE），並在「同一句
    // 查詢」取回 capacity 與 status——判斷名額與開放狀態必須用鎖後的最新值，
    // 不能用交易外先讀到的舊值：編輯端（src/lib/events.ts）可能正在調低名額
    // 或關閉活動，兩側搶的是同一把 Event 行鎖，誰先取得誰先定案。
    //
    // PostgreSQL 預設隔離等級是 READ COMMITTED，單純把 count + create 包進
    // transaction 並不能阻止兩筆併發交易同時讀到「還有名額」而雙雙寫入
    // CONFIRMED（超賣）。加上行鎖後，同一場活動的報名交易會在這裡排隊
    // 序列化處理；不同活動鎖的是不同列，互不影響。
    //
    // 即使 capacity 目前是 null（不限名額）也一律上鎖：編輯端可能正在
    // 「從不限名額改成有名額上限」，若此時報名不上鎖，重讀就失去意義。
    const rows = await tx.$queryRaw<
      {
        id: string
        capacity: number | null
        status: string
        startAt: Date
        endAt: Date | null
      }[]
    >`SELECT id, capacity, status, "startAt", "endAt" FROM "Event" WHERE id = ${eventId} FOR UPDATE`

    if (rows.length === 0) {
      return { outcome: "not_found" }
    }

    const { capacity, status: eventStatus, startAt, endAt } = rows[0]

    if (eventStatus !== "OPEN") {
      return { outcome: "not_open" }
    }

    // 時間邊界：活動結束後即使承辦人忘了把狀態改成「已截止」，
    // 報名連結也不能再寫入。時間欄位同樣用鎖後重讀的最新值
    // （編輯端可能正在改時間）。
    if (isRegistrationClosed({ startAt, endAt })) {
      return { outcome: "ended" }
    }

    let status: "CONFIRMED" | "WAITLISTED" = "CONFIRMED"

    if (capacity !== null) {
      const confirmedCount = await tx.registration.count({
        where: { eventId, status: "CONFIRMED" },
      })
      if (confirmedCount >= capacity) {
        status = "WAITLISTED"
      }
    }

    const registration = await tx.registration.create({
      data: {
        eventId,
        name: data.name,
        email: data.email,
        phone: data.phone,
        branch: data.branch,
        note: data.note,
        status,
      },
    })

    return { outcome: "created", registration }
  }, {
    // 同一活動的報名在行鎖上排隊序列化，尖峰時後面的交易要等前面的做完。
    // 放寬 Prisma 預設逾時（maxWait 2s / timeout 5s），避免正常排隊被誤判逾時。
    maxWait: 10_000,
    timeout: 15_000,
  })
}

export type CancelRegistrationOutcome =
  | { outcome: "cancelled"; event: Event; promoted: Registration[] }
  | { outcome: "not_found" }
  | { outcome: "already_cancelled" }
  | { outcome: "checked_in" }

// C1 取消報名＋自動遞補。抽成獨立函式的原因同上：Server Action
// （attendees/actions.ts）與驗證腳本共用同一份邏輯。
// 取消與候補轉正必須在同一把 Event 行鎖交易內完成——取消 CONFIRMED
// 釋出的名額若不在鎖內立刻遞補，會與同時進行的報名/編輯競爭
// 產生超賣或漏補。寄信不在交易內，呼叫端拿 promoted 名單在交易外寄。
export async function cancelRegistrationAndPromote(
  registrationId: string
): Promise<CancelRegistrationOutcome> {
  return prisma.$transaction(async (tx) => {
    // 先查出所屬活動才知道要鎖哪一列；鎖到手後再重讀報名做決定性判斷
    const found = await tx.registration.findUnique({
      where: { id: registrationId },
      select: { eventId: true },
    })
    if (!found) return { outcome: "not_found" }

    await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${found.eventId} FOR UPDATE`

    const registration = await tx.registration.findUniqueOrThrow({
      where: { id: registrationId },
      include: { checkIn: true },
    })

    if (registration.status === "CANCELLED") {
      return { outcome: "already_cancelled" }
    }
    // 已報到代表人已在現場，不應被取消（出席統計與繳費基準都會失真）
    if (registration.checkIn) {
      return { outcome: "checked_in" }
    }

    await tx.registration.update({
      where: { id: registrationId },
      data: { status: "CANCELLED" },
    })

    // 取消 CONFIRMED 釋出名額時依報名順序遞補；取消候補者則是 no-op
    const event = await tx.event.findUniqueOrThrow({
      where: { id: found.eventId },
    })
    const promoted = await promoteWaitlistedInTx(tx, event)

    return { outcome: "cancelled", event, promoted }
  }, {
    maxWait: 10_000,
    timeout: 15_000,
  })
}

export type SetRefundStatusOutcome =
  | { outcome: "updated"; registration: Registration }
  | { outcome: "not_found" }
  | { outcome: "not_paid" }

// 退費標記（已繳費的報名被取消後，追蹤錢是否已還回去）。
// isPaid 不動——它保留「當初確實繳過費」的歷史紀錄，refunded 是
// 獨立標記，兩者不互相覆蓋。比照 togglePaymentStatus 做成雙向
// 可切換（點錯可復原），取消標記時一併清空時間與經手人。
export async function setRefundStatus(
  registrationId: string,
  refunded: boolean,
  operator?: string | null
): Promise<SetRefundStatusOutcome> {
  const existing = await prisma.registration.findUnique({
    where: { id: registrationId },
    select: { isPaid: true },
  })
  if (!existing) return { outcome: "not_found" }
  // 沒繳過費就沒有退費可言，擋下避免產生無意義的退費紀錄
  if (!existing.isPaid) return { outcome: "not_paid" }

  const registration = await prisma.registration.update({
    where: { id: registrationId },
    data: {
      refunded,
      refundedAt: refunded ? new Date() : null,
      refundedBy: refunded ? operator ?? null : null,
    },
  })

  return { outcome: "updated", registration }
}
