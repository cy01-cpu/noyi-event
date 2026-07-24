"use client"

import { useState } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react"

import { eventEditSchema, type EventEditValues } from "@/lib/validations/event"
import {
  eventFormFieldsSchema,
  formFieldTypeValues,
  formFieldTypeLabel,
  type EventFormFieldValues,
} from "@/lib/validations/event-form-field"
import { DateTimePicker } from "@/components/date-time-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

export type EventFormResult =
  | { success: true }
  | { success: false; errors: Record<string, string[] | undefined> }

const formFieldsFormSchema = z.object({ formFields: eventFormFieldsSchema })
type FormFieldsFormValues = z.infer<typeof formFieldsFormSchema>

type EventFormProps = {
  defaultValues: EventEditValues
  // 建立頁只提供草稿/開放報名，編輯頁提供全部四種狀態
  statusOptions: { value: EventEditValues["status"]; label: string }[]
  // 已有報名時鎖定繳費相關欄位（後端 Server Action 另有防呆，這裡是 UX 層）
  lockPaymentFields?: boolean
  // 已有任何報名時，自訂欄位裡「已存在」的題目凍結不可改/刪，
  // 但仍可以繼續新增新題目（後端 applyFormFieldChanges 另有硬性防呆）
  hasRegistrations?: boolean
  // 目前已存在的自訂欄位（帶真實 id），新增頁固定是空陣列
  existingFormFields?: EventFormFieldValues[]
  // 已有 CONFIRMED 報名時的名額下限（前端提示用，後端另做硬性驗證）
  minCapacity?: number
  // 目前候補中的人數（C1 遞補預警用；儲存時後端會在同一交易內自動轉正）
  waitlistedCount?: number
  submitLabel: string
  submittingLabel: string
  onSubmit: (
    values: EventEditValues,
    formFields: EventFormFieldValues[]
  ) => Promise<EventFormResult>
}

