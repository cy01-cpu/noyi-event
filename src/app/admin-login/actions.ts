"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

import {
  ADMIN_SESSION_COOKIE,
  createSessionToken,
  passcodeMatches,
} from "@/lib/admin-auth"

// Vercel 是無伺服器架構，請求會分派到不同執行環境，記憶體內的計數器
// 無法跨實例累加，因此嘗試次數統一記在 Upstash Redis。
// 未設定 Upstash 環境變數時跳過頻率限制（方便本機開發），並在 log 提出警告。
function getRateLimiter(): Ratelimit | null {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    console.warn(
      "UPSTASH_REDIS_REST_URL/TOKEN 未設定，通行碼輸入未啟用頻率限制"
    )
    return null
  }
  return new Ratelimit({
    redis: Redis.fromEnv(),
    // 同一來源 IP 每分鐘最多嘗試 5 次
    limiter: Ratelimit.slidingWindow(5, "1 m"),
    prefix: "noyi-event:admin-login",
  })
}

export async function verifyPasscode(
  passcode: string,
  from: string
): Promise<{ error: string }> {
  const adminPasscode = process.env.ADMIN_PASSCODE
  if (!adminPasscode) {
    return { error: "系統尚未設定通行碼（ADMIN_PASSCODE），請聯絡系統管理者" }
  }

  const limiter = getRateLimiter()
  if (limiter) {
    const headerStore = await headers()
    const ip =
      headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    const { success } = await limiter.limit(ip)
    if (!success) {
      return { error: "嘗試次數過多，請一分鐘後再試" }
    }
  }

  if (!passcodeMatches(passcode, adminPasscode)) {
    return { error: "通行碼錯誤" }
  }

  const { token, maxAgeSeconds } = createSessionToken(adminPasscode)
  const cookieStore = await cookies()
  cookieStore.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  })

  // 防 open redirect：只接受站內相對路徑（排除 // 開頭的外部網址寫法）
  const safeFrom =
    from.startsWith("/") && !from.startsWith("//") ? from : "/events"
  redirect(safeFrom)
}
