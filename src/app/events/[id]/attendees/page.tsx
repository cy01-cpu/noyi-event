import Link from "next/link"
import { format } from "date-fns"

import { prisma } from "@/lib/prisma"
import { Badge } from "@/components/ui/badge"
import { TogglePaidButton } from "./toggle-paid-button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const registrationStatusLabel: Record<string, string> = {
  PENDING: "待處理",
  CONFIRMED: "已確認",
  CANCELLED: "已取消",
  WAITLISTED: "候補中",
}

export default async function AttendeesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await prisma.event.findUnique({ where: { id } })

  if (!event) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-lg font-medium">找不到此活動</p>
      </div>
    )
  }

  const registrations = await prisma.registration.findMany({
    where: { eventId: id },
    include: { checkIn: true },
    orderBy: { createdAt: "asc" },
  })

  const sorted = [...registrations].sort((a, b) => {
    if (Boolean(a.checkIn) === Boolean(b.checkIn)) return 0
    return a.checkIn ? -1 : 1
  })

  const checkedInCount = registrations.filter((r) => r.checkIn).length

  // 「應繳」的計算基準採 status=CONFIRMED 的筆數：候補中（名額釋出前
  // 不確定能否參加）與已取消的報名，不應被要求繳費，計入只會讓
  // 對帳目標失真。已繳費筆數則不分狀態直接數 isPaid（若候補者提前
  // 繳了費仍如實呈現，交由承辦人自行判斷處理）。
  const confirmedCount = registrations.filter(
    (r) => r.status === "CONFIRMED"
  ).length
  const paidCount = registrations.filter((r) => r.isPaid).length

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link
        href="/events"
        className="mb-4 inline-block text-sm text-muted-foreground hover:underline"
      >
        ← 返回活動列表
      </Link>

      <h1 className="mb-1 text-xl font-semibold">{event.title}・報到名單</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        總報名人數 {registrations.length} ・ 已報到 {checkedInCount}
        {event.requirePayment &&
          ` ・ 已繳費 ${paidCount} / 應繳 ${confirmedCount}`}
      </p>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>姓名</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>報名狀態</TableHead>
              <TableHead>報到狀態</TableHead>
              {event.requirePayment && <TableHead>繳費狀態</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={event.requirePayment ? 5 : 4}
                  className="py-8 text-center text-muted-foreground"
                >
                  目前還沒有人報名
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.email}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {registrationStatusLabel[r.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {r.checkIn
                      ? `已報到・${format(r.checkIn.checkedAt, "yyyy/MM/dd HH:mm")}${
                          r.checkIn.gate ? `・${r.checkIn.gate}` : ""
                        }`
                      : "尚未報到"}
                  </TableCell>
                  {event.requirePayment && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">
                          {r.isPaid
                            ? `已繳費${r.paidAt ? `（${format(r.paidAt, "MM/dd")}）` : ""}`
                            : "未繳費"}
                        </span>
                        <TogglePaidButton
                          registrationId={r.id}
                          isPaid={r.isPaid}
                        />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
