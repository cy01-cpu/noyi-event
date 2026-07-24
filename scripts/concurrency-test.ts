/**
 * A1 併發鎖定驗證腳本
 *
 * 直接 import 上線用的 insertRegistrationWithCapacityCheck（報名端）與
 * updateEventWithCapacityGuard（編輯端），對 .env 指向的資料庫發出真實的
 * 併發交易，驗證 Event 行鎖是否真的擋住雙向競爭。測的就是上線的程式碼，
 * 不是另外複製的一份邏輯。
 *
 * 執行方式（會在資料庫建立測試活動，結束後自動清除）：
 *   npx tsx scripts/concurrency-test.ts
 */
import "dotenv/config"

import { prisma } from "../src/lib/prisma"
import { insertRegistrationWithCapacityCheck } from "../src/lib/registration"
import {
  updateEventWithCapacityGuard,
  type GuardedEventUpdateData,
} from "../src/lib/events"

const TEST_TITLE_PREFIX = "【併發測試・可刪】"

let passed = 0
let failed = 0

function assert(label: string, condition: boolean, detail: string) {
  if (condition) {
    passed += 1
    console.log(`  ✅ ${label}`)
  } else {
    failed += 1
    console.error(`  ❌ ${label} — ${detail}`)
  }
}

function makeRegistrant(n: number) {
  return {
    name: `測試員${n}`,
    email: `concurrency-test-${n}@example.com`,
    phone: null,
    branch: null,
    note: null,
  }
}

async function createTestEvent(capacity: number | null) {
  return prisma.event.create({
    data: {
      title: `${TEST_TITLE_PREFIX}${new Date().toISOString()}`,
      startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      capacity,
      status: "OPEN",
    },
  })
}

function editDataFrom(
  event: Awaited<ReturnType<typeof createTestEvent>>,
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
    status: event.status,
    formFields: [],
    ...overrides,
  }
}

// 測試一：純報名側競爭 —— 名額 2、同時湧入 6 筆報名，
// 正確結果必須恰好 2 筆 CONFIRMED、4 筆 WAITLISTED（不可超賣）。
async function testRegistrationRace() {
  console.log("\n▶ 測試一：6 筆併發報名搶 2 個名額（防超賣）")
  const event = await createTestEvent(2)

  const results = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      insertRegistrationWithCapacityCheck(event.id, makeRegistrant(i + 1))
    )
  )

  const created = results.filter((r) => r.outcome === "created")
  const confirmed = created.filter(
    (r) => r.registration.status === "CONFIRMED"
  ).length
  const waitlisted = created.filter(
    (r) => r.registration.status === "WAITLISTED"
  ).length

  assert(
    "6 筆全部寫入成功",
    created.length === 6,
    `實際寫入 ${created.length} 筆`
  )
  assert(
    "恰好 2 筆 CONFIRMED（沒有超賣、也沒有少賣）",
    confirmed === 2,
    `實際 CONFIRMED ${confirmed} 筆`
  )
  assert(
    "其餘 4 筆 WAITLISTED",
    waitlisted === 4,
    `實際 WAITLISTED ${waitlisted} 筆`
  )
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// 一輪「5 筆報名 vs 把名額 10 調成 3」的競速。
// editDelayMs / regDelayMs 用來對「誰先送出」加抖動或定向偏置——
// 純粹用同一個 Promise.all 齊發時，編輯要贏必須是 6 個交易中第一個
// 搶到行鎖的（機率頂多 1/6），只靠重跑很難觀察到「編輯先贏」的結局，
// 因此除了隨機抖動的公平競速外，另設計一輪讓編輯先發的定向情境。
async function runRaceRound(options: {
  editDelayMs: number
  regDelayMs: number
}) {
  const event = await createTestEvent(10)

  for (let i = 0; i < 3; i++) {
    await insertRegistrationWithCapacityCheck(event.id, makeRegistrant(100 + i))
  }

  const editPromise = (async () => {
    if (options.editDelayMs > 0) await sleep(options.editDelayMs)
    const result = await updateEventWithCapacityGuard(
      event.id,
      editDataFrom(event, { capacity: 3 })
    )
    return { result, endedAt: Date.now() }
  })()

  const registrationPromises = Array.from({ length: 5 }, (_, i) =>
    (async () => {
      if (options.regDelayMs > 0) await sleep(options.regDelayMs)
      const startedAt = Date.now()
      const result = await insertRegistrationWithCapacityCheck(
        event.id,
        makeRegistrant(200 + i)
      )
      return { result, startedAt }
    })()
  )

  const [edit, ...registrations] = await Promise.all([
    editPromise,
    ...registrationPromises,
  ])

  const finalEvent = await prisma.event.findUniqueOrThrow({
    where: { id: event.id },
  })
  const finalConfirmed = await prisma.registration.count({
    where: { eventId: event.id, status: "CONFIRMED" },
  })

  // 有任何一筆報名在編輯交易結束前就已送出，代表兩者確實在途重疊，
  // 是真的併發競爭，不是先後各跑各的
  const overlapped = registrations.some((r) => r.startedAt < edit.endedAt)

  return {
    editOutcome: edit.result.outcome,
    registrationResults: registrations.map((r) => r.result),
    finalCapacity: finalEvent.capacity,
    finalConfirmed,
    overlapped,
  }
}

