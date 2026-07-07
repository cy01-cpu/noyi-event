"use client"

import { useState, useTransition } from "react"

import { cancelRegistration } from "./actions"
import { Button } from "@/components/ui/button"

// 取消報名無法自助復原（要重新報名），採兩段式確認防誤觸：
// 第一下展開「確定取消／保留」，再點一次才真的送出。
// 已繳費者的確認文字改為帶金額的退費提醒（paidAmountLabel 由
// 名單頁依 event.amount 算好傳入，例如「NT$500」）。
export function CancelRegistrationButton({
  registrationId,
  name,
  paidAmountLabel,
}: {
  registrationId: string
  name: string
  // 該筆已繳費時傳入金額標籤；未繳費傳 null，顯示一般提示
  paidAmountLabel: string | null
}) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      const result = await cancelRegistration(registrationId)
      if (!result.success) {
        setError(result.error)
        setConfirming(false)
      }
      // 成功時 action 已 revalidate，本列狀態徽章會更新為「已取消」，
      // 若有候補自動遞補，名單上對應列的徽章也會同步轉為「已確認」
    })
  }

  if (!confirming) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirming(true)}
        >
          取消報名
        </Button>
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {paidAmountLabel ? (
        <span className="w-full rounded-lg bg-orange-100 px-3.5 py-2.5 text-base font-medium text-orange-800">
          {name} 已繳費 {paidAmountLabel}，取消後請記得處理退費，確定要取消嗎？
        </span>
      ) : (
        <span className="text-base">確定取消 {name} 的報名？</span>
      )}
      <Button
        variant="destructive"
        size="sm"
        onClick={handleConfirm}
        disabled={isPending}
      >
        {isPending ? "取消中…" : "確定取消"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setConfirming(false)}
        disabled={isPending}
      >
        保留
      </Button>
    </div>
  )
}
