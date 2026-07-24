/**
 * B2 驗證：報到有效窗關閉後，「取消報到」的畫面與後端行為是否正確切換。
 *
 * 用 Playwright 開真的瀏覽器，比較兩種情境：
 * 情境 A（窗口仍開）：已報到的報名應該顯示可互動的「取消報到」兩段式
 * 確認按鈕，文字維持「當事人需重新掃碼才能再次報到」。
 * 情境 B（窗口已關閉）：已報到的報名不應該顯示任何可點擊按鈕，改顯示
 * 「報到時間已截止，無法取消報到」的說明文字；即使繞過前端直接呼叫
 * undoCheckIn action，後端也要拒絕並且不刪除 CheckIn 紀錄。
 *
 * 執行：npx tsx scripts/real-click-undo-checkin-window-test.ts（需先啟動 npm run dev）
 */
import "dotenv/config"
import { chromium } from "playwright"
import { prisma } from "../src/lib/prisma"
import { undoCheckIn } from "../src/app/events/[id]/attendees/actions"

const BASE_URL = "http://localhost:3000"
const PREFIX = "【B2窗口驗證・可刪】"

async function main() {
  const adminPasscode = process.env.ADMIN_PASSCODE
  if (!adminPasscode) throw new Error("ADMIN_PASSCODE 未設定")

  let passed = 0
  let failed = 0
  function check(label: string, ok: boolean) {
    if (ok) {
      console.log(`  ✅ ${label}`)
      passed++
    } else {
      console.log(`  ❌ ${label}`)
      failed++
    }
  }

  // 情境 A：進行中活動，報到窗仍開
  const openEvent = await prisma.event.create({
    data: {
      title: `${PREFIX}進行中`,
      startAt: new Date(Date.now() - 60 * 60 * 1000),
      endAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
      status: "OPEN",
    },
  })
  const openRegistration = await prisma.registration.create({
    data: { eventId: openEvent.id, name: `${PREFIX}窗口內`, email: "b2-open@example.com", status: "CONFIRMED" },
  })
  await prisma.checkIn.create({ data: { registrationId: openRegistration.id } })

  // 情境 B：早已結束的活動（結束超過 2 小時緩衝），報到窗已關閉，但已有 CheckIn 紀錄
  const closedEvent = await prisma.event.create({
    data: {
      title: `${PREFIX}已結束`,
      startAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      endAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
      status: "CLOSED",
    },
  })
  const closedRegistration = await prisma.registration.create({
    data: { eventId: closedEvent.id, name: `${PREFIX}窗口外`, email: "b2-closed@example.com", status: "CONFIRMED" },
  })
  await prisma.checkIn.create({ data: { registrationId: closedRegistration.id } })

  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()

    console.log("▶ 情境 A：報到窗仍開")
    await page.goto(`${BASE_URL}/admin-login?from=/events/${openEvent.id}/attendees`)
    await page.fill("#passcode", adminPasscode)
    await page.getByRole("button", { name: "進入" }).click()
    await page.waitForURL(`${BASE_URL}/events/${openEvent.id}/attendees`, { timeout: 60000 })

    check(
      "顯示可點擊的「取消報到」按鈕",
      (await page.getByRole("button", { name: "取消報到" }).count()) === 1
    )
    check(
      "沒有顯示「報到時間已截止」文字",
      (await page.getByText("報到時間已截止", { exact: false }).count()) === 0
    )
    await page.getByRole("button", { name: "取消報到" }).click()
    check(
      "確認文字維持「當事人需重新掃碼才能再次報到」",
      await page.getByText("當事人需重新掃碼才能再次報到", { exact: false }).isVisible()
    )

    console.log("▶ 情境 B：報到窗已關閉")
    await page.goto(`${BASE_URL}/events/${closedEvent.id}/attendees`)

    check(
      "沒有顯示可點擊的「取消報到」按鈕",
      (await page.getByRole("button", { name: "取消報到" }).count()) === 0
    )
    check(
      "改顯示「報到時間已截止，無法取消報到」說明文字",
      await page.getByText("報到時間已截止，無法取消報到", { exact: false }).isVisible()
    )

    // 後端防線：即使繞過前端直接呼叫 action，也要拒絕且不刪除 CheckIn 紀錄
    const bypassResult = await undoCheckIn(closedRegistration.id)
    check("後端直接呼叫 undoCheckIn 也會拒絕（success=false）", bypassResult.success === false)
    const stillCheckedIn = await prisma.checkIn.findUnique({
      where: { registrationId: closedRegistration.id },
    })
    check("CheckIn 紀錄沒有被刪除", stillCheckedIn !== null)
  } finally {
    await browser.close()
    await prisma.checkIn.deleteMany({
      where: { registrationId: { in: [openRegistration.id, closedRegistration.id] } },
    })
    await prisma.registration.deleteMany({
      where: { id: { in: [openRegistration.id, closedRegistration.id] } },
    })
    await prisma.event.deleteMany({ where: { id: { in: [openEvent.id, closedEvent.id] } } })
    console.log("🧹 已清除測試資料")
  }

  console.log(`\n結果：${passed} 項通過、${failed} 項失敗`)
  if (failed > 0) process.exit(1)
}

main().finally(() => prisma.$disconnect())
