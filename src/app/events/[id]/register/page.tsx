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
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-lg font-medium">找不到此活動</p>
      </div>
    )
  }

  if (event.status !== "OPEN") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-lg font-medium">此活動目前未開放報名</p>
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
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{event.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 shrink-0" />
            <span>
              {format(event.startAt, "yyyy/MM/dd HH:mm")}
              {event.endAt && ` - ${format(event.endAt, "yyyy/MM/dd HH:mm")}`}
            </span>
          </div>
          {event.location && (
            <div className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0" />
              <span>{event.location}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Users className="size-4 shrink-0" />
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
  )
}
