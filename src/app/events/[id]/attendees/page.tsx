import Link from "next/link"
import { format } from "date-fns"

import { prisma } from "@/lib/prisma"
import { Badge } from "@/components/ui/badge"
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
      </p>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>姓名</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>報名狀態</TableHead>
              <TableHead>報到狀態</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
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
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
