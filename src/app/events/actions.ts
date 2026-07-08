"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/prisma"
import { eventFormSchema, type EventEditValues } from "@/lib/validations/event"
import {
  eventFormFieldsSchema,
  type EventFormFieldValues,
} from "@/lib/validations/event-form-field"

type CreateEventResult =
  | { success: true }
  | { success: false; errors: Record<string, string[] | undefined> }

// 參數型別用共用表單元件的 EventEditValues（狀態範圍較寬），
// 但驗證仍用建立專用的 eventFormSchema：新活動狀態只允許 DRAFT/OPEN。
export async function createEvent(
  values: EventEditValues,
  formFields: EventFormFieldValues[]
): Promise<CreateEventResult> {
  const parsed = eventFormSchema.safeParse(values)
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

  // amount 存入資料庫前需轉換成「分」：使用者輸入的單位是「元」，寫入前乘以 100 避免浮點誤差。
  const amountInCents =
    data.requirePayment && data.amount !== undefined
      ? Math.round(data.amount * 100)
      : null

  try {
    // 新活動沒有既有報名可言，不需要行鎖／hasRegistrations 判斷，
    // Prisma 巢狀寫入即可原子完成（比照 src/lib/events.ts 的鎖定規則，
    // 這裡永遠等同「還沒有任何報名」那個分支）。
    await prisma.event.create({
      data: {
        title: data.title,
        description: data.description || null,
        location: data.location || null,
        startAt: data.startAt,
        endAt: data.endAt ?? null,
        capacity: data.capacity ?? null,
        isPublic: data.isPublic,
        requirePayment: data.requirePayment,
        amount: amountInCents,
        status: data.status,
        formFields: {
          createMany: {
            data: parsedFields.data.map((f, i) => ({
              label: f.label,
              type: f.type,
              required: f.required,
              options: f.options,
              order: i,
            })),
          },
        },
      },
    })
  } catch {
    return {
      success: false,
      errors: { _form: ["建立活動時發生錯誤，請稍後再試"] },
    }
  }

  revalidatePath("/events")
  redirect("/events")
}
