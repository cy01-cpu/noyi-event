import Link from "next/link"
import { format } from "date-fns"

import { prisma } from "@/lib/prisma"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CopyRegisterLinkButton } from "@/components/copy-register-link-button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const statusLabel: Record<string, string> = {
  DRAFT: "草稿",
  OPEN: "開放報名",
  CLOSED: "已截止",
  CANCELLED: "已取消",
}

const statusBadgeClass: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  OPEN: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  CLOSED: "bg-secondary text-secondary-foreground",
  CANCELLED: "bg-destructive/10 text-destructive",
}

export default async function EventsPage() {
  const events = await prisma.event.findMany({
    orderBy: { createdAt: "desc" },
  })

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">活動列表</h1>
        <Button asChild>
          <Link href="/events/new">建立活動</Link>
        </Button>
      </div>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>活動名稱</TableHead>
              <TableHead>開始時間</TableHead>
              <TableHead>地點</TableHead>
              <TableHead>名額</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead>是否需繳費</TableHead>
              <TableHead>操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-muted-foreground"
                >
                  目前還沒有活動，點右上角「建立活動」開始新增
                </TableCell>
              </TableRow>
            ) : (
              events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="font-medium">{event.title}</TableCell>
                  <TableCell>
                    {format(event.startAt, "yyyy/MM/dd HH:mm")}
                  </TableCell>
                  <TableCell>{event.location ?? "—"}</TableCell>
                  <TableCell>{event.capacity ?? "不限"}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={statusBadgeClass[event.status]}
                    >
                      {statusLabel[event.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {event.requirePayment
                      ? `需繳費（NT$ ${((event.amount ?? 0) / 100).toLocaleString()}）`
                      : "免費"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <CopyRegisterLinkButton eventId={event.id} />
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/events/${event.id}/checkin-scan`}>
                          開始掃描
                        </Link>
                      </Button>
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/events/${event.id}/attendees`}>
                          報到名單
                        </Link>
                      </Button>
                    </div>
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
