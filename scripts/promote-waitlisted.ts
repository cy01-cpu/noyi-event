/**
 * 候補轉正工具（C1 功能進入後台前的正式人工操作介面）
 *
 * 依報名順序（先到先得）把候補轉為已確認，並寄出與正常報名成功
 * 完全相同的確認信（含 QR Code 報到憑證）。
 *
 * 轉正筆數 = 目前名額 − 已確認人數，在與報名端同一把 Event 行鎖的
 * 交易內計算與寫入，轉正當下有人同時報名也不會超賣。
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
import { sendRegistrationConfirmation } from "../src/lib/email/registration-confirmation"

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
      { id: string; capacity: number | null; status: string }[]
    >`SELECT id, capacity, status FROM "Event" WHERE id = ${eventId} FOR UPDATE`
    if (rows.length === 0) return { kind: "not_found" as const }

    const { capacity, status } = rows[0]
    const event = await tx.event.findUniqueOrThrow({ where: { id: eventId } })

    const confirmedCount = await tx.registration.count({
      where: { eventId, status: "CONFIRMED" },
    })
    // capacity 為 null（不限名額）理論上不會有候補，防禦性處理成全部轉正
    const slots =
      capacity === null ? Number.MAX_SAFE_INTEGER : capacity - confirmedCount

    const promotable = await tx.registration.findMany({
      where: { eventId, status: "WAITLISTED" },
      orderBy: { createdAt: "asc" },
      take: Math.max(slots, 0),
    })

    if (execute && promotable.length > 0) {
      await tx.registration.updateMany({
        where: { id: { in: promotable.map((r) => r.id) } },
        data: { status: "CONFIRMED" },
      })
    }

    return {
      kind: "ok" as const,
      event,
      eventStatus: status,
      capacity,
      confirmedCount,
      promotable,
    }
  }, { maxWait: 10_000, timeout: 15_000 })

  if (result.kind === "not_found") {
    console.error(`找不到活動 ${eventId}`)
    process.exit(1)
  }

  const { event, eventStatus, capacity, confirmedCount, promotable } = result
  console.log(
    `活動「${event.title}」狀態=${eventStatus} 名額=${capacity} 已確認=${confirmedCount} → 可轉正 ${promotable.length} 位：`
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
  let sent = 0
  const failures: { name: string; email: string; reason: string }[] = []
  for (const r of promotable) {
    try {
      // 寄信用轉正後的狀態（CONFIRMED 才會走含 QR Code 的成功信版型）
      await sendRegistrationConfirmation({ ...r, status: "CONFIRMED" }, event)
      sent += 1
      console.log(`  ✅ 已寄出：${r.name} <${r.email}>`)
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      failures.push({ name: r.name, email: r.email, reason })
      console.error(`  ❌ 寄送失敗：${r.name} <${r.email}> — ${reason}`)
    }
  }

  console.log(`\n完成：轉正 ${promotable.length} 位、寄信成功 ${sent} 封、失敗 ${failures.length} 封`)
  if (failures.length > 0) {
    console.log("失敗名單（狀態已是 CONFIRMED，請手動補寄或處理）：")
    for (const f of failures) console.log(`  - ${f.name} <${f.email}>：${f.reason}`)
  }

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error("執行失敗:", err)
  process.exit(1)
})
