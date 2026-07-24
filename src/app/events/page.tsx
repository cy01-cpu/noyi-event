import Link from "next/link"
import { format } from "date-fns"
import { Banknote, Calendar, MapPin, Users } from "lucide-react"

import { prisma } from "@/lib/prisma"
import { isRegistrationClosed } from "@/lib/event-time"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CopyRegisterLinkButton } from "@/components/copy-register-link-button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const statusLabel: Record<string, string> = {
  DRAFT: "草稿",
  OPEN: "開放報名",
  CLOSED: "已截止",
  CANCELLED: "已取消",
}

// 實心淺底 pill：文字皆為 *-800 深色，對 *-100 淺底 ≥6:1（WCAG AA ✓）
const statusBadgeClass: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  OPEN: "bg-green-100 text-green-800",
  CLOSED: "bg-secondary text-secondary-foreground",
  CANCELLED: "bg-red-100 text-red-800",
}

export default async function EventsPage() {
  const events = await prisma.event.findMany({
    orderBy: { createdAt: "desc" },
  })

  // 各活動目前的已報名人數（CONFIRMED 筆數，與名額下限保護用的計算
  // 基準一致），單一 groupBy 查詢取得全部活動的計數，避免逐一活動
  // 查一次造成 N+1。
  const confirmedCounts = await prisma.registration.groupBy({
    by: ["eventId"],
    where: { status: "CONFIRMED" },
    _count: true,
  })
  const confirmedCountByEventId = new Map(
    confirmedCounts.map((c) => [c.eventId, c._count])
  )

  return (
    <div className="theme-orange flex-1 bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">活動列表</h1>
          <Button asChild>
            <Link href="/events/new">建立活動</Link>
          </Button>
        </div>

        {events.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-base text-muted-foreground">
              目前還沒有活動，點右上角「建立活動」開始新增
            </CardContent>
          </Card>
        ) : (
          /* 卡片式布局（原為表格，字級放大後需橫向捲動才看得到操作按鈕）。
             預設單欄、≥lg 才兩欄：兩欄時卡片內容區約 452px，四顆操作按鈕
             約需 345px，仍有餘裕；按鈕列有 flex-wrap，就算未來塞不下也是
             換行，不會擠壓縮小。 */
          <div className="grid gap-4 lg:grid-cols-2">
            {events.map((event) => (
              <Card key={event.id}>
                <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="min-w-0 break-words text-xl">
                    {event.title}
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge className={statusBadgeClass[event.status]}>
                      {statusLabel[event.status]}
                    </Badge>
                    {/* 活動時間已過但狀態欄位還沒手動改成已截止/已取消時的
                        視覺提示：與狀態徽章並列（不取代），「開放報名」＋
                        「已結束」並排的違和感讓承辦人一眼看出該去關閉了。
                        純提示，實際報名/報到攔截由後端交易內的時間判斷處理。 */}
                    {(event.status === "DRAFT" || event.status === "OPEN") &&
                      isRegistrationClosed(event) && (
                        <Badge className="bg-muted text-muted-foreground">
                          已結束
                        </Badge>
                      )}
                  </div>
                </CardHeader>
                {/* 次要資訊用 text-muted-foreground（實色 #6D4C41，對白卡 7.7:1），
                    不用 opacity 降淡 */}
                <CardContent className="space-y-2.5 text-base text-muted-foreground">
                  <div className="flex items-center gap-2.5">
                    <Calendar className="size-5 shrink-0 text-brand-orange-primary" />
                    <span>{format(event.startAt, "yyyy/MM/dd HH:mm")}</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <MapPin className="size-5 shrink-0 text-brand-orange-primary" />
                    <span className="min-w-0 break-words">
                      {event.location ?? "地點未定"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Users className="size-5 shrink-0 text-brand-orange-primary" />
                    <span>
                      {event.capacity !== null
                        ? `已報名 ${confirmedCountByEventId.get(event.id) ?? 0} ／ 名額 ${event.capacity} 人`
                        : `已報名 ${confirmedCountByEventId.get(event.id) ?? 0} 人（名額不限）`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Banknote className="size-5 shrink-0 text-brand-orange-primary" />
                    <span>
                      {event.requirePayment
                        ? `需繳費（NT$ ${((event.amount ?? 0) / 100).toLocaleString()}）`
                        : "免費"}
                    </span>
                  </div>
                </CardContent>
                {/* mt-auto：兩欄並排時卡片等高，按鈕列固定貼齊卡片底部 */}
                <CardFooter className="mt-auto flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/events/${event.id}/edit`}>編輯</Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/events/${event.id}/checkin-scan`}>
                      開始掃描
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/events/${event.id}/attendees`}>報到名單</Link>
                  </Button>
                  <CopyRegisterLinkButton eventId={event.id} />
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
