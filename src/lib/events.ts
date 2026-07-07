import type { EventStatus } from "@prisma/client"

import { prisma } from "@/lib/prisma"

export type GuardedEventUpdateData = {
  title: string
  description: string | null
  location: string | null
  startAt: Date
  endAt: Date | null
  capacity: number | null
  isPublic: boolean
  requirePayment: boolean
  amountInCents: number | null
  status: EventStatus
}

export type GuardedEventUpdateResult =
  | { outcome: "updated" }
  | { outcome: "not_found" }
  | { outcome: "capacity_below_confirmed"; confirmedCount: number }

// 把「鎖 Event 行 → count → 名額下限檢查 → update」抽成獨立函式的原因
// 與 src/lib/registration.ts 相同：Server Action（edit/actions.ts）與
// 併發測試腳本共用同一份邏輯，測試測的就是上線的程式碼。
export async function updateEventWithCapacityGuard(
  eventId: string,
  data: GuardedEventUpdateData
): Promise<GuardedEventUpdateResult> {
  return prisma.$transaction(async (tx) => {
    // 與報名端（src/lib/registration.ts）搶同一把 Event 行鎖。
    // count 與 update 若不在同一個持鎖交易內，下限檢查會被同時進行的
    // 報名穿透（檢查當下沒超額，update 落地前又多出 CONFIRMED），
    // 造成 capacity 低於實際已確認人數的回溯超賣。
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`

    if (rows.length === 0) {
      return { outcome: "not_found" }
    }

    // 已持鎖，這裡讀到的就是最新且不會再被併發交易改動的值
    const event = await tx.event.findUniqueOrThrow({ where: { id: eventId } })

    const [registrationCount, confirmedCount] = await Promise.all([
      tx.registration.count({ where: { eventId } }),
      tx.registration.count({ where: { eventId, status: "CONFIRMED" } }),
    ])

    // 名額下限：不可低於目前已確認（CONFIRMED）的報名筆數，
    // 否則等於回溯製造超賣。前端有提示，這裡是繞過前端時的硬性防線。
    if (data.capacity !== null && data.capacity < confirmedCount) {
      return { outcome: "capacity_below_confirmed", confirmedCount }
    }

    // 已有任何報名（不論狀態，含候補/已取消）時，繳費設定鎖定不可修改，
    // 避免已報名者的對帳基準被事後變更。前端欄位已 disabled，
    // 這裡直接以資料庫現值覆蓋送入值（後端防呆，防止繞過前端直接呼叫）。
    const hasRegistrations = registrationCount > 0
    const requirePayment = hasRegistrations
      ? event.requirePayment
      : data.requirePayment
    const amount = hasRegistrations ? event.amount : data.amountInCents

    await tx.event.update({
      where: { id: eventId },
      data: {
        title: data.title,
        description: data.description,
        location: data.location,
        startAt: data.startAt,
        endAt: data.endAt,
        capacity: data.capacity,
        isPublic: data.isPublic,
        requirePayment,
        amount,
        status: data.status,
      },
    })

    return { outcome: "updated" }
  }, {
    // 與報名端同一把行鎖排隊，放寬逾時的理由見 src/lib/registration.ts
    maxWait: 10_000,
    timeout: 15_000,
  })
}
