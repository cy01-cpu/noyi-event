/**
 * 07-08 邏輯審查兩項修正的驗證腳本：
 * 1. promoteWaitlistedInTx 現在遵守時間邊界——活動已結束後取消報名
 *    或調高名額，不應再自動把候補轉正、寄出過期活動的報到 QR Code。
 * 2. togglePaymentStatus 現在拒絕對已取消的報名切換繳費狀態，避免
 *    把已標記退費的紀錄變成「已退費卻查無繳費」的孤兒資料。
 *
 * 直接 import 上線用的函式，對 .env 資料庫發真實交易；測試資料
 * 在 finally 區塊自動清除。
 *
 * 執行：npx tsx scripts/logic-audit-fixes-test.ts
 */
import "dotenv/config"

import { prisma } from "../src/lib/prisma"
import { updateEventWithCapacityGuard, type GuardedEventUpdateData } from "../src/lib/events"
import { cancelRegistrationAndPromote } from "../src/lib/registration"
import { togglePaymentStatus } from "../src/app/events/[id]/attendees/actions"

const PREFIX = "【邏輯審查修正驗證・可刪】"
const HOUR = 60 * 60 * 1000
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
  console.log("邏輯審查修正驗證開始（資料庫：.env 的 DATABASE_URL）")

  // 活動結束已久（遠超過 2 小時報到緩衝），名額 1
  const event = await prisma.event.create({
    data: {
      title: `${PREFIX}結束已久`,
      startAt: new Date(Date.now() - 8 * HOUR),
      endAt: new Date(Date.now() - 6 * HOUR),
      capacity: 1,
      isPublic: false,
      status: "OPEN",
    },
  })

  try {
    // 直接寫入（繞過 insertRegistrationWithCapacityCheck，因為它現在
    // 本來就會擋已結束活動的新報名——這裡要佈局的是「事後補登的舊資料」）
    const confirmedReg = await prisma.registration.create({
      data: {
        eventId: event.id,
        name: "審查測試員A",
        email: "audit-fix-a@example.com",
        status: "CONFIRMED",
      },
    })
    const waitlistedReg = await prisma.registration.create({
      data: {
        eventId: event.id,
        name: "審查測試員B",
        email: "audit-fix-b@example.com",
        status: "WAITLISTED",
      },
    })

    // ── 情境 1：取消已結束活動的 CONFIRMED 報名，候補不應被自動轉正 ──
    console.log("\n▶ 情境 1：活動已結束，取消 CONFIRMED 報名")
    const cancelResult = await cancelRegistrationAndPromote(confirmedReg.id)
    assert(
      "取消成功",
      cancelResult.outcome === "cancelled",
      JSON.stringify(cancelResult)
    )
    assert(
      "沒有候補被轉正",
      cancelResult.outcome === "cancelled" && cancelResult.promoted.length === 0,
      cancelResult.outcome === "cancelled" ? JSON.stringify(cancelResult.promoted) : ""
    )
    const afterCancel = await prisma.registration.findUnique({
      where: { id: waitlistedReg.id },
    })
    assert(
      "候補者狀態仍是 WAITLISTED（沒被誤轉正寄出過期 QR Code）",
      afterCancel?.status === "WAITLISTED",
      afterCancel?.status
    )

    // ── 情境 2：調高已結束活動的名額，候補不應被自動轉正 ──
    console.log("\n▶ 情境 2：活動已結束，調高名額")
    const currentEvent = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
    })
    const editData: GuardedEventUpdateData = {
      title: currentEvent.title,
      description: currentEvent.description,
      location: currentEvent.location,
      startAt: currentEvent.startAt,
      endAt: currentEvent.endAt,
      capacity: 5,
      isPublic: currentEvent.isPublic,
      requirePayment: currentEvent.requirePayment,
      amountInCents: currentEvent.amount,
      status: currentEvent.status,
    }
    const editResult = await updateEventWithCapacityGuard(event.id, editData)
    assert(
      "更新成功",
      editResult.outcome === "updated",
      JSON.stringify(editResult)
    )
    assert(
      "調高名額沒有觸發候補轉正",
      editResult.outcome === "updated" && editResult.promoted.length === 0,
      editResult.outcome === "updated" ? JSON.stringify(editResult.promoted) : ""
    )
    const afterEdit = await prisma.registration.findUnique({
      where: { id: waitlistedReg.id },
    })
    assert(
      "候補者狀態仍是 WAITLISTED",
      afterEdit?.status === "WAITLISTED",
      afterEdit?.status
    )

    // ── 情境 3：對已取消的報名切換繳費狀態應被拒絕 ──
    console.log("\n▶ 情境 3：對已取消的報名切換繳費狀態")
    // confirmedReg 已在情境 1 被取消為 CANCELLED，且尚未繳費（isPaid=false）
    const toggleResult = await togglePaymentStatus(confirmedReg.id, true, "測試操作者")
    assert(
      "被拒絕，不是 success",
      toggleResult.success === false,
      JSON.stringify(toggleResult)
    )
    const afterToggle = await prisma.registration.findUnique({
      where: { id: confirmedReg.id },
    })
    assert(
      "isPaid 沒有被改動",
      afterToggle?.isPaid === false,
      String(afterToggle?.isPaid)
    )
  } finally {
    await prisma.checkIn.deleteMany({ where: { registration: { eventId: event.id } } })
    await prisma.registration.deleteMany({ where: { eventId: event.id } })
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
