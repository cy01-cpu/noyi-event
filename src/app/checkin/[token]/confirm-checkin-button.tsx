"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import { confirmCheckIn } from "./actions"
import { Button } from "@/components/ui/button"

export function ConfirmCheckInButton({ token }: { token: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await confirmCheckIn(token)
      if (result.success || result.reason === "already_checked_in") {
        // 報到狀態由 server component 渲染，refresh 讓頁面顯示最新結果
        //（already_checked_in＝別的入口剛好先掃到，同樣刷新顯示已報到）
        router.refresh()
      } else if (result.reason === "unauthorized") {
        setError("通行碼驗證已失效，請重新登入後再操作")
      } else if (result.reason === "outside_window") {
        setError(
          Date.now() < new Date(result.opensAt).getTime()
            ? "報到尚未開放，活動當天才能報到"
            : "活動已結束，報到時間已截止"
        )
      } else {
        setError("報到失敗，請改用掃描頁或聯絡系統管理者")
      }
    })
  }

  return (
    <div className="space-y-2">
      <Button
        size="lg"
        className="w-full text-lg"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? "報到中…" : "確認報到"}
      </Button>
      {error && <p className="text-base text-destructive">{error}</p>}
    </div>
  )
}
