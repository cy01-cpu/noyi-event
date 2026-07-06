import { format } from "date-fns"
import { Calendar, MapPin, Users } from "lucide-react"

import { prisma } from "@/lib/prisma"
import { RegistrationForm } from "@/components/registration-form"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function RegisterPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = await prisma.event.findUnique({ where: { id } })

  if (!event) {
    return (
      <div className="theme-orange flex-1 bg-background text-foreground">
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <p className="text-lg font-medium">找不到此活動</p>
        </div>
      </div>
    )
  }

  if (event.status !== "OPEN") {
    return (
      <div className="theme-orange flex-1 bg-background text-foreground">
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <p className="text-lg font-medium">此活動目前未開放報名</p>
        </div>
      </div>
    )
  }

  const remainingSlots =
    event.capacity !== null
      ? Math.max(
          event.capacity -
            (await prisma.registration.count({
              where: { eventId: event.id, status: "CONFIRMED" },
            })),
          0
        )
      : null

  return (
    <div className="theme-orange flex-1 bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-2xl">{event.title}</CardTitle>
          </CardHeader>
          {/* 次要資訊用 text-muted-foreground（主題內為實色 #6D4C41，
              對白色卡片 7.7:1），不用 opacity 降淡 */}
          <CardContent className="space-y-3 text-base text-muted-foreground">
            <div className="flex items-center gap-2.5">
              <Calendar className="size-5 shrink-0 text-brand-orange-primary" />
              <span>
                {format(event.startAt, "yyyy/MM/dd HH:mm")}
                {event.endAt && ` - ${format(event.endAt, "yyyy/MM/dd HH:mm")}`}
              </span>
            </div>
            {event.location && (
              <div className="flex items-center gap-2.5">
                <MapPin className="size-5 shrink-0 text-brand-orange-primary" />
                <span>{event.location}</span>
              </div>
            )}
            <div className="flex items-center gap-2.5">
              <Users className="size-5 shrink-0 text-brand-orange-primary" />
              <span>
                {remainingSlots !== null
                  ? `尚餘 ${remainingSlots} 個名額`
                  : "不限名額"}
              </span>
            </div>
          </CardContent>
        </Card>

        <RegistrationForm eventId={event.id} />
      </div>
    </div>
  )
}
