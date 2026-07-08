/**
 * 真實模擬「工作人員在 /checkin/[token] 頁面操作」的驗證腳本
 *
 * 用 Playwright 開真的瀏覽器，全程真的登入表單 → 真的頁面導航 →
 * 真的點擊畫面上的按鈕（觸發 Server Action），而不是直接 import
 * performCheckIn／confirmCheckIn 呼叫函式。
 *
 * 情境 A（結束已久，複現原始事故）：活動 7 天前已結束，用真的瀏覽器
 * 開啟報到頁，驗證畫面直接顯示「已結束」文字、且「確認報到」按鈕
 * 根本沒有渲染出來（介面層擋下，原事故不會再重演）；並確認資料庫
 * 沒有寫入。
 *
 * 情境 B（進行中，正向對照）：活動進行中，真的點擊「確認報到」按鈕，
 * 驗證 Server Action 全鏈路（按鈕 → confirmCheckIn → performCheckIn）
 * 真的能寫入報到紀錄，證明情境 A 沒寫入不是因為按鈕/登入本身壞掉。
 *
 * 執行：npx tsx scripts/real-click-checkin-test.ts（需先啟動 npm run dev，
 * 且測試資料在 finally 區塊自動清除）
 */
import "dotenv/config"
import { chromium } from "playwright"
import { prisma } from "../src/lib/prisma"

const BASE_URL = "http://localhost:3000"
const PREFIX = "【真實點擊測試・可刪】"

async function loginAndGoto(page: import("playwright").Page, token: string, adminPasscode: string) {
  await page.goto(`${BASE_URL}/admin-login?from=/checkin/${token}`)
  await page.fill("#passcode", adminPasscode)
  await page.getByRole("button", { name: "進入" }).click()
  await page.waitForURL(`${BASE_URL}/checkin/${token}`, { timeout: 10000 })
}

async function main() {
  const adminPasscode = process.env.ADMIN_PASSCODE
  if (!adminPasscode) throw new Error("ADMIN_PASSCODE 未設定")

  const endedEvent = await prisma.event.create({
    data: {
      title: `${PREFIX}結束已久`,
      startAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 天前
      endAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 天前結束
      isPublic: false,
      status: "OPEN",
    },
  })
  const endedReg = await prisma.registration.create({
    data: {
      eventId: endedEvent.id,
      name: "真實點擊測試員A",
      email: "real-click-test-a@example.com",
      status: "CONFIRMED",
    },
  })

  const ongoingEvent = await prisma.event.create({
    data: {
      title: `${PREFIX}進行中`,
      startAt: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 小時前開始
      endAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 小時後結束
      isPublic: false,
      status: "OPEN",
    },
  })
  const ongoingReg = await prisma.registration.create({
    data: {
      eventId: ongoingEvent.id,
      name: "真實點擊測試員B",
      email: "real-click-test-b@example.com",
      status: "CONFIRMED",
    },
  })

  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    // ── 情境 A：結束已久，複現原始事故 ──
    await loginAndGoto(page, endedReg.token, adminPasscode)

    const endedMessage = page.getByText("活動已結束，報到時間已截止")
    await endedMessage.waitFor({ state: "visible", timeout: 10000 })
    console.log("✅ [A] 畫面正確顯示「活動已結束，報到時間已截止」")

    const buttonCount = await page.getByRole("button", { name: "確認報到" }).count()
    if (buttonCount > 0) {
      console.error("❌ [A]「確認報到」按鈕竟然還渲染出來了！")
      process.exitCode = 1
    } else {
      console.log("✅ [A]「確認報到」按鈕沒有渲染（介面層已擋下，無法點擊）")
    }

    const endedCheckIn = await prisma.checkIn.findUnique({
      where: { registrationId: endedReg.id },
    })
    if (endedCheckIn) {
      console.error("❌ [A] 資料庫竟然被寫入報到紀錄！", endedCheckIn)
      process.exitCode = 1
    } else {
      console.log("✅ [A] 資料庫確認沒有寫入報到紀錄")
    }

    // ── 情境 B：進行中，正向對照（證明按鈕與 Server Action 鏈路本身是通的）──
    await loginAndGoto(page, ongoingReg.token, adminPasscode)

    const confirmButton = page.getByRole("button", { name: "確認報到" })
    await confirmButton.waitFor({ state: "visible", timeout: 10000 })
    await confirmButton.click()

    const checkedInBadge = page.getByText(/已於 .* 報到/)
    await checkedInBadge.waitFor({ state: "visible", timeout: 10000 })
    console.log("✅ [B] 真實點擊後畫面顯示「已於 ... 報到」")

    const ongoingCheckIn = await prisma.checkIn.findUnique({
      where: { registrationId: ongoingReg.id },
    })
    if (ongoingCheckIn) {
      console.log("✅ [B] 資料庫確認真的寫入報到紀錄，全鏈路（按鈕→confirmCheckIn→performCheckIn）驗證通過")
    } else {
      console.error("❌ [B] 進行中活動點擊按鈕後，資料庫竟然沒有寫入！")
      process.exitCode = 1
    }
  } catch (err) {
    await page
      .screenshot({ path: "scripts/real-click-failure.png" })
      .catch(() => {})
    throw err
  } finally {
    await browser.close().catch(() => {})
    const ids = [endedEvent.id, ongoingEvent.id]
    await prisma.checkIn.deleteMany({ where: { registration: { eventId: { in: ids } } } })
    await prisma.registration.deleteMany({ where: { eventId: { in: ids } } })
    await prisma.event.deleteMany({ where: { id: { in: ids } } })
    await prisma.$disconnect()
    console.log("🧹 已清除測試資料")
  }
}

main().catch((err) => {
  console.error("測試執行失敗:", err)
  process.exit(1)
})
