/**
 * 候補轉正工具（人工備援）
 *
 * C1 上線後，調高名額（活動編輯）與取消報名（attendees 頁）都會
 * 自動遞補候補，正常情況不需要這支腳本；保留作為異常狀態的人工
 * 補救工具（例如信寄失敗後需要重新確認名單、或歷史資料修復）。
 *
 * 轉正邏輯與上線程式碼共用同一份 src/lib/promotion.ts（FIFO、
 * 與報名端同一把 Event 行鎖），這裡只是包上 CLI 與預演模式。
 *
 * 用法（在專案根目錄）：
 *   預演（只顯示會轉正誰，不寫入不寄信）：
 *     npx tsx scripts/promote-waitlisted.ts <eventId>
 *   正式執行（寫入＋寄信）：
 *     NEXT_PUBLIC_APP_URL=https://noyi-event.vercel.app \
 *       npx tsx scripts/promote-waitlisted.ts <eventId> --execute
 *
 * 注意：QR Code 內容是 NEXT_PUBLIC_APP_URL + /checkin/<token>。本機 .env
 * 是 localhost，直接執行寄出的 QR 會指向本機而完全無法用，所以 --execute
 * 時強制要求 NEXT_PUBLIC_APP_URL 不能是 localhost（如上覆蓋成正式站網址）。
 */
import "dotenv/config"

import { prisma } from "../src/lib/prisma"
import {
  promoteWaitlistedInTx,
  sendPromotionEmails,
} from "../src/lib/promotion"

async function main() {
  const [eventId, flag] = process.argv.slice(2)
  const execute = flag === "--execute"

  if (!eventId) {
    console.error("用法：npx tsx scripts/promote-waitlisted.ts <eventId> [--execute]")
    process.exit(1)
  }

  if (execute && (process.env.NEXT_PUBLIC_APP_URL ?? "").includes("localhost")) {
    console.error(
      "NEXT_PUBLIC_APP_URL 目前指向 localhost，寄出的 QR Code 會無法使用。\n" +
        "請以正式站網址執行：NEXT_PUBLIC_APP_URL=https://noyi-event.vercel.app npx tsx scripts/promote-waitlisted.ts " +
        `${eventId} --execute`
    )
    process.exit(1)
  }

  // 鎖內計算可轉正名單；--execute 時在同一交易內完成狀態更新
  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "Event" WHERE id = ${eventId} FOR UPDATE`
    if (rows.length === 0) return { kind: "not_found" as const }

    const event = await tx.event.findUniqueOrThrow({ where: { id: eventId } })
    const confirmedCount = await tx.registration.count({
      where: { eventId, status: "CONFIRMED" },
    })

    const promotable = await promoteWaitlistedInTx(tx, event, {
      dryRun: !execute,
    })

    return { kind: "ok" as const, event, confirmedCount, promotable }
  }, { maxWait: 10_000, timeout: 15_000 })

  if (result.kind === "not_found") {
    console.error(`找不到活動 ${eventId}`)
    process.exit(1)
  }

  const { event, confirmedCount, promotable } = result
  console.log(
    `活動「${event.title}」狀態=${event.status} 名額=${event.capacity} 已確認=${confirmedCount} → 可轉正 ${promotable.length} 位：`
  )
  for (const r of promotable) {
    console.log(`  - ${r.name} <${r.email}>（報名於 ${r.createdAt.toISOString()}）`)
  }

  if (!execute) {
    console.log("\n（預演模式：未寫入、未寄信。確認名單無誤後加上 --execute 正式執行）")
    await prisma.$disconnect()
    return
  }

  console.log("\n狀態已更新為 CONFIRMED，開始寄送報名成功確認信（含 QR Code）…")
  const report = await sendPromotionEmails(promotable, event)

  console.log(
    `\n完成：轉正 ${promotable.length} 位、寄信成功 ${report.sent} 封、失敗 ${report.failures.length} 封`
  )
  if (report.failures.length > 0) {
    console.log("失敗名單（狀態已是 CONFIRMED，請手動補寄或處理）：")
    for (const f of report.failures) {
      console.log(`  - ${f.name} <${f.email}>：${f.reason}`)
    }
  }

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error("執行失敗:", err)
  process.exit(1)
})
