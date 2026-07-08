import type { Event, EventStatus, Prisma, Registration } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import { promoteWaitlistedInTx } from "@/lib/promotion"
import type { FormFieldTypeValue } from "@/lib/validations/event-form-field"

export type FormFieldInput = {
  id?: string
  label: string
  type: FormFieldTypeValue
  required: boolean
  options: string[]
}

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
  // 必填、刻意不給預設值：呼叫端必須明確帶入「這次想要的完整欄位
  // 清單」（沒有報名時會整批換掉，見 applyFormFieldChanges）。如果
  // 允許省略並暗自預設成空陣列，將來新增的呼叫端只要忘記帶這個參數，
  // 就會在每次編輯活動時把既有自訂欄位全部清空而不自知。
  formFields: FormFieldInput[]
}

// 自訂報名欄位的鎖定規則：還沒有任何報名時可以自由新增/編輯/刪除/
// 排序；只要活動已有任何報名（不論狀態，含候補/已取消，與繳費鎖定
// 同一個 hasRegistrations 判斷），既有欄位的內容與順序一律凍結——
// client 送出的變更或刪除意圖直接忽略，只有沒有 id 的新欄位會被
// 插入，排在所有既有欄位之後。這樣「新增問題」與「不能竄改舊答案
// 所依附的欄位定義」分開處理：承辦人事後想到新問題還能繼續加，
// 但已經有人依據舊題目回答過的欄位不會被改到面目全非。
async function applyFormFieldChanges(
  tx: Prisma.TransactionClient,
  eventId: string,
  hasRegistrations: boolean,
  fields: FormFieldInput[]
) {
  if (!hasRegistrations) {
    // 還沒有任何報名，沒有東西依賴既有欄位 id，整批換掉最簡單
    await tx.eventFormField.deleteMany({ where: { eventId } })
    if (fields.length > 0) {
      await tx.eventFormField.createMany({
        data: fields.map((f, i) => ({
          eventId,
          label: f.label,
          type: f.type,
          required: f.required,
          options: f.options,
          order: i,
        })),
      })
    }
    return
  }

  const existing = await tx.eventFormField.findMany({
    where: { eventId },
    select: { id: true, order: true },
  })
  const existingIds = new Set(existing.map((f) => f.id))
  let nextOrder = existing.reduce((max, f) => Math.max(max, f.order), -1) + 1

  const newFields = fields.filter((f) => !f.id || !existingIds.has(f.id))

  if (newFields.length > 0) {
    await tx.eventFormField.createMany({
      data: newFields.map((f) => ({
        eventId,
        label: f.label,
        type: f.type,
        required: f.required,
        options: f.options,
        order: nextOrder++,
      })),
    })
  }
}

export type GuardedEventUpdateResult =
  // promoted：本次更新在同一交易內自動轉正的候補名單（C1 自動 FIFO 遞補）。
  // 寄信不在交易內做，呼叫端拿到名單後在交易外寄轉正通知信。
  | { outcome: "updated"; event: Event; promoted: Registration[] }
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

    await applyFormFieldChanges(tx, eventId, hasRegistrations, data.formFields)

    const updated = await tx.event.update({
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

    // 名額調高（或先前名額釋出而卡住的候補）在同一把行鎖交易內
    // 依報名順序自動轉正——與報名成立同一套先到先得規則，
    // 候補通知信也已向報名者承諾「有名額釋出將另行通知」。
    // 名額沒有多出來時是 no-op。
    const promoted = await promoteWaitlistedInTx(tx, updated)

    return { outcome: "updated", event: updated, promoted }
  }, {
    // 與報名端同一把行鎖排隊，放寬逾時的理由見 src/lib/registration.ts
    maxWait: 10_000,
    timeout: 15_000,
  })
}
