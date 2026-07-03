"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { createRegistration } from "@/app/events/[id]/register/actions"
import {
  registrationFormSchema,
  branchGroups,
  otherBranchOption,
  type RegistrationFormValues,
} from "@/lib/validations/registration"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
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

export function RegistrationForm({ eventId }: { eventId: string }) {
  const [formError, setFormError] = useState<string | null>(null)
  const [result, setResult] = useState<"CONFIRMED" | "WAITLISTED" | null>(null)

  const form = useForm<RegistrationFormValues>({
    resolver: zodResolver(registrationFormSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      branch: undefined,
      note: "",
    },
  })

  async function onSubmit(values: RegistrationFormValues) {
    setFormError(null)
    const res = await createRegistration(eventId, values)

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
          <CardTitle>
            {result === "CONFIRMED" ? "報名成功" : "已加入候補名單"}
          </CardTitle>
          <CardDescription>
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
        <CardTitle>報名表單</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {formError && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
