import { format } from "date-fns"

import { performCheckIn } from "@/lib/checkin"
import { cn } from "@/lib/utils"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default async function CheckinTokenPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const result = await performCheckIn(token)

  let title: string
  let description: string
  // 現場工作人員需要一眼分辨結果：成功綠、重複報到黃、其餘紅。
  // 文字皆 *-800 深色對 *-100 淺底 ≥6:1（WCAG AA ✓）
  let tone: string

  if (result.success) {
    title = "報到成功"
    description = `歡迎 ${result.name}，${result.eventTitle}`
    tone = "bg-green-100 text-green-800"
  } else if (result.reason === "not_confirmed") {
    title = "尚未確認報名"
    description = "此報名目前尚未確認（例如候補中），暫時無法報到，請聯絡工作人員"
    tone = "bg-red-100 text-red-800"
  } else if (result.reason === "already_checked_in") {
    title = "您已報到過了"
    description = `您已於 ${format(result.checkedAt, "yyyy/MM/dd HH:mm")} 報到過了`
    tone = "bg-amber-100 text-amber-800"
  } else {
    // not_found；event_mismatch 不會發生（此頁未帶 expectedEventId），一併以查無資料處理
    title = "查無此報名資料"
    description = "請確認 QR Code 是否正確，或聯絡工作人員協助處理"
    tone = "bg-red-100 text-red-800"
  }

  return (
    <div className="theme-forest flex-1 bg-background text-foreground">
      <div className="mx-auto max-w-md px-4 py-16">
        <Card className="border-t-4 border-t-forest-linen-brown">
          <CardHeader className="gap-3">
            <CardTitle
              className={cn(
                "w-fit rounded-full px-4 py-1.5 text-xl font-semibold",
                tone
              )}
            >
              {title}
            </CardTitle>
            <CardDescription className="text-lg">{description}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  )
}