// 前端一律用 eventEditSchema（完整狀態範圍）做即時驗證：建立頁的
// 狀態選單只提供 DRAFT/OPEN 兩個選項，而 createEvent Server Action
// 會再用較嚴格的 eventFormSchema 驗一次，兩層規則實質等價。
export function EventForm({
  defaultValues,
  statusOptions,
  lockPaymentFields = false,
  hasRegistrations = false,
  existingFormFields = [],
  minCapacity,
  waitlistedCount = 0,
  submitLabel,
  submittingLabel,
  onSubmit,
}: EventFormProps) {
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<EventEditValues>({
    resolver: zodResolver(eventEditSchema),
    defaultValues,
  })

  // 自訂報名欄位獨立成第二個 form：eventEditSchema 已經 .refine 過，
  // Zod 4 不允許再 .extend 塞進 formFields，且欄位陣列本來就不屬於
  // EventEditValues。送出時兩個 form 各自驗證，一起組進 onSubmit。
  const fieldsForm = useForm<FormFieldsFormValues>({
    resolver: zodResolver(formFieldsFormSchema),
    defaultValues: { formFields: existingFormFields },
  })
  // keyName 改叫 fieldKey，避免跟欄位定義本身的 id（資料庫真實 id，
  // 用來判斷是否已鎖定）撞名——RHF 預設會把它的內部 key 也叫 id。
  const {
    fields: fieldRows,
    append,
    remove,
    move,
  } = useFieldArray({ control: fieldsForm.control, name: "formFields", keyName: "fieldKey" })

  // 已鎖定的欄位 id 只在掛載當下算一次：判斷「這個欄位是已有報名前就
  // 存在的舊欄位」，跟使用者這次編輯階段新增的欄位分開處理
  const [lockedFieldIds] = useState<Set<string>>(
    () => new Set(hasRegistrations ? existingFormFields.map((f) => f.id).filter((id): id is string => !!id) : [])
  )

  const requirePayment = form.watch("requirePayment")

  // C1 遞補預警：依目前填的名額試算儲存後會自動轉正幾位候補。
  // 計算規則與後端 promoteWaitlistedInTx 一致——名額留空（不限）時
  // 全部轉正；草稿/已取消狀態下後端不遞補，預警也不顯示。
  const watchedCapacity = form.watch("capacity")
  const watchedStatus = form.watch("status")
  const confirmedCount = minCapacity ?? 0
  const willPromoteCount =
    waitlistedCount > 0 &&
    (watchedStatus === "OPEN" || watchedStatus === "CLOSED")
      ? watchedCapacity === undefined
        ? waitlistedCount
        : Math.min(
            Math.max(watchedCapacity - confirmedCount, 0),
            waitlistedCount
          )
      : 0

  async function handleSubmit(values: EventEditValues) {
    setFormError(null)

    const fieldsValid = await fieldsForm.trigger()
    if (!fieldsValid) return

    const result = await onSubmit(values, fieldsForm.getValues().formFields)

    if (!result.success) {
      for (const [field, messages] of Object.entries(result.errors)) {
        if (!messages || messages.length === 0) continue
        if (field === "_form") {
          setFormError(messages[0])
          continue
        }
        form.setError(field as keyof EventEditValues, {
          message: messages[0],
        })
      }
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        {formError && (
          <p className="rounded-lg bg-red-100 px-3.5 py-2.5 text-base text-red-800">
            {formError}
          </p>
        )}

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>活動名稱</FormLabel>
              <FormControl>
                <Input placeholder="例如：2026 年度尾牙" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>活動描述（選填）</FormLabel>
              <FormControl>
                <Textarea placeholder="活動簡介、注意事項等" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="location"
          render={({ field }) => (
            <FormItem>
              <FormLabel>活動地點（選填）</FormLabel>
              <FormControl>
                <Input placeholder="例如：台北文創大樓 3F" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-6 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="startAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>開始時間</FormLabel>
                <FormControl>
                  <DateTimePicker
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="endAt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>結束時間（選填）</FormLabel>
                <FormControl>
                  <DateTimePicker
                    value={field.value}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="capacity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>報名名額（選填）</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  min={minCapacity && minCapacity > 0 ? minCapacity : 1}
                  placeholder="不填代表不限人數"
                  {...field}
                  value={field.value ?? ""}
                  onChange={(e) =>
                    field.onChange(
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value)
                    )
                  }
                />
              </FormControl>
              {minCapacity !== undefined && minCapacity > 0 && (
                <FormDescription>
                  目前已有 {minCapacity} 人確認報名，名額不可低於 {minCapacity}
                </FormDescription>
              )}
              {willPromoteCount > 0 && (
                <p className="rounded-lg bg-amber-100 px-3.5 py-2.5 text-base text-amber-800">
                  儲存後將依報名順序自動遞補 {willPromoteCount} 位候補為已確認，
                  並寄送含報到 QR Code 的通知信
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="requirePayment"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>需要繳費</FormLabel>
                <FormDescription>
                  {lockPaymentFields
                    ? "已有報名者，無法修改繳費設定"
                    : "開啟後報名者需繳費才能完成報名"}
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={lockPaymentFields}
                />
              </FormControl>
            </FormItem>
          )}
        />

        {requirePayment && (
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>金額（元）</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    placeholder="例如：500"
                    disabled={lockPaymentFields}
                    {...field}
                    value={field.value ?? ""}
                    onChange={(e) =>
                      field.onChange(
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value)
                      )
                    }
                  />
                </FormControl>
                {lockPaymentFields && (
                  <FormDescription>已有報名者，無法修改</FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <div className="space-y-3 rounded-lg border p-4">
          <div className="space-y-0.5">
            <p className="text-base font-medium">自訂報名欄位（選填）</p>
            <p className="text-sm text-muted-foreground">
              除了姓名/Email/電話等固定欄位，可以在這裡加問題（例如葷素、同行人數）。
              {hasRegistrations &&
                "已有人報名，既有題目無法修改，但仍可以繼續新增新題目。"}
            </p>
          </div>

          <Form {...fieldsForm}>
            <div className="space-y-3">
              {fieldRows.map((row, index) => {
                const locked = !!row.id && lockedFieldIds.has(row.id)
                const type = fieldsForm.watch(`formFields.${index}.type`)

                if (locked) {
                  return (
                    <div
                      key={row.fieldKey}
                      data-testid="form-field-row-locked"
                      className="rounded-lg bg-muted p-3 text-base"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{row.label}</span>
                        <Badge className="bg-background text-muted-foreground">
                          {formFieldTypeLabel[row.type]}
                        </Badge>
                        {row.required && (
                          <Badge className="bg-amber-100 text-amber-800">
                            必填
                          </Badge>
                        )}
                      </div>
                      {row.type === "SELECT" && row.options.length > 0 && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          選項：{row.options.join("、")}
                        </p>
                      )}
                      <p className="mt-1 text-sm text-muted-foreground">
                        已有人報名，這題無法修改
                      </p>
                    </div>
                  )
                }

                return (
                  <div
                    key={row.fieldKey}
                    data-testid="form-field-row"
                    className="space-y-3 rounded-lg border p-3"
                  >
                    <FormField
                      control={fieldsForm.control}
                      name={`formFields.${index}.label`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>題目文字</FormLabel>
                          <FormControl>
                            <Input placeholder="例如：葷素" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid gap-3 sm:grid-cols-2">
                      <FormField
                        control={fieldsForm.control}
                        name={`formFields.${index}.type`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>類型</FormLabel>
                            <Select
                              value={field.value}
                              onValueChange={(value) => {
                                field.onChange(value)
                                // 核取方塊結構性地不允許必填（無法表達
                                // 「否」，見 event-form-field.ts）
                                if (value === "CHECKBOX") {
                                  fieldsForm.setValue(
                                    `formFields.${index}.required`,
                                    false
                                  )
                                }
                              }}
                            >
                              <FormControl>
                                <SelectTrigger className="w-full">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {formFieldTypeValues.map((value) => (
                                  <SelectItem key={value} value={value}>
                                    {formFieldTypeLabel[value]}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {type !== "CHECKBOX" && (
                        <FormField
                          control={fieldsForm.control}
                          name={`formFields.${index}.required`}
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                              <FormLabel>必填</FormLabel>
                              <FormControl>
                                <Switch
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      )}
                    </div>

                    {type === "SELECT" && (
                      <FormField
                        control={fieldsForm.control}
                        name={`formFields.${index}.options`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>選項（用逗號分隔，至少 2 個）</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="例如：葷食, 素食"
                                defaultValue={field.value?.join(", ") ?? ""}
                                onBlur={(e) =>
                                  field.onChange(
                                    e.target.value
                                      .split(",")
                                      .map((s) => s.trim())
                                      .filter(Boolean)
                                  )
                                }
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <div className="flex items-center justify-end gap-2">
                      {!hasRegistrations && (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={index === 0}
                            onClick={() => move(index, index - 1)}
                          >
                            <ArrowUp className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            disabled={index === fieldRows.length - 1}
                            onClick={() => move(index, index + 1)}
                          >
                            <ArrowDown className="size-4" />
                          </Button>
                        </>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(index)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>

            {fieldRows.length < 10 && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() =>
                  append({ label: "", type: "TEXT", required: false, options: [] })
                }
              >
                <Plus className="size-4" /> 新增題目
              </Button>
            )}
          </Form>
        </div>

        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>活動狀態</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="請選擇活動狀態" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="w-full"
        >
          {form.formState.isSubmitting ? submittingLabel : submitLabel}
        </Button>
      </form>
    </Form>
  )
}
