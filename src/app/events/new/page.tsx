"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { createEvent } from "@/app/events/actions"
import { eventFormSchema, type EventFormValues } from "@/lib/validations/event"
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function NewEventPage() {
  const [formError, setFormError] = useState<string | null>(null)

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: "",
      description: "",
      location: "",
      startAt: undefined,
      endAt: undefined,
      capacity: undefined,
      isPublic: true,
      requirePayment: false,
      amount: undefined,
      status: "DRAFT",
    },
  })

  const requirePayment = form.watch("requirePayment")

  async function onSubmit(values: EventFormValues) {
    setFormError(null)
    const result = await createEvent(values)

    if (!result.success) {
      for (const [field, messages] of Object.entries(result.errors)) {
        if (!messages || messages.length === 0) continue
        if (field === "_form") {
          setFormError(messages[0])
          continue
        }
        form.setError(field as keyof EventFormValues, {
          message: messages[0],
        })
      }
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/events"
        className="mb-4 inline-block text-sm text-muted-foreground hover:underline"
      >
        ← 返回活動列表
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>建立活動</CardTitle>
          <CardDescription>請填寫以下資訊，建立一場新的活動</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-6"
            >
              {formError && (
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
                      <Textarea
                        placeholder="活動簡介、注意事項等"
                        {...field}
                      />
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
                        min={1}
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
                        開啟後報名者需繳費才能完成報名
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
                        <SelectItem value="DRAFT">草稿</SelectItem>
                        <SelectItem value="OPEN">開放報名</SelectItem>
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
                {form.formState.isSubmitting ? "建立中…" : "建立活動"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  )
}
