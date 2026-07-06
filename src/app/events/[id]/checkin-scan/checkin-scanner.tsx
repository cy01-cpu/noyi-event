"use client"

import { useEffect, useRef, useState } from "react"
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode"
import { format } from "date-fns"

import { checkInAttendee, type CheckInActionResult } from "./actions"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

const SCAN_COOLDOWN_MS = 3000
const FEEDBACK_DISPLAY_MS = 2000
const READER_ELEMENT_ID = "checkin-scan-reader"

type Feedback = {
  variant: "success" | "warning" | "error"
  message: string
}

function extractTokenFromScannedText(text: string): string | null {
  try {
    const url = new URL(text)
    const segments = url.pathname.split("/").filter(Boolean)
    return segments[segments.length - 1] || null
  } catch {
    // 不是完整網址格式時，當作掃到的內容本身就是 token
    return text.trim() || null
  }
}

function toFeedback(result: CheckInActionResult): Feedback {
  if (result.success) {
    return { variant: "success", message: `報到成功：${result.name}` }
  }

  switch (result.reason) {
    case "event_mismatch":
      return { variant: "error", message: "此報名不屬於本活動" }
    case "not_found":
      return { variant: "error", message: "查無此報名資料" }
    case "not_confirmed":
      return { variant: "error", message: "此報名尚未確認，無法報到" }
    case "already_checked_in":
      return {
        variant: "warning",
        message: `已報到過（${format(result.checkedAt, "HH:mm")}${
          result.gate ? `・${result.gate}` : ""
        }）`,
      }
  }
}

export default function CheckinScanner({ eventId }: { eventId: string }) {
  const [gate, setGate] = useState("")
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const gateRef = useRef(gate)
  const isProcessingRef = useRef(false)
  const lastScanRef = useRef<{ token: string; time: number } | null>(null)
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    gateRef.current = gate
  }, [gate])

  useEffect(() => {
    const scanner = new Html5Qrcode(READER_ELEMENT_ID)

    async function handleScanSuccess(decodedText: string) {
      if (isProcessingRef.current) return

      const token = extractTokenFromScannedText(decodedText)
      if (!token) return

      const now = Date.now()
      const last = lastScanRef.current
      if (last && last.token === token && now - last.time < SCAN_COOLDOWN_MS) {
        return
      }
      lastScanRef.current = { token, time: now }

      isProcessingRef.current = true
      try {
        const result = await checkInAttendee(eventId, token, gateRef.current || undefined)

        setFeedback(toFeedback(result))
        if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current)
        feedbackTimeoutRef.current = setTimeout(
          () => setFeedback(null),
          FEEDBACK_DISPLAY_MS
        )
      } finally {
        isProcessingRef.current = false
      }
    }

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        handleScanSuccess,
        () => {
          // 每次畫面中沒讀到 QR Code 都會觸發，屬正常情況，不需處理
        }
      )
      .catch(() => {
        // 常見於裝置沒有鏡頭、或使用者拒絕相機權限
        setCameraError("無法啟動鏡頭，請確認裝置有鏡頭且已允許瀏覽器使用相機權限")
      })

    return () => {
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current)

      // stop() 在掃描器從未成功啟動（例如上面 start() 失敗）時會直接同步拋出
      // "Cannot stop, scanner is not running or paused"，而不是回傳 rejected
      // promise，所以外層再包一層 try/catch 才攔得到。官方 getState() 可回傳
      // Html5QrcodeScannerState（NOT_STARTED/SCANNING/PAUSED），只有在
      // SCANNING 或 PAUSED 時呼叫 stop() 才是安全的。
      try {
        const state = scanner.getState()
        if (
          state === Html5QrcodeScannerState.SCANNING ||
          state === Html5QrcodeScannerState.PAUSED
        ) {
          scanner
            .stop()
            .then(() => scanner.clear())
            .catch(() => {
              // 元件卸載時停止相機失敗不影響使用者體驗，忽略即可
            })
        }
      } catch {
        // 忽略：極少數情況下 getState()/stop() 仍可能同步拋出錯誤
      }
    }
  }, [eventId])

  return (
    <div className="theme-forest flex-1 bg-background text-foreground">
      <div className="mx-auto max-w-md space-y-4 px-4 py-8">
      <div className="space-y-1.5">
        <Label htmlFor="gate">目前站別/入口（選填）</Label>
        <Input
          id="gate"
          placeholder="例如：入口A"
          value={gate}
          onChange={(e) => setGate(e.target.value)}
        />
      </div>

      {cameraError ? (
        <Card>
          <CardHeader>
            <CardTitle>無法啟動鏡頭</CardTitle>
            <CardDescription>{cameraError}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div
          id={READER_ELEMENT_ID}
          className="overflow-hidden rounded-lg border-2 border-forest-linen-brown"
        />
      )}

      {/* 現場掃描回饋：字級加大、實色深字對淺底 ≥6:1（WCAG AA ✓），
          好讓工作人員在走動、光線不佳時一眼看清結果 */}
      {feedback && (
        <div
          className={cn(
            "rounded-lg px-4 py-3 text-lg font-semibold",
            feedback.variant === "success" && "bg-green-100 text-green-800",
            feedback.variant === "warning" && "bg-amber-100 text-amber-800",
            feedback.variant === "error" && "bg-red-100 text-red-800"
          )}
        >
          {feedback.message}
        </div>
      )}
      </div>
    </div>
  )
}
