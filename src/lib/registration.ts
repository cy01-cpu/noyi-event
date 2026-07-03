import type { Event, Registration } from "@prisma/client"

import { prisma } from "@/lib/prisma"

type NewRegistrationData = {
  name: string
  email: string
  phone: string | null
  branch: string | null
  note: string | null
}

// 把「名額判斷 + 寫入報名」抽成獨立函式的原因：
// 1. Server Action（actions.ts）與併發測試腳本共用同一份邏輯，測試測的就是上線的程式碼
// 2. 這段是全系統唯一需要行鎖保護的關鍵區段，獨立出來邊界清楚
export async function insertRegistrationWithCapacityCheck(
  event: Event,
  data: NewRegistrationData
): Promise<Registration> {
  return prisma.$transaction(async (tx) => {
    let status: "CONFIRMED" | "WAITLISTED" = "CONFIRMED"

    if (event.capacity !== null) {
      // 先對這一筆 Event 加資料庫行鎖（SELECT ... FOR UPDATE）再計算名額。
      // PostgreSQL 預設隔離等級是 READ COMMITTED，單純把 count + create 包進
      // transaction 並不能阻止兩筆併發交易同時讀到「還有名額」而雙雙寫入
      // CONFIRMED（超賣）。加上行鎖後，同一場活動的報名交易會在這裡排隊
      // 序列化處理；不同活動鎖的是不同列，互不影響。
      // 不限名額（capacity 為 null）的活動一律 CONFIRMED，沒有競爭問題，
      // 不需要上鎖，避免無謂的序列化。
      await tx.$queryRaw`SELECT id FROM "Event" WHERE id = ${event.id} FOR UPDATE`

      const confirmedCount = await tx.registration.count({
        where: { eventId: event.id, status: "CONFIRMED" },
      })
      if (confirmedCount >= event.capacity) {
        status = "WAITLISTED"
      }
    }

    return tx.registration.create({
      data: {
        eventId: event.id,
        name: data.name,
        email: data.email,
        phone: data.phone,
        branch: data.branch,
        note: data.note,
        status,
      },
    })
  })
}
