/**
 * C1 候補自動轉正＋取消報名 驗證腳本
 * 直接 import 上線用的 updateEventWithCapacityGuard 與
 * cancelRegistrationAndPromote，對 .env 資料庫發真實交易。
 * 測試活動結束後自動清除。
 */
import "dotenv/config"

import { prisma } from "../src/lib/prisma"
import { updateEventWithCapacityGuard, type GuardedEventUpdateData } from "../src/lib/events"
import {
  insertRegistrationWithCapacityCheck,
  cancelRegistrationAndPromote,
  setRefundStatus,
} from "../src/lib/registration"

const PREFIX = "【C1驗證・可刪】"
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

function reg(n: number) {
  return {
    name: `C1測試員${n}`,
    email: `c1-verify-${n}@example.com`,
    phone: null,
    branch: null,
    note: null,
  }
}

function editData(
  event: { title: string; description: string | null; location: string | null; startAt: Date; endAt: Date | null; capacity: number | null; requirePayment: boolean; amount: number | null; status: string },
  overrides: Partial<GuardedEventUpdateData>
): GuardedEventUpdateData {
  return {
    title: event.title,
    description: event.description,
    location: event.location,
    startAt: event.startAt,
    endAt: event.endAt,
    capacity: event.capacity,
    requirePayment: event.requirePayment,
    amountInCents: event.amount,
    status: event.status as GuardedEventUpdateData["status"],
    formFields: [],
    ...overrides,
  }
}

async function counts(eventId: string) {
  const [confirmed, waitlisted, cancelled] = await Promise.all([
    prisma.registration.count({ where: { eventId, status: "CONFIRMED" } }),
    prisma.registration.count({ where: { eventId, status: "WAITLISTED" } }),
    prisma.registration.count({ where: { eventId, status: "CANCELLED" } }),
  ])
  return { confirmed, waitlisted, cancelled }
}

