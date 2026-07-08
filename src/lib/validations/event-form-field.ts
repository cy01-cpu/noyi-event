import { z } from "zod"

export const formFieldTypeValues = ["TEXT", "SELECT", "CHECKBOX"] as const
export type FormFieldTypeValue = (typeof formFieldTypeValues)[number]

export const formFieldTypeLabel: Record<FormFieldTypeValue, string> = {
  TEXT: "單行文字",
  SELECT: "單選",
  CHECKBOX: "核取方塊",
}

// 欄位定義（承辦人在活動建立/編輯頁填寫）。id 有值代表資料庫裡已存在
// 的欄位（依鎖定規則，已有報名後送出的內容變更會被後端忽略，見
// src/lib/events.ts applyFormFieldChanges），沒有 id 代表新增。
//
// CHECKBOX 不允許 required=true——「必填的核取方塊」邏輯上無法表達
// 「否」，真正的是非題請改用 SELECT + 是/否兩個選項。
export const eventFormFieldSchema = z
  .object({
    id: z.string().optional(),
    label: z
      .string()
      .trim()
      .min(1, "題目文字必填")
      .max(50, "題目最多 50 個字"),
    type: z.enum(formFieldTypeValues),
    required: z.boolean(),
    options: z
      .array(z.string().trim().min(1).max(30, "選項最多 30 個字"))
      .max(10, "選項最多 10 個"),
  })
  .refine((f) => f.type !== "SELECT" || f.options.length >= 2, {
    message: "單選題至少需要 2 個選項",
    path: ["options"],
  })
  .refine((f) => f.type !== "CHECKBOX" || !f.required, {
    message: "核取方塊無法設為必填（無法表達「否」，是非題請改用單選）",
    path: ["required"],
  })

export const eventFormFieldsSchema = z
  .array(eventFormFieldSchema)
  .max(10, "自訂欄位最多 10 個")

export type EventFormFieldValues = z.infer<typeof eventFormFieldSchema>

// ── 報名時的動態答案 schema ──
// fields 一律來自「當下從資料庫讀到的 EventFormField 清單」，不是
// client 送上來的資料——前端表單與後端 Server Action 各自呼叫一次，
// 維持這個專案一貫「前端方便驗證、後端獨立重驗證」的原則（比照
// registrationFormSchema／eventEditSchema 的用法）。
export type CustomFieldDefinition = {
  id: string
  label: string
  type: FormFieldTypeValue
  required: boolean
  options: string[]
}

export function buildCustomFieldsSchema(fields: CustomFieldDefinition[]) {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const f of fields) {
    if (f.type === "CHECKBOX") {
      // 結構性地不存在「必填 CHECKBOX」（見上方 eventFormFieldSchema
      // 的 refine），一律視為選填的是/否開關
      shape[f.id] = z.boolean().optional().default(false)
    } else if (f.type === "SELECT") {
      const options = f.options as [string, ...string[]]
      shape[f.id] = f.required
        ? z.enum(options, `請選擇：${f.label}`)
        : z.enum(options).optional()
    } else {
      shape[f.id] = f.required
        ? z
            .string()
            .trim()
            .min(1, `請填寫：${f.label}`)
            .max(200, `${f.label}最多 200 個字`)
        : z
            .string()
            .trim()
            .max(200, `${f.label}最多 200 個字`)
            .optional()
    }
  }

  return z.object(shape)
}

export type CustomFieldValues = Record<string, string | boolean | undefined>
