/**
 * M1 一次性資料補正：把既有報名資料中含連字號/空白的電話正規化
 * （與 validations/registration.ts 的儲存前正規化規則一致）。
 *
 * 逐筆 update 而非一句 SQL 的原因：正規化後可能撞上
 * (eventId, email, name, phone) 的 unique 約束（同一人先後用
 * 「0912-345-678」和「0912345678」報了兩筆）。這種衝突代表資料庫裡
 * 真的存在重複報名，該由承辦人決定留哪筆，腳本只列出來不擅自刪。
 *
 * 執行：npx tsx scripts/normalize-phones.ts
 * 可重複執行（冪等），跑完會回報剩餘未正規化筆數供驗證（應為 0，
 * 或等於待人工處理的衝突筆數）。
 */
import "dotenv/config"

import { Prisma } from "@prisma/client"

import { prisma } from "../src/lib/prisma"

async function main() {
  const withPhone = await prisma.registration.findMany({
    where: { phone: { not: null } },
    select: {
      id: true,
      phone: true,
      name: true,
      email: true,
      eventId: true,
    },
  })

  const dirty = withPhone.filter((r) => /[-\s]/.test(r.phone!))
  console.log(
    `共 ${withPhone.length} 筆報名有填電話，其中 ${dirty.length} 筆需正規化`
  )

  let fixed = 0
  const conflicts: typeof dirty = []

  for (const r of dirty) {
    const normalized = r.phone!.replace(/[-\s]/g, "")
    try {
      await prisma.registration.update({
        where: { id: r.id },
        data: { phone: normalized },
      })
      fixed += 1
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        conflicts.push(r)
        continue
      }
      throw err
    }
  }

  console.log(`已修正 ${fixed} 筆`)

  if (conflicts.length > 0) {
    console.log(
      `\n⚠️ 以下 ${conflicts.length} 筆正規化後會與既有報名重複（同一人用不同電話格式重複報名），請人工決定去留：`
    )
    for (const c of conflicts) {
      console.log(
        `  - ${c.name} <${c.email}> 電話「${c.phone}」（registrationId=${c.id}, eventId=${c.eventId}）`
      )
    }
  }

  // 驗證：跑完後資料庫不應再有含 - 或空白的電話（衝突保留筆除外）
  const remaining = await prisma.registration.findMany({
    where: {
      OR: [{ phone: { contains: "-" } }, { phone: { contains: " " } }],
    },
    select: { id: true },
  })
  console.log(
    `\n驗證：資料庫剩餘未正規化電話 ${remaining.length} 筆（預期＝衝突保留的 ${conflicts.length} 筆）`
  )

  await prisma.$disconnect()
  if (remaining.length !== conflicts.length) process.exit(1)
}

main().catch((err) => {
  console.error("補正執行失敗:", err)
  process.exit(1)
})
