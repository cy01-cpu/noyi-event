/**
 * 自訂報名表單欄位驗證腳本
 *
 * 直接 import 上線用的 updateEventWithCapacityGuard、
 * insertRegistrationWithCapacityCheck，對 .env 資料庫發真實交易，
 * 涵蓋欄位鎖定規則（無報名可自由編輯／有報名後既有欄位凍結但可
 * 繼續新增）與報名時的動態答案驗證。測試資料在 finally 區塊自動清除。
 *
 * 執行：npx tsx scripts/custom-fields-test.ts
 */
import "dotenv/config"

import { prisma } from "../src/lib/prisma"
import {
  updateEventWithCapacityGuard,
  type GuardedEventUpdateData,
  type FormFieldInput,
} from "../src/lib/events"
import { insertRegistrationWithCapacityCheck } from "../src/lib/registration"
import { eventFormFieldSchema } from "../src/lib/validations/event-form-field"
import type { Event } from "@prisma/client"

const PREFIX = "【自訂欄位驗證・可刪】"
let passed = 0
let failed = 0

function assert(label: string, cond: boolean, detail = "") {
  if (cond) {
    passed++
    console.log(`  ✅ ${label}`)
  } else {
    failed++
    console.error(`  ❌ ${label} — ${detail}`)
  }
}

function editData(
  event: Event,
  formFields: FormFieldInput[]
): GuardedEventUpdateData {
  return {
    title: event.title,
    description: event.description,
    location: event.location,
    startAt: event.startAt,
    endAt: event.endAt,
    capacity: event.capacity,
    isPublic: event.isPublic,
    requirePayment: event.requirePayment,
    amountInCents: event.amount,
    status: event.status,
    formFields,
  }
}

