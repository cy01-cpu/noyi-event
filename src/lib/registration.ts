import type { Registration } from "@prisma/client"

import { prisma } from "@/lib/prisma"

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
      { id: string; capacity: number | null; status: string }[]
    >`SELECT id, capacity, status FROM "Event" WHERE id = ${eventId} FOR UPDATE`

    if (rows.length === 0) {
      return { outcome: "not_found" }
    }

    const { capacity, status: eventStatus } = rows[0]

    if (eventStatus !== "OPEN") {
      return { outcome: "not_open" }
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
