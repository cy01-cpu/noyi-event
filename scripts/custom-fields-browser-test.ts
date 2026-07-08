/**
 * 自訂報名表單欄位——真實瀏覽器端到端驗證
 *
 * 用 Playwright 走一次完整流程：登入 → 建立活動時加兩個自訂題目
 * → 公開報名頁真的填表送出（先漏填必填欄位驗證擋下，再正確送出）
 * → 報到名單頁確認答案顯示 → 回編輯頁確認既有題目變唯讀、仍可加新題目。
 *
 * 執行：npx tsx scripts/custom-fields-browser-test.ts（需先啟動 npm run dev，
 * 測試資料在 finally 區塊自動清除）
 */
import "dotenv/config"
import { chromium } from "playwright"
import { prisma } from "../src/lib/prisma"

const BASE_URL = "http://localhost:3000"
const PREFIX = "【真瀏覽器驗證・可刪】"

async function main() {
  const adminPasscode = process.env.ADMIN_PASSCODE
  if (!adminPasscode) throw new Error("ADMIN_PASSCODE 未設定")

  const browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()
  let eventId: string | undefined

  try {
    // 1) 登入
    await page.goto(`${BASE_URL}/admin-login?from=/events/new`)
    await page.fill("#passcode", adminPasscode)
    await page.getByRole("button", { name: "進入" }).click()
    await page.waitForURL(`${BASE_URL}/events/new`, { timeout: 60000 })

    // 2) 建立活動，加兩個自訂題目：SELECT 必填 + TEXT 選填
    await page.fill('input[placeholder*="尾牙"]', `${PREFIX}${Date.now()}`)
    // 開始時間用 DateTimePicker（Popover + Calendar），直接點「今天」這一格即可，
    // 不需要是未來日期——報名/報到時間邊界判斷的是「今天結束前」，測試不受影響
    await page.getByRole("button", { name: "選擇日期" }).first().click()
    const todayLabel = String(new Date().getDate())
    // react-day-picker 的 aria-label 是完整日期字串（非純數字），role
    // 比對抓不到，改用可見文字比對
    await page.getByText(todayLabel, { exact: true }).click()
    await page.keyboard.press("Escape")

    await page.getByRole("button", { name: "新增題目" }).click()
    const firstRow = page.getByTestId("form-field-row").first()
    await firstRow.locator('input[placeholder="例如：葷素"]').fill("葷素")
    await firstRow.getByRole("combobox").first().click()
    await page.getByRole("option", { name: "單選" }).click()
    await firstRow
      .locator('input[placeholder="例如：葷食, 素食"]')
      .fill("葷食, 素食")
    await firstRow.getByRole("switch").click() // 必填

    await page.getByRole("button", { name: "新增題目" }).click()
    const secondRow = page.getByTestId("form-field-row").nth(1)
    await secondRow
      .locator('input[placeholder="例如：葷素"]')
      .fill("同行人數")

    // 新活動預設狀態是草稿，要選「開放報名」才能真的走公開報名流程
    await page.getByRole("combobox").filter({ hasText: "草稿" }).click()
    await page.getByRole("option", { name: "開放報名" }).click()

    await page.getByRole("button", { name: "建立活動" }).click()
    await page.waitForURL(`${BASE_URL}/events`, { timeout: 60000 })
    console.log("✅ [建立] 活動建立成功並帶自訂題目")

    const created = await prisma.event.findFirst({
      where: { title: { startsWith: PREFIX } },
      orderBy: { createdAt: "desc" },
    })
    if (!created) throw new Error("找不到剛建立的測試活動")
    eventId = created.id
    const fields = await prisma.eventFormField.findMany({
      where: { eventId },
      orderBy: { order: "asc" },
    })
    if (fields.length !== 2) {
      throw new Error(`預期 2 個自訂欄位，實際 ${fields.length} 個`)
    }
    console.log("✅ [建立] 資料庫確認寫入 2 個自訂欄位")

    // 3) 公開報名頁：先漏填必填欄位，確認被前端擋下不送出
    const registerUrl = `${BASE_URL}/events/${eventId}/register`
    await page.goto(registerUrl)
    await page.getByLabel("姓名").fill("瀏覽器測試員")
    await page.getByLabel("Email").fill("browser-test@example.com")
    await page.getByRole("button", { name: "送出報名" }).click()
    await page
      .locator('p[data-slot="form-message"]', { hasText: "請選擇：葷素" })
      .waitFor({ state: "visible", timeout: 15000 })
    console.log("✅ [報名] 必填自訂欄位沒填，前端驗證正確擋下")

    // 4) 補填必填欄位，正確送出
    await page.getByRole("combobox").filter({ hasText: "請選擇：葷素" }).click()
    await page.getByRole("option", { name: "素食", exact: true }).click()
    await page.getByRole("button", { name: "送出報名" }).click()
    await page
      .getByText("報名成功", { exact: true })
      .waitFor({ state: "visible", timeout: 60000 })
    console.log("✅ [報名] 補填後真的送出成功")

    // 5) 報到名單頁確認答案顯示
    await page.goto(`${BASE_URL}/events/${eventId}/attendees`)
    await page
      .getByText("葷素：素食")
      .waitFor({ state: "visible", timeout: 60000 })
    console.log("✅ [名單] 報到名單頁正確顯示「葷素：素食」")

    // 6) 回編輯頁：既有題目變唯讀，仍可新增第三題
    await page.goto(`${BASE_URL}/events/${eventId}/edit`)
    await page
      .getByText("已有人報名，這題無法修改")
      .first()
      .waitFor({ state: "visible", timeout: 60000 })
    const lockedCount = await page.getByTestId("form-field-row-locked").count()
    if (lockedCount !== 2) {
      throw new Error(`預期 2 個題目被鎖定唯讀，實際 ${lockedCount} 個`)
    }
    console.log("✅ [編輯] 已有報名後，既有 2 個題目正確變成唯讀")

    await page.getByRole("button", { name: "新增題目" }).click()
    const newRow = page.getByTestId("form-field-row").last()
    await newRow.locator('input[placeholder="例如：葷素"]').fill("是否吃辣")
    await page.getByRole("button", { name: "儲存變更" }).click()
    await page.waitForURL(`${BASE_URL}/events`, { timeout: 60000 })

    const fieldsAfterLockedAdd = await prisma.eventFormField.findMany({
      where: { eventId },
    })
    if (fieldsAfterLockedAdd.length !== 3) {
      throw new Error(
        `預期已鎖定狀態下仍能新增到 3 個欄位，實際 ${fieldsAfterLockedAdd.length} 個`
      )
    }
    console.log("✅ [編輯] 已鎖定狀態下仍成功新增第三個題目，原本 2 個沒被動到")

    console.log("\n🎉 全部情境通過")
  } catch (err) {
    await page
      .screenshot({ path: "scripts/custom-fields-browser-failure.png" })
      .catch(() => {})
    throw err
  } finally {
    await browser.close().catch(() => {})
    if (eventId) {
      await prisma.checkIn.deleteMany({
        where: { registration: { eventId } },
      })
      await prisma.registration.deleteMany({ where: { eventId } })
      await prisma.eventFormField.deleteMany({ where: { eventId } })
      await prisma.event.delete({ where: { id: eventId } })
    }
    await prisma.$disconnect()
    console.log("🧹 已清除測試資料")
  }
}

main().catch((err) => {
  console.error("測試執行失敗:", err)
  process.exit(1)
})
