import { prisma } from "@/lib/prisma"
import { EditEventForm } from "./edit-event-form"

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [event, registrationCount, confirmedCount, waitlistedCount, formFields] =
    await Promise.all([
      prisma.event.findUnique({ where: { id } }),
      prisma.registration.count({ where: { eventId: id } }),
      prisma.registration.count({
        where: { eventId: id, status: "CONFIRMED" },
      }),
      prisma.registration.count({
        where: { eventId: id, status: "WAITLISTED" },
      }),
      prisma.eventFormField.findMany({
        where: { eventId: id },
        orderBy: { order: "asc" },
      }),
    ])

  if (!event) {
    return (
      <div className="theme-orange flex-1 bg-background text-foreground">
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <p className="text-lg font-medium">找不到此活動</p>
        </div>
      </div>
    )
  }

  return (
    <EditEventForm
      eventId={event.id}
      defaultValues={{
        title: event.title,
        description: event.description ?? "",
        location: event.location ?? "",
        startAt: event.startAt,
        endAt: event.endAt ?? undefined,
        capacity: event.capacity ?? undefined,
        requirePayment: event.requirePayment,
        // 資料庫存「分」，表單顯示「元」
        amount: event.amount !== null ? event.amount / 100 : undefined,
        status: event.status,
      }}
      hasRegistrations={registrationCount > 0}
      confirmedCount={confirmedCount}
      waitlistedCount={waitlistedCount}
      existingFormFields={formFields.map((f) => ({
        id: f.id,
        label: f.label,
        type: f.type,
        required: f.required,
        options: f.options,
      }))}
    />

  )
}