type RaceRoundReport = Awaited<ReturnType<typeof runRaceRound>>

// 每一輪不論誰贏都必須成立的不變量
function assertRoundInvariants(label: string, round: RaceRoundReport) {
  assert(
    `${label}：CONFIRMED 數 ≤ 最終名額（無回溯超賣）`,
    round.finalCapacity !== null &&
      round.finalConfirmed <= round.finalCapacity,
    `CONFIRMED ${round.finalConfirmed} > 名額 ${round.finalCapacity}`
  )
  assert(
    `${label}：編輯結果與最終名額一致（成功→3；被下限檢查拒絕→維持 10）`,
    (round.editOutcome === "updated" && round.finalCapacity === 3) ||
      (round.editOutcome === "capacity_below_confirmed" &&
        round.finalCapacity === 10),
    `編輯=${round.editOutcome}、名額=${round.finalCapacity}`
  )
  assert(
    `${label}：5 筆報名全部有寫入（不足名額者轉候補而非報錯）`,
    round.registrationResults.every((r) => r.outcome === "created"),
    `結果：${round.registrationResults.map((r) => r.outcome).join(", ")}`
  )
}

// 測試二：報名 vs 編輯調低名額的雙向競爭 —— 名額 10、已有 3 筆 CONFIRMED，
// 同時湧入 5 筆報名 + 1 個「把名額調成 3」的編輯。
// 先跑多輪帶隨機抖動的公平競速（兩種結局都合法，超賣不合法）；
// 若「編輯先贏」沒有自然出現，再跑定向情境強制觀察它一次。
async function testRegistrationVsEditRace() {
  console.log(
    "\n▶ 測試二：5 筆併發報名 vs 同時把名額 10 調低成 3（雙向競爭，多輪競速）"
  )

  const MAX_ROUNDS = 8
  let editWins = 0
  let registrationWins = 0

  for (let round = 1; round <= MAX_ROUNDS; round++) {
    const result = await runRaceRound({
      editDelayMs: Math.floor(Math.random() * 30),
      regDelayMs: Math.floor(Math.random() * 30),
    })
    const winner =
      result.editOutcome === "updated" ? "編輯先贏" : "報名先贏"
    if (result.editOutcome === "updated") editWins += 1
    else registrationWins += 1

    console.log(
      `  回合 ${round}：${winner}（編輯=${result.editOutcome}，名額=${result.finalCapacity}，CONFIRMED=${result.finalConfirmed}，在途重疊=${result.overlapped ? "是" : "否"}）`
    )
    assertRoundInvariants(`回合 ${round}`, result)

    // 兩種結局都已觀察到就不用再燒回合
    if (editWins > 0 && registrationWins > 0) break
  }

  console.log(
    `  （統計：編輯先贏 ${editWins} 輪、報名先贏 ${registrationWins} 輪）`
  )

  // 公平競速中「編輯先贏」沒出現的話，定向製造它：編輯零延遲先發、
  // 報名延遲 30ms 跟上。編輯交易含多次資料庫往返（遠端 Neon 單趟就不止
  // 30ms），報名送出時編輯交易大概率仍在途持鎖，報名會在行鎖上排隊、
  // 鎖內重讀到調低後的新名額 —— 這正是要驗證的路徑。
  if (editWins === 0) {
    console.log("  公平競速中編輯未曾先贏，改跑定向情境（編輯先發 30ms）：")
    let directed: RaceRoundReport | null = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await runRaceRound({ editDelayMs: 0, regDelayMs: 30 })
      console.log(
        `  定向第 ${attempt} 次：編輯=${result.editOutcome}，名額=${result.finalCapacity}，CONFIRMED=${result.finalConfirmed}，在途重疊=${result.overlapped ? "是" : "否"}`
      )
      assertRoundInvariants(`定向第 ${attempt} 次`, result)
      if (result.editOutcome === "updated") {
        directed = result
        break
      }
    }

    assert(
      "「編輯先贏」的結局至少被觀察到一次",
      directed !== null,
      "定向情境跑了 3 次編輯仍未先取得鎖，請檢查鎖競爭行為"
    )
    if (directed) {
      assert(
        "編輯先贏時：名額成功調成 3，且緊接的 5 筆報名鎖內重讀到新名額、全部轉候補",
        directed.finalCapacity === 3 &&
          directed.finalConfirmed === 3 &&
          directed.registrationResults.every(
            (r) =>
              r.outcome === "created" &&
              r.registration.status === "WAITLISTED"
          ),
        `名額=${directed.finalCapacity}、CONFIRMED=${directed.finalConfirmed}、報名狀態=${directed.registrationResults
          .map((r) =>
            r.outcome === "created" ? r.registration.status : r.outcome
          )
          .join(", ")}`
      )
    }
  } else {
    // 公平競速就出現過編輯先贏——editWins 那幾輪的
    // assertRoundInvariants 已驗證名額=3 與報名不超賣
    assert("「編輯先贏」的結局至少被觀察到一次", true, "")
  }
}