async function main() {
  console.log("自訂欄位驗證開始（資料庫：.env 的 DATABASE_URL）")

  console.log("\n▶ 情境 0：必填 CHECKBOX 在 schema 層級就不可能被建立")
  const r0 = eventFormFieldSchema.safeParse({
    label: "是否需要接駁車",
    type: "CHECKBOX",
    required: true,
    options: [],
  })
  assert("必填 CHECKBOX 被 schema 擋下", !r0.success)

  const event = await prisma.event.create({
    data: {
      title: `${PREFIX}${new Date().toISOString()}`,
      startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      isPublic: false,
      status: "OPEN",
    },
  })

  try {
    console.log("\n▶ 情境 1：無報名，自由新增兩個欄位")
    const r1 = await updateEventWithCapacityGuard(
      event.id,
      editData(event, [
        { label: "葷素", type: "SELECT", required: true, options: ["葷食", "素食"] },
        { label: "同行人數", type: "TEXT", required: false, options: [] },
      ])
    )
    assert("更新成功", r1.outcome === "updated", JSON.stringify(r1))
    let fields = await prisma.eventFormField.findMany({
      where: { eventId: event.id },
      orderBy: { order: "asc" },
    })
    assert("寫入 2 個欄位", fields.length === 2, String(fields.length))
    assert("順序正確（葷素在前）", fields[0]?.label === "葷素")

    console.log("\n▶ 情境 2：無報名，修改內容並刪除其中一個欄位")
    const r2 = await updateEventWithCapacityGuard(
      event.id,
      editData(event, [
        {
          id: fields[0].id,
          label: "葷素（必填）",
          type: "SELECT",
          required: true,
          options: ["葷食", "素食", "不拘"],
        },
      ])
    )
    assert("更新成功", r2.outcome === "updated", JSON.stringify(r2))
    fields = await prisma.eventFormField.findMany({
      where: { eventId: event.id },
      orderBy: { order: "asc" },
    })
    assert(
      "剩 1 個欄位（同行人數被真的刪除）",
      fields.length === 1,
      String(fields.length)
    )
    assert(
      "內容已更新為「葷素（必填）」",
      fields[0]?.label === "葷素（必填）",
      fields[0]?.label
    )
    const veggieField = fields[0]

    console.log("\n▶ 情境 3：建立 CONFIRMED 報名後，鎖定生效")
    await prisma.registration.create({
      data: {
        eventId: event.id,
        name: "欄位測試員",
        email: "field-lock-test@example.com",
        status: "CONFIRMED",
      },
    })
    const r3 = await updateEventWithCapacityGuard(
      event.id,
      editData(event, [
        // 嘗試竄改既有欄位內容——應被忽略
        {
          id: veggieField.id,
          label: "被竄改的標籤",
          type: "TEXT",
          required: false,
          options: [],
        },
        // 新增欄位——應該成功插入並排在最後
        { label: "是否吃辣", type: "SELECT", required: false, options: ["是", "否"] },
      ])
    )
    assert("更新成功", r3.outcome === "updated", JSON.stringify(r3))
    const fieldsAfterLock = await prisma.eventFormField.findMany({
      where: { eventId: event.id },
      orderBy: { order: "asc" },
    })
    assert(
      "欄位數變成 2（既有 1 個沒被刪，新增 1 個）",
      fieldsAfterLock.length === 2,
      String(fieldsAfterLock.length)
    )
    assert(
      "既有欄位內容沒被竄改",
      fieldsAfterLock[0]?.id === veggieField.id &&
        fieldsAfterLock[0]?.label === "葷素（必填）",
      JSON.stringify(fieldsAfterLock[0])
    )
    assert(
      "新欄位排在既有欄位之後",
      fieldsAfterLock[1]?.label === "是否吃辣",
      fieldsAfterLock[1]?.label
    )

    console.log("\n▶ 情境 4：有報名後，嘗試刪除既有欄位會被忽略")
    const r4 = await updateEventWithCapacityGuard(
      event.id,
      editData(event, [
        // 清單裡故意不包含既有兩個欄位，模擬「想刪除」的意圖
      ])
    )
    assert("更新成功", r4.outcome === "updated", JSON.stringify(r4))
    const fieldsAfterDeleteAttempt = await prisma.eventFormField.findMany({
      where: { eventId: event.id },
    })
    assert(
      "既有欄位仍在（刪除意圖被忽略）",
      fieldsAfterDeleteAttempt.length === 2,
      String(fieldsAfterDeleteAttempt.length)
    )

    console.log("\n▶ 情境 5：報名時自訂欄位動態驗證")
    const requiredFieldId = veggieField.id
    const r5ok = await insertRegistrationWithCapacityCheck(event.id, {
      name: "報名驗證員1",
      email: "field-reg-1@example.com",
      phone: null,
      branch: null,
      note: null,
      customFieldValues: { [requiredFieldId]: "素食" },
    })
    assert(
      "必填欄位有填答案，報名成功",
      r5ok.outcome === "created",
      JSON.stringify(r5ok)
    )
    if (r5ok.outcome === "created") {
      assert(
        "customFields 正確寫入答案",
        (r5ok.registration.customFields as Record<string, unknown> | null)?.[
          requiredFieldId
        ] === "素食",
        JSON.stringify(r5ok.registration.customFields)
      )
    }

    const r5missing = await insertRegistrationWithCapacityCheck(event.id, {
      name: "報名驗證員2",
      email: "field-reg-2@example.com",
      phone: null,
      branch: null,
      note: null,
      customFieldValues: {},
    })
    assert(
      "必填欄位沒填，回傳 invalid_custom_fields",
      r5missing.outcome === "invalid_custom_fields",
      JSON.stringify(r5missing)
    )

    const r5invalid = await insertRegistrationWithCapacityCheck(event.id, {
      name: "報名驗證員3",
      email: "field-reg-3@example.com",
      phone: null,
      branch: null,
      note: null,
      customFieldValues: { [requiredFieldId]: "不存在的選項" },
    })
    assert(
      "SELECT 傳入無效選項，回傳 invalid_custom_fields",
      r5invalid.outcome === "invalid_custom_fields",
      JSON.stringify(r5invalid)
    )

    const r5noFields = await insertRegistrationWithCapacityCheck(event.id, {
      name: "報名驗證員4",
      email: "field-reg-4@example.com",
      phone: null,
      branch: null,
      note: null,
      // 不帶 customFieldValues（比照舊呼叫端，如併發測試腳本）
    })
    assert(
      "必填欄位沒帶 customFieldValues 也一樣被擋（不是繞過驗證的漏洞）",
      r5noFields.outcome === "invalid_custom_fields",
      JSON.stringify(r5noFields)
    )
  } finally {
    await prisma.checkIn.deleteMany({
      where: { registration: { eventId: event.id } },
    })
    await prisma.registration.deleteMany({ where: { eventId: event.id } })
    await prisma.eventFormField.deleteMany({ where: { eventId: event.id } })
    await prisma.event.delete({ where: { id: event.id } })
    await prisma.$disconnect()
    console.log("\n🧹 已清除測試資料")
  }

  console.log(`\n結果：${passed} 項通過、${failed} 項失敗`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error("測試執行失敗:", err)
  process.exit(1)
})
