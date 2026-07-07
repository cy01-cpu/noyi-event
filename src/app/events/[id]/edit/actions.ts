"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { updateEventWithCapacityGuard } from "@/lib/events"
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

  // 名額下限檢查、繳費設定鎖定與 update 全部包在同一個持行鎖交易內執行
  // （與報名端搶同一把 Event 行鎖），細節見 src/lib/events.ts。
  let result
  try {
    result = await updateEventWithCapacityGuard(eventId, {
      title: data.title,
      description: data.description || null,
      location: data.location || null,
      startAt: data.startAt,
      endAt: data.endAt ?? null,
      capacity: data.capacity ?? null,
      isPublic: data.isPublic,
      requirePayment: data.requirePayment,
      amountInCents:
        data.requirePayment && data.amount !== undefined
          ? Math.round(data.amount * 100) // 元 → 分，避免浮點誤差
          : null,
      status: data.status,
    })
  } catch {
    return {
      success: false,
      errors: { _form: ["更新活動時發生錯誤，請稍後再試"] },
    }
  }

  if (result.outcome === "not_found") {
    return { success: false, errors: { _form: ["找不到此活動"] } }
  }

  if (result.outcome === "capacity_below_confirmed") {
    return {
      success: false,
      errors: {
        capacity: [
          `名額不可低於目前已確認的報名人數（${result.confirmedCount} 人）`,
        ],
      },
    }
  }

  revalidatePath("/events")
  revalidatePath(`/events/${eventId}/register`)
  redirect("/events")
}
