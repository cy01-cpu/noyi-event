"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { eventEditSchema, type EventEditValues } from "@/lib/validations/event"
import { DateTimePicker } from "@/components/date-time-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
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

type EventFormProps = {
  defaultValues: EventEditValues
  // 建立頁只提供草稿/開放報名，編輯頁提供全部四種狀態
  statusOptions: { value: EventEditValues["status"]; label: string }[]
  // 已有報名時鎖定繳費相關欄位（後端 Server Action 另有防呆，這裡是 UX 層）
  lockPaymentFields?: boolean
  // 已有 CONFIRMED 報名時的名額下限（前端提示用，後端另做硬性驗證）
  minCapacity?: number
  submitLabel: string
  submittingLabel: string
  onSubmit: (values: EventEditValues) => Promise<EventFormResult>
}

// 前端一律用 eventEditSchema（完整狀態範圍）做即時驗證：建立頁的
// 狀態選單只提供 DRAFT/OPEN 兩個選項，而 createEvent Server Action
// 會再用較嚴格的 eventFormSchema 驗一次，兩層規則實質等價。
export function EventForm({
  defaultValues,
  statusOptions,
  lockPaymentFields = false,
  minCapacity,
  submitLabel,
  submittingLabel,
  onSubmit,
}: EventFormProps) {
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<EventEditValues>({
    resolver: zodResolver(eventEditSchema),
    defaultValues,
  })

  const requirePayment = form.watch("requirePayment")

  async function handleSubmit(values: EventEditValues) {
    setFormError(null)
    const result = await onSubmit(values)

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
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isPublic"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>公開活動</FormLabel>
                <FormDescription>
                  開啟後所有人都可以看到此活動並報名
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
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
