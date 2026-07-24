"use client"

import { useState, useTransition } from "react"

import { undoCheckIn } from "./actions"
import { Button } from "@/components/ui/button"

// 誤刷復原：改用跟 CancelRegistrationButton 同一套兩段式確認（先點一次
// 展開「確定取消／保留」，再點一次才真的送出）。取消報到跟取消報名
// 不同——當事人不會回頭重新掃碼，一旦誤點，紀錄會永久停在「尚未
// 報到」且沒有提示能發現這個落差，門檻不能只跟繳費標記一樣單擊即生效。
//
// windowClosed（報到有效窗已關閉）時直接不給操作，換成說明文字：窗口
// 關閉代表對方已經無法重新掃碼報到，此時取消只會讓「已報到」的正確
// 紀錄永久消失且無法挽回——跟報名/報到本身「窗口外一律擋下」同一套
// 時間邊界原則，不做「允許但警告」的例外。後端 undoCheckIn 另有相同的
// 硬性檢查（這裡只是介面引導，防止繞過前端直接呼叫 action）。
export function UndoCheckInButton({
  registrationId,
  name,
  windowClosed,
}: {
  registrationId: string
  name: string
  windowClosed: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      const result = await undoCheckIn(registrationId)
      if (!result.success) {
        setError(result.error)
        setConfirming(false)
      }
      // 成功時 action 已 revalidate，本列會變回「尚未報到」
    })
  }

  if (windowClosed) {
    return (
      <span className="text-sm text-muted-foreground">
        報到時間已截止，無法取消報到
      </span>
    )
  }

  if (!confirming) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirming(true)}
        >
          取消報到
        </Button>
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-base">
        確定取消 {name} 的報到？當事人需重新掃碼才能再次報到
      </span>
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