async function main() {
  console.log("C1 驗證開始（資料庫：.env 的 DATABASE_URL）")

  const event = await prisma.event.create({
    data: {
      title: `${PREFIX}${new Date().toISOString()}`,
      startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      capacity: 2,
      status: "OPEN",
    },
  })

  try {
    // 佈局：名額 2、報 4 人 → 2 CONFIRMED / 2 WAITLISTED
    console.log("\n▶ 佈局：名額 2，依序報名 4 人")
    const regs = []
    for (let i = 1; i <= 4; i++) {
      const r = await insertRegistrationWithCapacityCheck(event.id, reg(i))
      if (r.outcome !== "created") throw new Error(`報名 ${i} 失敗: ${r.outcome}`)
      regs.push(r.registration)
    }
    let c = await counts(event.id)
    assert("2 CONFIRMED / 2 WAITLISTED", c.confirmed === 2 && c.waitlisted === 2, JSON.stringify(c))

    // 測試一：名額 2→3，應 FIFO 轉正第 3 位
    console.log("\n▶ 測試一：編輯名額 2→3 自動遞補")
    const r1 = await updateEventWithCapacityGuard(event.id, editData(event, { capacity: 3 }))
    assert("更新成功", r1.outcome === "updated", r1.outcome)
    if (r1.outcome === "updated") {
      assert("轉正恰 1 位", r1.promoted.length === 1, `${r1.promoted.length} 位`)
      assert(
        "轉正的是第 3 位報名者（FIFO）",
        r1.promoted[0]?.email === regs[2].email,
        r1.promoted[0]?.email ?? "無"
      )
    }
    c = await counts(event.id)
    assert("DB 為 3 CONFIRMED / 1 WAITLISTED", c.confirmed === 3 && c.waitlisted === 1, JSON.stringify(c))

    // 測試二：取消一位 CONFIRMED，第 4 位自動遞補
    console.log("\n▶ 測試二：取消 CONFIRMED 報名 → 自動遞補候補")
    const r2 = await cancelRegistrationAndPromote(regs[0].id)
    assert("取消成功", r2.outcome === "cancelled", r2.outcome)
    if (r2.outcome === "cancelled") {
      assert("遞補恰 1 位", r2.promoted.length === 1, `${r2.promoted.length} 位`)
      assert(
        "遞補的是第 4 位報名者",
        r2.promoted[0]?.email === regs[3].email,
        r2.promoted[0]?.email ?? "無"
      )
    }
    c = await counts(event.id)
    assert(
      "DB 為 3 CONFIRMED / 0 WAITLISTED / 1 CANCELLED",
      c.confirmed === 3 && c.waitlisted === 0 && c.cancelled === 1,
      JSON.stringify(c)
    )

    // 測試三：重複取消被擋
    console.log("\n▶ 測試三：重複取消")
    const r3 = await cancelRegistrationAndPromote(regs[0].id)
    assert("回傳 already_cancelled", r3.outcome === "already_cancelled", r3.outcome)

    // 測試四：取消候補者不觸發遞補
    console.log("\n▶ 測試四：取消 WAITLISTED 報名（不遞補、不影響名額）")
    const r5th = await insertRegistrationWithCapacityCheck(event.id, reg(5))
    if (r5th.outcome !== "created") throw new Error("第 5 位報名失敗")
    assert("第 5 位為候補", r5th.registration.status === "WAITLISTED", r5th.registration.status)
    const r4 = await cancelRegistrationAndPromote(r5th.registration.id)
    assert("取消成功且遞補 0 位", r4.outcome === "cancelled" && r4.promoted.length === 0,
      r4.outcome === "cancelled" ? `遞補 ${r4.promoted.length} 位` : r4.outcome)

    // 測試五：已報到者不可取消
    console.log("\n▶ 測試五：已報到的報名不可取消")
    await prisma.checkIn.create({ data: { registrationId: regs[1].id } })
    const r5 = await cancelRegistrationAndPromote(regs[1].id)
    assert("回傳 checked_in", r5.outcome === "checked_in", r5.outcome)

    // 測試六：已取消的活動調高名額不遞補
    console.log("\n▶ 測試六：CANCELLED 活動調高名額不遞補")
    const r6th = await insertRegistrationWithCapacityCheck(event.id, reg(6))
    if (r6th.outcome !== "created" || r6th.registration.status !== "WAITLISTED") {
      throw new Error("第 6 位候補佈局失敗")
    }
    const fresh = await prisma.event.findUniqueOrThrow({ where: { id: event.id } })
    const r6 = await updateEventWithCapacityGuard(
      event.id,
      editData(fresh, { capacity: 10, status: "CANCELLED" })
    )
    assert("更新成功", r6.outcome === "updated", r6.outcome)
    if (r6.outcome === "updated") {
      assert("遞補 0 位（活動已取消）", r6.promoted.length === 0, `${r6.promoted.length} 位`)
    }
    c = await counts(event.id)
    assert("候補仍為 1 位未被轉正", c.waitlisted === 1, JSON.stringify(c))

    // 測試七：改回 OPEN 的那次儲存自動補做遞補
    console.log("\n▶ 測試七：活動改回 OPEN 時補做遞補")
    const fresh2 = await prisma.event.findUniqueOrThrow({ where: { id: event.id } })
    const r7 = await updateEventWithCapacityGuard(
      event.id,
      editData(fresh2, { status: "OPEN" })
    )
    assert(
      "遞補 1 位（先前卡住的候補）",
      r7.outcome === "updated" && r7.promoted.length === 1,
      r7.outcome === "updated" ? `${r7.promoted.length} 位` : r7.outcome
    )

    // 測試八：取消已繳費的報名 → isPaid 保留、refunded=false（待退費）
    console.log("\n▶ 測試八：取消已繳費的報名 → 進入待退費狀態")
    await prisma.registration.update({
      where: { id: regs[3].id },
      data: { isPaid: true, paidAt: new Date(), paidBy: "測試站A" },
    })
    const r8 = await cancelRegistrationAndPromote(regs[3].id)
    assert("取消成功", r8.outcome === "cancelled", r8.outcome)
    const after8 = await prisma.registration.findUniqueOrThrow({
      where: { id: regs[3].id },
    })
    assert(
      "isPaid 維持 true（保留繳費歷史）、refunded=false（待退費）",
      after8.status === "CANCELLED" &&
        after8.isPaid === true &&
        after8.refunded === false &&
        after8.refundedAt === null,
      JSON.stringify({
        status: after8.status,
        isPaid: after8.isPaid,
        refunded: after8.refunded,
      })
    )

    // 測試九：標記已退費 → 記錄時間與經手人，isPaid 不被覆蓋
    console.log("\n▶ 測試九：標記已退費")
    const r9 = await setRefundStatus(regs[3].id, true, "測試站B")
    assert("標記成功", r9.outcome === "updated", r9.outcome)
    const after9 = await prisma.registration.findUniqueOrThrow({
      where: { id: regs[3].id },
    })
    assert(
      "refunded=true、refundedAt 有值、refundedBy=測試站B、isPaid 仍為 true",
      after9.refunded === true &&
        after9.refundedAt !== null &&
        after9.refundedBy === "測試站B" &&
        after9.isPaid === true,
      JSON.stringify({
        refunded: after9.refunded,
        refundedAt: after9.refundedAt,
        refundedBy: after9.refundedBy,
        isPaid: after9.isPaid,
      })
    )

    // 測試十：取消退費標記（點錯可復原）→ 時間與經手人一併清空
    console.log("\n▶ 測試十：取消退費標記")
    const r10 = await setRefundStatus(regs[3].id, false)
    const after10 = await prisma.registration.findUniqueOrThrow({
      where: { id: regs[3].id },
    })
    assert(
      "refunded=false、refundedAt/refundedBy 清空",
      r10.outcome === "updated" &&
        after10.refunded === false &&
        after10.refundedAt === null &&
        after10.refundedBy === null,
      JSON.stringify({
        outcome: r10.outcome,
        refunded: after10.refunded,
        refundedAt: after10.refundedAt,
        refundedBy: after10.refundedBy,
      })
    )

    // 測試十一：未繳費的報名不受退費機制影響、也不可標記退費
    console.log("\n▶ 測試十一：未繳費的報名與退費機制隔離")
    const unpaid = await prisma.registration.findUniqueOrThrow({
      where: { id: regs[0].id }, // 測試二取消的未繳費報名
    })
    assert(
      "先前的取消未動到退費欄位",
      unpaid.refunded === false &&
        unpaid.refundedAt === null &&
        unpaid.refundedBy === null,
      JSON.stringify({
        refunded: unpaid.refunded,
        refundedAt: unpaid.refundedAt,
      })
    )
    const r11 = await setRefundStatus(regs[0].id, true, "測試站C")
    assert(
      "標記退費被擋（回傳 not_paid）",
      r11.outcome === "not_paid",
      r11.outcome
    )
  } finally {
    // 清除測試資料
    await prisma.checkIn.deleteMany({
      where: { registration: { eventId: event.id } },
    })
    await prisma.registration.deleteMany({ where: { eventId: event.id } })
    await prisma.event.delete({ where: { id: event.id } })
    console.log("\n🧹 測試活動與報名資料已清除")
    await prisma.$disconnect()
  }

  console.log(`\n結果：${passed} 項通過、${failed} 項失敗`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error("驗證執行失敗:", err)
  process.exit(1)
})
