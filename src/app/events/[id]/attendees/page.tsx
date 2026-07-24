import Link from "next/link"

import { prisma } from "@/lib/prisma"
import { getCheckInWindow } from "@/lib/event-time"
import { AttendeesList } from "./attendees-list"
import { PaidOperatorProvider } from "./paid-operator"

export default async function AttendeesPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await prisma.event.findUnique({ where: { id } })
  const formFields = await prisma.eventFormField.findMany({
    where: { eventId: id },
    orderBy: { order: "asc" },
  })

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

  // 取消確認提示與「待退費」徽章用的金額標籤（資料庫存「分」）
  const amountLabel =
    event.amount !== null
      ? `NT$${(event.amount / 100).toLocaleString("zh-TW")}`
      : null

  // 報到有效窗是否已關閉：關閉後「取消報到」一律不給操作
  // （見 undo-checkin-button.tsx／actions.ts 的 undoCheckIn）
  const checkInWindowClosed = new Date() > getCheckInWindow(event).closesAt

  const attendeeList = (
    <AttendeesList
      registrations={sorted}
      formFields={formFields}
      requirePayment={event.requirePayment}
      amountLabel={amountLabel}
      checkInWindowClosed={checkInWindowClosed}
    />
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
