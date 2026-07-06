"use client"

import { useState } from "react"

import { verifyPasscode } from "./actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

export function AdminLoginForm({ from }: { from: string }) {
  const [passcode, setPasscode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!passcode || isSubmitting) return
    setError(null)
    setIsSubmitting(true)
    try {
      // 驗證成功時 server action 內部會 redirect（throw），不會執行到 setError
      const result = await verifyPasscode(passcode, from)
      setError(result.error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="theme-forest flex-1 bg-background text-foreground">
      <div className="mx-auto max-w-sm px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">內部頁面</CardTitle>
          <CardDescription className="text-base">
            請輸入通行碼以繼續
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="rounded-lg bg-red-100 px-3.5 py-2.5 text-base text-red-800">
                {error}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="passcode">通行碼</Label>
              <Input
                id="passcode"
                type="password"
                autoFocus
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "驗證中…" : "進入"}
            </Button>
          </form>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
