"use client"

import Link from "next/link"

import { updateEvent } from "./actions"
import { EventForm } from "@/components/event-form"
import type { EventEditValues } from "@/lib/validations/event"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type EditEventFormProps = {
  eventId: string
  defaultValues: EventEditValues
  hasRegistrations: boolean
  confirmedCount: number
}

export function EditEventForm({
  eventId,
  defaultValues,
  hasRegistrations,
  confirmedCount,
}: EditEventFormProps) {
  return (
    <div className="theme-orange flex-1 bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/events"
        className="mb-4 inline-block text-base text-muted-foreground hover:underline"
      >
        ← 返回活動列表
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">編輯活動</CardTitle>
          <CardDescription>
            {hasRegistrations
              ? "此活動已有人報名，繳費設定無法修改，名額有下限限制"
              : "此活動尚無人報名，所有欄位皆可修改"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EventForm
            defaultValues={defaultValues}
            statusOptions={[
              { value: "DRAFT", label: "草稿" },
              { value: "OPEN", label: "開放報名" },
              { value: "CLOSED", label: "已截止" },
              { value: "CANCELLED", label: "已取消" },
            ]}
            lockPaymentFields={hasRegistrations}
            minCapacity={confirmedCount}
            submitLabel="儲存變更"
            submittingLabel="儲存中…"
            onSubmit={(values) => updateEvent(eventId, values)}
          />
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
