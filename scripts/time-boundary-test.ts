/**
 * 報名/報到時間邊界驗證腳本
 *
 * 直接 import 上線用的 insertRegistrationWithCapacityCheck 與
 * performCheckIn，對 .env 資料庫驗證時間邊界規則（src/lib/event-time.ts）：
 * - 報名開放到活動結束為止（沒填 endAt 則活動當天有效）
 * - 報到有效窗＝活動當天 00:00 ～ 結束後 2 小時
 *
 * 執行：npx tsx scripts/time-boundary-test.ts（測試資料自動清除）
 */
import "dotenv/config"

import { prisma } from "../src/lib/prisma"
import { insertRegistrationWithCapacityCheck } from "../src/lib/registration"
import { performCheckIn } from "../src/lib/checkin"

const PREFIX = "【時間邊界測試・可刪】"
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

function createEvent(name: string, startAt: Date, endAt: Date | null) {
  return prisma.event.create({
    data: {
      title: `${PREFIX}${name}`,
      startAt,
      endAt,
      isPublic: false,
      status: "OPEN",
    },
  })
}

function createConfirmedReg(eventId: string, n: number) {
  return prisma.registration.create({
    data: {
      eventId,
      name: `邊界測試員${n}`,
      email: `time-boundary-${n}@example.com`,
      status: "CONFIRMED",
    },
  })
}

const registrant = (n: number) => ({
  name: `邊界報名員${n}`,
  email: `time-boundary-reg-${n}@example.com`,
  phone: null,
  branch: null,
  note: null,
})

async function main() {
  console.log("時間邊界驗證開始（資料庫：.env 的 DATABASE_URL）")
  const now = Date.now()

  try {
    // ── 報名邊界 ──
    console.log("\n▶ 報名一：活動已結束（endAt 一小時前）→ 擋下")
    const ended = await createEvent(
      "已結束",
      new Date(now - 4 * HOUR),
      new Date(now - 1 * HOUR)
    )
    const r1 = await insertRegistrationWithCapacityCheck(ended.id, registrant(1))
    assert("回傳 ended，未寫入報名", r1.outcome === "ended", r1.outcome)

    console.log("\n▶ 報名二：沒填結束時間、活動日已過 → 擋下")
    const noEnd = await createEvent("無結束時間", new Date(now - 26 * HOUR), null)
    const r2 = await insertRegistrationWithCapacityCheck(noEnd.id, registrant(2))
    assert("回傳 ended（活動當天結束即截止）", r2.outcome === "ended", r2.outcome)

    console.log("\n▶ 報名三：活動進行中 → 照常報名（保留現場臨時加報）")
    const ongoing = await createEvent(
      "進行中",
      new Date(now - 1 * HOUR),
      new Date(now + 2 * HOUR)
    )
    const r3 = await insertRegistrationWithCapacityCheck(ongoing.id, registrant(3))
    assert("報名成功", r3.outcome === "created", r3.outcome)

    console.log("\n▶ 報名四：未來活動 → 照常報名")
    const future = await createEvent("未來", new Date(now + 48 * HOUR), null)
    const r4 = await insertRegistrationWithCapacityCheck(future.id, registrant(4))
    assert("報名成功", r4.outcome === "created", r4.outcome)

    // ── 報到邊界 ──
    console.log("\n▶ 報到一：活動進行中 → 報到成功")
    const c1reg = await createConfirmedReg(ongoing.id, 1)
    const c1 = await performCheckIn(c1reg.token)
    assert("報到成功", c1.success === true, JSON.stringify(c1))

    console.log("\n▶ 報到二：活動結束 1 小時內（2 小時緩衝內）→ 補登成功")
    const justEnded = await createEvent(
      "剛結束",
      new Date(now - 4 * HOUR),
      new Date(now - 1 * HOUR)
    )
    const c2reg = await createConfirmedReg(justEnded.id, 2)
    const c2 = await performCheckIn(c2reg.token)
    assert("緩衝內報到成功", c2.success === true, JSON.stringify(c2))

    console.log("\n▶ 報到三：活動結束超過 2 小時 → 擋下且不寫入")
    const longEnded = await createEvent(
      "結束已久",
      new Date(now - 6 * HOUR),
      new Date(now - 3 * HOUR)
    )
    const c3reg = await createConfirmedReg(longEnded.id, 3)
    const c3 = await performCheckIn(c3reg.token)
    assert(
      "回傳 outside_window",
      !c3.success && c3.reason === "outside_window",
      JSON.stringify(c3)
    )
    const c3db = await prisma.checkIn.findUnique({
      where: { registrationId: c3reg.id },
    })
    assert("資料庫沒有報到紀錄", c3db === null, "被寫入了")

    console.log("\n▶ 報到四：活動日還沒到（兩天後）→ 擋下")
    const c4reg = await createConfirmedReg(future.id, 4)
    const c4 = await performCheckIn(c4reg.token)
    assert(
      "回傳 outside_window（opensAt 在未來）",
      !c4.success &&
        c4.reason === "outside_window" &&
        c4.opensAt.getTime() > now,
      JSON.stringify(c4)
    )
  } finally {
    const ids = (
      await prisma.event.findMany({
        where: { title: { startsWith: PREFIX } },
        select: { id: true },
      })
    ).map((e) => e.id)
    await prisma.checkIn.deleteMany({
      where: { registration: { eventId: { in: ids } } },
    })
    await prisma.registration.deleteMany({ where: { eventId: { in: ids } } })
    await prisma.event.deleteMany({ where: { id: { in: ids } } })
    console.log(`\n🧹 已清除 ${ids.length} 筆測試活動`)
    await prisma.$disconnect()
  }

  console.log(`\n結果：${passed} 項通過、${failed} 項失敗`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error("測試執行失敗:", err)
  process.exit(1)
})
