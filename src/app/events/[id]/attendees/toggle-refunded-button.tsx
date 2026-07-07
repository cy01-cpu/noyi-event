"use client"

import { useState, useTransition } from "react"

import { toggleRefundStatus } from "./actions"
import { usePaidOperator } from "./paid-operator"
import { Button } from "@/components/ui/button"

// 退費標記按鈕：與 TogglePaidButton 同一套模式，經手人共用頁面上的
// 「收費經手人/站別」輸入框（PaidOperatorProvider），雙向可切換防點錯。
export function ToggleRefundedButton({
  registrationId,
  refunded,
}: {
  registrationId: string
  refunded: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const operator = usePaidOperator()

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await toggleRefundStatus(
        registrationId,
        !refunded,
        // 經手人只在「標記已退費」時有意義，取消標記由後端一併清空
        operator || undefined
      )
      if (!result.success) {
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? "更新中…" : refunded ? "取消退費標記" : "標記已退費"}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  )
}
