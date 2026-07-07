"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import {
  ADMIN_SESSION_COOKIE,
  createSessionToken,
  passcodeMatches,
} from "@/lib/admin-auth"
import {
  checkRateLimit,
  createRateLimiter,
  getClientIp,
  hasUpstashEnv,
} from "@/lib/rate-limit"

export async function verifyPasscode(
  passcode: string,
  from: string
): Promise<{ error: string }> {
  const adminPasscode = process.env.ADMIN_PASSCODE
  if (!adminPasscode) {
    return { error: "系統尚未設定通行碼（ADMIN_PASSCODE），請聯絡系統管理者" }
  }

  // 通行碼是全站唯一的身分防線，正式環境若 Upstash 環境變數缺失，
  // 等於暴力嘗試不受任何限制，因此直接拒絕登入（fail closed）。
  // 本機開發環境維持放行，不強制架 Redis 才能登入。
  if (process.env.NODE_ENV === "production" && !hasUpstashEnv()) {
    console.error(
      "UPSTASH_REDIS_REST_URL/TOKEN 未設定，正式環境拒絕通行碼登入（fail closed）"
    )
    return { error: "系統安全設定不完整，暫時無法登入，請聯絡系統管理者" }
  }

  const limiter = createRateLimiter(
    "noyi-event:admin-login",
    // 同一來源 IP 每分鐘最多嘗試 5 次
    5,
    "1 m"
  )
  const rateLimit = await checkRateLimit(limiter, await getClientIp())
  if (rateLimit === "limited") {
    return { error: "嘗試次數過多，請一分鐘後再試" }
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
