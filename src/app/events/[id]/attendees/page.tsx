import Link from "next/link"
import { format } from "date-fns"

import { prisma } from "@/lib/prisma"
import { Badge } from "@/components/ui/badge"
import { TogglePaidButton } from "./toggle-paid-button"
import { PaidOperatorProvider } from "./paid-operator"
import { Card, CardContent } from "@/components/ui/card"

const registrationStatusLabel: Record<string, string> = {
  PENDING: "待處理",
  CONFIRMED: "已確認",
  CANCELLED: "已取消",
  WAITLISTED: "候補中",
}

// 實心淺底 pill：文字皆為 *-800 深色，對 *-100 淺底 ≥6:1（WCAG AA ✓）
const registrationStatusBadgeClass: Record<string, string> = {
  PENDING: "bg-muted text-muted-foreground",
  CONFIRMED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
  WAITLISTED: "bg-amber-100 text-amber-800",
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
      <div className="theme-forest flex-1 bg-background text-foreground">
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <p className="text-lg font-medium">找不到此活動</p>
        </div>
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

  const attendeeList =
    sorted.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-base text-muted-foreground">
              目前還沒有人報名
            </CardContent>
          </Card>
        ) : (
          /* 卡片式布局（原為表格，欄位多、字級放大後需橫向捲動）。
             名單是逐筆核對用，固定單欄直列，由上往下掃視不易看錯行。 */
          <div className="space-y-4">
            {sorted.map((r) => (
              <Card key={r.id}>
                <CardContent className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 break-words text-lg font-semibold">
                      {r.name}
                    </p>
                    <Badge className={registrationStatusBadgeClass[r.status]}>
                      {registrationStatusLabel[r.status]}
                    </Badge>
                  </div>

                  <p className="break-all text-base text-muted-foreground">
                    {r.email}
                  </p>

                  <div className="flex flex-wrap items-center gap-2">
                    {r.checkIn ? (
                      <>
                        <Badge className="bg-green-100 text-green-800">
                          已報到
                        </Badge>
                        <span className="text-base text-muted-foreground">
                          {format(r.checkIn.checkedAt, "yyyy/MM/dd HH:mm")}
                          {r.checkIn.gate ? `・${r.checkIn.gate}` : ""}
                        </span>
                      </>
                    ) : (
                      <Badge className="bg-muted text-muted-foreground">
                        尚未報到
                      </Badge>
                    )}
                  </div>

                  {event.requirePayment && (
                    <div className="flex flex-wrap items-center gap-2 border-t pt-2.5">
                      <Badge
                        className={
                          r.isPaid
                            ? "bg-green-100 text-green-800"
                            : "bg-amber-100 text-amber-800"
                        }
                      >
                        {r.isPaid
                          ? `已繳費${
                              r.paidAt
                                ? `（${format(r.paidAt, "MM/dd")}${r.paidBy ? `・${r.paidBy}` : ""}）`
                                : ""
                            }`
                          : "未繳費"}
                      </Badge>
                      <TogglePaidButton registrationId={r.id} isPaid={r.isPaid} />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )

  return (
    <div className="theme-forest flex-1 bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Link
          href="/events"
          className="mb-4 inline-block text-base text-muted-foreground hover:underline"
        >
          ← 返回活動列表
        </Link>

        <h1 className="mb-1 text-2xl font-bold">{event.title}・報到名單</h1>
        <p className="mb-6 text-base text-muted-foreground">
          總報名人數 {registrations.length} ・ 已報到 {checkedInCount}
          {event.requirePayment &&
            ` ・ 已繳費 ${paidCount} / 應繳 ${confirmedCount}`}
        </p>

        {/* 需要收費的活動才顯示「收費經手人」欄位（B1 繳費稽核軌跡）；
            名單卡片作為 children 傳入，卡片內的 TogglePaidButton 透過
            Context 取得目前填寫的經手人 */}
        {event.requirePayment ? (
          <PaidOperatorProvider>{attendeeList}</PaidOperatorProvider>
        ) : (
          attendeeList
        )}
      </div>
    </div>
  )
}
