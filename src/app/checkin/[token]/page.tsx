import { format } from "date-fns"

import { performCheckIn } from "@/lib/checkin"
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

  if (result.success) {
    title = "報到成功"
    description = `歡迎 ${result.name}，${result.eventTitle}`
  } else if (result.reason === "not_found") {
    title = "查無此報名資料"
    description = "請確認 QR Code 是否正確，或聯絡工作人員協助處理"
  } else if (result.reason === "not_confirmed") {
    title = "尚未確認報名"
    description = "此報名目前尚未確認（例如候補中），暫時無法報到，請聯絡工作人員"
  } else {
    title = "您已報到過了"
    description = `您已於 ${format(result.checkedAt, "yyyy/MM/dd HH:mm")} 報到過了`
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
