import { createHmac, timingSafeEqual } from "node:crypto"

export const ADMIN_SESSION_COOKIE = "admin_session"

// 通行碼驗證成功後核發的 session 效期（30 天內同一瀏覽器免重新輸入）
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex")
}

// cookie 內容是「到期時間戳.HMAC簽章」，不存明文通行碼。
// 簽章金鑰就是 ADMIN_PASSCODE 本身：到 Vercel 更換通行碼並 redeploy 後，
// 所有既有 cookie 的簽章立即驗不過，等同全面登出，不需額外的撤銷機制。
export function createSessionToken(passcode: string): {
  token: string
  maxAgeSeconds: number
} {
  const exp = Date.now() + SESSION_TTL_MS
  return {
    token: `${exp}.${sign(String(exp), passcode)}`,
    maxAgeSeconds: Math.floor(SESSION_TTL_MS / 1000),
  }
}

export function verifySessionToken(
  token: string | undefined,
  passcode: string | undefined
): boolean {
  // 通行碼未設定時一律視為未驗證（fail closed），導向登入頁後會看到明確錯誤訊息
  if (!token || !passcode) return false

  const dotIndex = token.indexOf(".")
  if (dotIndex === -1) return false

  const exp = token.slice(0, dotIndex)
  const signature = token.slice(dotIndex + 1)

  const expMs = Number(exp)
  if (!Number.isFinite(expMs) || expMs < Date.now()) return false

  const expected = sign(exp, passcode)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function passcodeMatches(input: string, actual: string): boolean {
  // 用 timingSafeEqual 而非 ===，避免比對時間差被拿來逐字元推測通行碼
  const a = Buffer.from(input)
  const b = Buffer.from(actual)
  return a.length === b.length && timingSafeEqual(a, b)
}