// 測試三：鎖內重讀 status —— 快速檢查通過後活動被關閉的邊界。
// 活動先 CLOSED 再報名，必須回 not_open（驗證交易內用的是鎖後最新 status）。
async function testClosedEventRejected() {
  console.log("\n▶ 測試三：已關閉活動的報名必須被交易內重讀擋下")
  const event = await createTestEvent(10)
  await prisma.event.update({
    where: { id: event.id },
    data: { status: "CLOSED" },
  })

  const result = await insertRegistrationWithCapacityCheck(
    event.id,
    makeRegistrant(300)
  )
  assert(
    "回傳 not_open，未寫入任何報名",
    result.outcome === "not_open",
    `實際回傳 ${result.outcome}`
  )
}

async function cleanup() {
  const testEvents = await prisma.event.findMany({
    where: { title: { startsWith: TEST_TITLE_PREFIX } },
    select: { id: true },
  })
  const ids = testEvents.map((e) => e.id)
  if (ids.length === 0) return
  await prisma.registration.deleteMany({ where: { eventId: { in: ids } } })
  await prisma.event.deleteMany({ where: { id: { in: ids } } })
  console.log(`\n🧹 已清除 ${ids.length} 筆測試活動與其報名資料`)
}

async function main() {
  console.log("A1 併發鎖定驗證開始（資料庫：.env 的 DATABASE_URL）")
  try {
    await testRegistrationRace()
    await testRegistrationVsEditRace()
    await testClosedEventRejected()
  } finally {
    await cleanup()
    await prisma.$disconnect()
  }

  console.log(`\n結果：${passed} 項通過、${failed} 項失敗`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error("測試執行失敗:", err)
  process.exit(1)
})
