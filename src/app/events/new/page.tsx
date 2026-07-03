"use client"

import Link from "next/link"

import { createEvent } from "@/app/events/actions"
import { EventForm } from "@/components/event-form"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export default function NewEventPage() {
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
          <EventForm
            defaultValues={{
              title: "",
              description: "",
              location: "",
              startAt: undefined as unknown as Date,
              endAt: undefined,
              capacity: undefined,
              isPublic: true,
              requirePayment: false,
              amount: undefined,
              status: "DRAFT",
            }}
            statusOptions={[
              { value: "DRAFT", label: "草稿" },
              { value: "OPEN", label: "開放報名" },
            ]}
            submitLabel="建立活動"
            submittingLabel="建立中…"
            onSubmit={createEvent}
          />
        </CardContent>
      </Card>
    </div>
  )
}
