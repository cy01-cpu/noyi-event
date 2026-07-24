/**
 * 真實模擬「工作人員在報到名單頁按下取消報到」的驗證腳本
 *
 * 用 Playwright 開真的瀏覽器，全程真的登入 → 真的導航到報到名單頁 →
 * 真的點擊「取消報到」按鈕（觸發 undoCheckIn Server Action），而不是
 * 直接 import 函式呼叫。
 *
 * 情境：已報到的報名，兩段式確認流程——
 * 1. 第一次點擊「取消報到」只展開確認文字，CheckIn 紀錄不會被刪除
 * 2. 點「保留」可以收回，CheckIn 紀錄仍在（誤觸可以反悔）
 * 3. 再次點擊「取消報到」→「確定取消」才真正刪除 CheckIn 紀錄，
 *    畫面變回「尚未報到」，且該筆報名可以重新報到（驗證取消報到
 *    不會遺留任何擋住重新報到的殘留狀態）。
 *
 * 執行：npx tsx scripts/real-click-undo-checkin-test.ts（需先啟動 npm run dev，
 * 且測試資料在 finally 區塊自動清除）
 */
import "dotenv/config"
import { chromium } from "playwright"
import { prisma } from "../src/lib/prisma"
import { performCheckIn } from "../src/lib/checkin"

const BASE_URL = "http://localhost:3000"
const PREFIX = "【取消報到真點擊測試・可刪】"

async function main() {
  const adminPasscode = process.env.ADMIN_PASSCODE
  if (!adminPasscode) throw new Error("ADMIN_PASSCODE 未設定")

  const event = await prisma.event.create({
    data: {
      title: `${PREFIX}進行中活動`,
      startAt: new Date(Date.now() - 60 * 60 * 1000), // 1 小時前開始
      endAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 小時後結束
      status: "OPEN",
    },
  })
  const registration = await prisma.registration.create({
    data: {
      eventId: event.id,
      name: `${PREFIX}測試人員`,
      email: "undo-checkin-test@example.com",
      status: "CONFIRMED",
    },
  })

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

  const browser = await chromium.launch()
  try {
    const checkInResult = await performCheckIn(registration.token)
    if (!checkInResult.success) {
      throw new Error("測試前置：報到寫入失敗，無法繼續")
    }

    const page = await browser.newPage()
    await page.goto(
      `${BASE_URL}/admin-login?from=/events/${event.id}/attendees`
    )
    await page.fill("#passcode", adminPasscode)
    await page.getByRole("button", { name: "進入" }).click()
    await page.waitForURL(`${BASE_URL}/events/${event.id}/attendees`, {
      timeout: 15000,
    })

    console.log("▶ 情境：已報到的報名，兩段式確認取消報到")

    check(
      "點擊前畫面顯示「已報到」",
      await page.getByText("已報到", { exact: true }).first().isVisible()
    )

    // 第一次點擊只展開確認文字，不應該真的刪除 CheckIn 紀錄
    await page.getByRole("button", { name: "取消報到" }).click()
    await page.getByRole("button", { name: "確定取消" }).waitFor({ timeout: 5000 })

    const afterFirstClick = await prisma.checkIn.findUnique({
      where: { registrationId: registration.id },
    })
    check("第一次點擊後 CheckIn 紀錄仍在（尚未真正刪除）", afterFirstClick !== null)

    // 點「保留」應該收回確認狀態，紀錄仍完好
    await page.getByRole("button", { name: "保留" }).click()
    await page.getByRole("button", { name: "取消報到" }).waitFor({ timeout: 5000 })
    const afterCancelConfirm = await prisma.checkIn.findUnique({
      where: { registrationId: registration.id },
    })
    check("點「保留」後 CheckIn 紀錄仍在（誤觸可反悔）", afterCancelConfirm !== null)

    // 再次點擊，這次真的按下「確定取消」
    await page.getByRole("button", { name: "取消報到" }).click()
    await page.getByRole("button", { name: "確定取消" }).click()
    // Server Action 觸發 revalidatePath，等畫面重新渲染成「尚未報到」
    await page.getByText("尚未報到", { exact: true }).first().waitFor({ timeout: 10000 })

    check(
      "確定取消後畫面顯示「尚未報到」",
      await page.getByText("尚未報到", { exact: true }).first().isVisible()
    )
    check(
      "確定取消後「取消報到」按鈕消失",
      (await page.getByRole("button", { name: "取消報到" }).count()) === 0
    )

    const afterUndo = await prisma.checkIn.findUnique({
      where: { registrationId: registration.id },
    })
    check("資料庫確認 CheckIn 紀錄已被刪除", afterUndo === null)

    // 驗證取消報到後可以重新報到（沒有留下擋住重新報到的殘留狀態）
    const reCheckIn = await performCheckIn(registration.token)
    check("取消報到後可以重新報到", reCheckIn.success === true)
  } finally {
    await browser.close()
    await prisma.checkIn.deleteMany({ where: { registrationId: registration.id } })
    await prisma.registration.delete({ where: { id: registration.id } })
    await prisma.event.delete({ where: { id: event.id } })
    console.log("🧹 已清除測試資料")
  }

  console.log(`\n結果：${passed} 項通過、${failed} 項失敗`)
  if (failed > 0) process.exit(1)
}

main().finally(() => prisma.$disconnect())
