"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/prisma"
import { eventEditSchema, type EventEditValues } from "@/lib/validations/event"

type UpdateEventResult =
  | { success: true }
  | { success: false; errors: Record<string, string[] | undefined> }

export async function updateEvent(
  eventId: string,
  values: EventEditValues
): Promise<UpdateEventResult> {
  const parsed = eventEditSchema.safeParse(values)

  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.flatten().fieldErrors,
    }
  }

  const data = parsed.data

  const [event, registrationCount, confirmedCount] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId } }),
    prisma.registration.count({ where: { eventId } }),
    prisma.registration.count({ where: { eventId, status: "CONFIRMED" } }),
  ])

  if (!event) {
    return { success: false, errors: { _form: ["找不到此活動"] } }
  }

  // 名額下限：不可低於目前已確認（CONFIRMED）的報名筆數，
  // 否則等於回溯製造超賣。前端有提示，這裡是繞過前端時的硬性防線。
  if (data.capacity !== undefined && data.capacity < confirmedCount) {
    return {
      success: false,
      errors: {
        capacity: [`名額不可低於目前已確認的報名人數（${confirmedCount} 人）`],
      },
    }
  }

  // 已有任何報名（不論狀態，含候補/已取消）時，繳費設定鎖定不可修改，
  // 避免已報名者的對帳基準被事後變更。前端欄位已 disabled，
  // 這裡直接以資料庫現值覆蓋送入值（後端防呆，防止繞過前端直接呼叫）。
  const hasRegistrations = registrationCount > 0
  const requirePayment = hasRegistrations
    ? event.requirePayment
    : data.requirePayment
  const amountInCents = hasRegistrations
    ? event.amount
    : data.requirePayment && data.amount !== undefined
      ? Math.round(data.amount * 100) // 元 → 分，避免浮點誤差
      : null

  try {
    await prisma.event.update({
      where: { id: eventId },
      data: {
        title: data.title,
        description: data.description || null,
        location: data.location || null,
        startAt: data.startAt,
        endAt: data.endAt ?? null,
        capacity: data.capacity ?? null,
        isPublic: data.isPublic,
        requirePayment,
        amount: amountInCents,
        status: data.status,
      },
    })
  } catch {
    return {
      success: false,
      errors: { _form: ["更新活動時發生錯誤，請稍後再試"] },
    }
  }

  revalidatePath("/events")
  revalidatePath(`/events/${eventId}/register`)
  redirect("/events")
}
