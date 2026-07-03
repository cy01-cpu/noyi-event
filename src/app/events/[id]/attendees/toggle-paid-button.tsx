"use client"

import { useState, useTransition } from "react"

import { togglePaymentStatus } from "./actions"
import { Button } from "@/components/ui/button"

export function TogglePaidButton({
  registrationId,
  isPaid,
}: {
  registrationId: string
  isPaid: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await togglePaymentStatus(registrationId, !isPaid)
      if (!result.success) {
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="xs"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? "更新中…" : isPaid ? "取消標記" : "標記已繳費"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}
