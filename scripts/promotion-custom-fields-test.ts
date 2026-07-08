/**
 * 驗證候補轉正是否正確保留自訂欄位答案（CTO 終局複審點 A）。
 * 情境：名額 1，先報名一位 CONFIRMED，一位帶自訂欄位答案的 WAITLISTED；
 * 取消 CONFIRMED 觸發自動遞補後，確認轉正的候補其 customFields 答案完整保留，
 * 且 sendPromotionEmails 不會因為 customFields 存在而出錯。
 *
 * 執行：npx tsx scripts/promotion-custom-fields-test.ts
 */
import "dotenv/config"

import { prisma } from "../src/lib/prisma"
import { insertRegistrationWithCapacityCheck } from "../src/lib/registration"
import { cancelRegistrationAndPromote } from "../src/lib/registration"

const PREFIX = "【轉正自訂欄位驗證・可刪】"
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

async function main() {
  console.log("候補轉正＋自訂欄位驗證開始（資料庫：.env 的 DATABASE_URL）")

  const event = await prisma.event.create({
    data: {
      title: `${PREFIX}${new Date().toISOString()}`,
      startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      isPublic: false,
      status: "OPEN",
      capacity: 1,
      formFields: {
        createMany: {
          data: [
            { label: "葷素", type: "SELECT", required: true, options: ["葷食", "素食"], order: 0 },
          ],
        },
      },
    },
  })

  try {
    const field = await prisma.eventFormField.findFirstOrThrow({
      where: { eventId: event.id },
    })

    console.log("\n▶ 報名 1：CONFIRMED（占滿唯一名額）")
    const r1 = await insertRegistrationWithCapacityCheck(event.id, {
      name: "先報名者",
      email: "promo-cf-1@example.com",
      phone: null,
      branch: null,
      note: null,
      customFieldValues: { [field.id]: "葷食" },
    })
    assert("報名 1 成功且為 CONFIRMED", r1.outcome === "created" && r1.registration.status === "CONFIRMED", JSON.stringify(r1))

    console.log("\n▶ 報名 2：帶自訂欄位答案，因額滿變 WAITLISTED")
    const r2 = await insertRegistrationWithCapacityCheck(event.id, {
      name: "候補帶答案者",
      email: "promo-cf-2@example.com",
      phone: null,
      branch: null,
      note: null,
      customFieldValues: { [field.id]: "素食" },
    })
    assert("報名 2 成功且為 WAITLISTED", r2.outcome === "created" && r2.registration.status === "WAITLISTED", JSON.stringify(r2))
    if (r2.outcome !== "created") throw new Error("報名 2 未成立，無法繼續")
    const waitlistedId = r2.registration.id

    console.log("\n▶ 取消 CONFIRMED，觸發自動遞補")
    if (r1.outcome !== "created") throw new Error("報名 1 未成立，無法繼續")
    const cancelResult = await cancelRegistrationAndPromote(r1.registration.id)
    assert("取消成功", cancelResult.outcome === "cancelled", JSON.stringify(cancelResult))
    if (cancelResult.outcome !== "cancelled") throw new Error("取消未成立，無法繼續")
    assert("恰好遞補 1 位", cancelResult.promoted.length === 1, String(cancelResult.promoted.length))
    const promotedReg = cancelResult.promoted[0]
    assert("遞補的是原本帶答案的候補者", promotedReg?.id === waitlistedId, promotedReg?.id)
    assert(
      "遞補名單中的 customFields 答案完整保留（未被轉正流程清空）",
      (promotedReg?.customFields as Record<string, unknown> | null)?.[field.id] === "素食",
      JSON.stringify(promotedReg?.customFields)
    )

    console.log("\n▶ 資料庫重讀確認轉正後狀態與答案一致")
    const afterPromotion = await prisma.registration.findUniqueOrThrow({
      where: { id: waitlistedId },
    })
    assert("狀態已變成 CONFIRMED", afterPromotion.status === "CONFIRMED", afterPromotion.status)
    assert(
      "資料庫內 customFields 答案仍是素食",
      (afterPromotion.customFields as Record<string, unknown> | null)?.[field.id] === "素食",
      JSON.stringify(afterPromotion.customFields)
    )

    console.log("\n▶ sendPromotionEmails 不因 customFields 存在而丟例外（RESEND 測試網域下寄信本身會失敗，只驗證不 throw／有走 email-failures 記錄路徑）")
    const { sendPromotionEmails } = await import("../src/lib/promotion")
    let threw = false
    try {
      await sendPromotionEmails(cancelResult.promoted, cancelResult.event)
    } catch {
      threw = true
    }
    assert("sendPromotionEmails 呼叫本身不拋出例外（失敗會被內部 catch 吸收並記錄）", !threw)
  } finally {
    await prisma.checkIn.deleteMany({ where: { registration: { eventId: event.id } } })
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
