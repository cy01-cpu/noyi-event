"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { updateEventWithCapacityGuard } from "@/lib/events"
import { sendPromotionEmails } from "@/lib/promotion"
import { eventEditSchema, type EventEditValues } from "@/lib/validations/event"
import {
  eventFormFieldsSchema,
  type EventFormFieldValues,
} from "@/lib/validations/event-form-field"

type UpdateEventResult =
  | { success: true }
  | { success: false; errors: Record<string, string[] | undefined> }

export async function updateEvent(
  eventId: string,
  values: EventEditValues,
  formFields: EventFormFieldValues[]
): Promise<UpdateEventResult> {
  const parsed = eventEditSchema.safeParse(values)
  const parsedFields = eventFormFieldsSchema.safeParse(formFields)

  if (!parsed.success || !parsedFields.success) {
    return {
      success: false,
      errors: {
        ...(parsed.success ? {} : parsed.error.flatten().fieldErrors),
        ...(parsedFields.success
          ? {}
          : { _form: ["自訂報名欄位資料有誤，請確認後再試一次"] }),
      },
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
      requirePayment: data.requirePayment,
      amountInCents:
        data.requirePayment && data.amount !== undefined
          ? Math.round(data.amount * 100) // 元 → 分，避免浮點誤差
          : null,
      status: data.status,
      formFields: parsedFields.data,
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

  // 名額調高觸發的候補自動轉正（C1）：狀態已在交易內定案，
  // 這裡於交易外寄轉正通知信；失敗會記入 email-failures 清單
  // （/api/health 可視化），不影響更新結果。
  if (result.promoted.length > 0) {
    await sendPromotionEmails(result.promoted, result.event)
  }

  revalidatePath("/events")
  revalidatePath(`/events/${eventId}/register`)
  revalidatePath(`/events/${eventId}/attendees`)
  redirect("/events")
}
