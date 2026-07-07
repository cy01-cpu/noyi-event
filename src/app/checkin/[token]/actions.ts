"use server"

import { cookies } from "next/headers"

import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth"
import { performCheckIn, type CheckInResult } from "@/lib/checkin"

export type ConfirmCheckInResult =
  | CheckInResult
  | { success: false; reason: "unauthorized" }

// 報到寫入只允許工作人員（帶有效通行碼 cookie）觸發。
// 這個 action 掛在公開路徑 /checkin/[token] 底下，不受 proxy.ts 的
// /events matcher 保護，所以通行碼驗證必須在這裡自己做——
// 頁面上「沒登入就不顯示按鈕」只是介面引導，不是安全防線。
export async function confirmCheckIn(
  token: string
): Promise<ConfirmCheckInResult> {
  const cookieStore = await cookies()
  const isStaff = verifySessionToken(
    cookieStore.get(ADMIN_SESSION_COOKIE)?.value,
    process.env.ADMIN_PASSCODE
  )
  if (!isStaff) {
    return { success: false, reason: "unauthorized" }
  }

  return performCheckIn(token)
}
