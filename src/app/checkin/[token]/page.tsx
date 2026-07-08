import { format } from "date-fns"
import { cookies } from "next/headers"

import { prisma } from "@/lib/prisma"
import { getCheckInWindow } from "@/lib/event-time"
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmCheckInButton } from "./confirm-checkin-button"

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

// 這一頁是「掃描器故障時的備援報到入口」與報名憑證資訊頁。
// 重要：GET（頁面載入）絕對不能有任何寫入副作用——QR Code 連結會被
// 報名者自己好奇掃開、被轉傳、甚至被郵件安全系統解碼預先開啟，
// 「打開網址就完成報到」會讓人還沒到場就被記成已報到。
// 實際報到寫入一律走按鈕觸發的 Server Action（限工作人員，見 actions.ts）。
export default async function CheckinTokenPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const registration = await prisma.registration.findUnique({
    where: { token },
    include: { event: true, checkIn: true },
  })

  const cookieStore = await cookies()
  const isStaff = verifySessionToken(
    cookieStore.get(ADMIN_SESSION_COOKIE)?.value,
    process.env.ADMIN_PASSCODE
  )

  if (!registration) {
    return (
      <div className="theme-forest flex-1 bg-background text-foreground">
        <div className="mx-auto max-w-md px-4 py-16">
          <Card className="border-t-4 border-t-forest-linen-brown">
            <CardHeader className="gap-3">
              <CardTitle className="w-fit rounded-full bg-red-100 px-4 py-1.5 text-xl font-semibold text-red-800">
                查無此報名資料
              </CardTitle>
              <p className="text-lg text-muted-foreground">
                請確認 QR Code 是否正確，或聯絡工作人員協助處理
              </p>
            </CardHeader>
          </Card>
        </div>
      </div>
    )
  }

  const checkIn = registration.checkIn
  // 報到有效窗（活動當天 00:00 ～ 結束後 2 小時）。這裡的判斷只是
  // 介面引導——把按鈕換成說明文字；performCheckIn 內另有相同的硬性檢查。
  const { opensAt, closesAt } = getCheckInWindow(registration.event)
  const now = new Date()
  const withinWindow = now >= opensAt && now <= closesAt
  const canCheckIn = registration.status === "CONFIRMED" && !checkIn

  return (
    <div className="theme-forest flex-1 bg-background text-foreground">
      <div className="mx-auto max-w-md px-4 py-16">
        <Card className="border-t-4 border-t-forest-linen-brown">
          <CardHeader className="gap-2">
            <CardTitle className="text-2xl">{registration.event.title}</CardTitle>
            <p className="text-xl">{registration.name}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className={registrationStatusBadgeClass[registration.status]}
              >
                {registrationStatusLabel[registration.status]}
              </Badge>
              {checkIn ? (
                <Badge className="bg-green-100 text-green-800">
                  已於 {format(checkIn.checkedAt, "yyyy/MM/dd HH:mm")} 報到
                  {checkIn.gate ? `・${checkIn.gate}` : ""}
                </Badge>
              ) : (
                <Badge className="bg-muted text-muted-foreground">
                  尚未報到
                </Badge>
              )}
            </div>

            {canCheckIn && !withinWindow && (
              <p className="rounded-lg bg-muted px-4 py-3 text-base text-muted-foreground">
                {now < opensAt
                  ? `報到尚未開放，活動當天（${format(opensAt, "yyyy/MM/dd")}）起可報到。`
                  : "活動已結束，報到時間已截止。"}
              </p>
            )}

            {canCheckIn &&
              withinWindow &&
              (isStaff ? (
                <ConfirmCheckInButton token={registration.token} />
              ) : (
                <p className="rounded-lg bg-muted px-4 py-3 text-base text-muted-foreground">
                  這是您的報到憑證。報到由現場工作人員操作，活動當天請向
                  工作人員出示此畫面或報名信中的 QR Code 即可。
                </p>
              ))}

            {!canCheckIn && !checkIn && (
              <p className="rounded-lg bg-red-100 px-4 py-3 text-base text-red-800">
                此報名目前尚未確認（例如候補中或已取消），暫時無法報到，
                請聯絡工作人員。
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
