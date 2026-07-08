"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { createRegistration } from "@/app/events/[id]/register/actions"
import {
  registrationFormSchema,
  branchGroups,
  otherBranchOption,
} from "@/lib/validations/registration"
import {
  buildCustomFieldsSchema,
  type CustomFieldDefinition,
  type CustomFieldValues,
} from "@/lib/validations/event-form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Form,
  FormControl,
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

export function RegistrationForm({
  eventId,
  formFields,
}: {
  eventId: string
  formFields: CustomFieldDefinition[]
}) {
  const [formError, setFormError] = useState<string | null>(null)
  const [result, setResult] = useState<"CONFIRMED" | "WAITLISTED" | null>(null)

  // registrationFormSchema 沒有 object-level .refine（只有 phone 欄位級
  // 的 .refine），可以直接合併成單一動態 schema，不用像後台編輯活動
  // 那樣拆成兩個 form（見 src/components/event-form.tsx 的註解）。
  const combinedSchema = z.object({
    ...registrationFormSchema.shape,
    customFields: buildCustomFieldsSchema(formFields),
  })
  type CombinedValues = z.infer<typeof combinedSchema>

  const form = useForm<CombinedValues>({
    resolver: zodResolver(combinedSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      branch: undefined,
      note: "",
      customFields: {},
    },
  })

  async function onSubmit(values: CombinedValues) {
    setFormError(null)
    const { customFields, ...registrationValues } = values
    // customFields 的型別來自動態組出的 z.object(shape)，TS 只能推得
    // Record<string, unknown>；實際形狀由 buildCustomFieldsSchema 保證，
    // 送到 Server Action 後也會依同一份 schema 重新驗證一次，不是信任
    // 這個 cast 本身。
    const res = await createRegistration(
      eventId,
      registrationValues,
      customFields as CustomFieldValues
    )

    if (!res.success) {
      setFormError(res.error)
      return
    }

    setResult(res.status)
  }

  if (result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">
            {result === "CONFIRMED" ? "報名成功" : "已加入候補名單"}
          </CardTitle>
          <CardDescription className="text-base">
            {result === "CONFIRMED"
              ? "報名成功，請注意信箱"
              : "目前活動人數已滿，您已成功加入候補名單，若有名額釋出將以信箱通知您"}
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">報名表單</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {formError && (
              <p className="rounded-lg bg-red-100 px-3.5 py-2.5 text-base text-red-800">
                {formError}
              </p>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>姓名</FormLabel>
                  <FormControl>
                    <Input placeholder="請輸入姓名" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="name@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>電話（選填）</FormLabel>
                  <FormControl>
                    <Input placeholder="0912-345-678" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="branch"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>所屬分行/單位（選填）</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="請選擇所屬分行/單位" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {branchGroups.map((group) => (
                        <SelectGroup key={group.label}>
                          <SelectLabel>{group.label}</SelectLabel>
                          {group.options.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                      <SelectItem value={otherBranchOption}>
                        {otherBranchOption}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>備註（選填）</FormLabel>
                  <FormControl>
                    <Textarea placeholder="飲食禁忌等備註事項" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {formFields.map((customField) => (
              <FormField
                key={customField.id}
                control={form.control}
                name={`customFields.${customField.id}` as const}
                render={({ field }) => (
                  <FormItem
                    className={
                      customField.type === "CHECKBOX"
                        ? "flex flex-row items-center gap-2.5 space-y-0"
                        : undefined
                    }
                  >
                    {customField.type === "CHECKBOX" ? (
                      <>
                        <FormControl>
                          <Checkbox
                            checked={Boolean(field.value)}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="font-normal">
                          {customField.label}
                        </FormLabel>
                      </>
                    ) : customField.type === "SELECT" ? (
                      <>
                        <FormLabel>
                          {customField.label}
                          {customField.required && "（必填）"}
                        </FormLabel>
                        <Select
                          value={typeof field.value === "string" ? field.value : undefined}
                          onValueChange={field.onChange}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder={`請選擇：${customField.label}`} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {customField.options.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </>
                    ) : (
                      <>
                        <FormLabel>
                          {customField.label}
                          {customField.required && "（必填）"}
                        </FormLabel>
                        <FormControl>
                          <Input
                            value={typeof field.value === "string" ? field.value : ""}
                            onChange={field.onChange}
                          />
                        </FormControl>
                      </>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}

            <Button
              type="submit"
              disabled={form.formState.isSubmitting}
              className="w-full"
            >
              {form.formState.isSubmitting ? "送出中…" : "送出報名"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}
