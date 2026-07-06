import { Resend } from "resend"

const globalForResend = globalThis as unknown as {
  resend: Resend | undefined
}

// 金鑰檢查刻意延後到「實際要寄信」的當下才執行，模組載入時不做任何檢查。
// 若在模組頂層就 throw，任何 import 到這裡的 Server Action 會在 module
// evaluation 階段直接爆掉，呼叫端「寄信失敗不影響報名」的 try-catch
// 根本沒機會生效（2026-07-06 正式站報名全面 500 即因此而起）。
export function getResend(): Resend {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set")
  }

  if (!globalForResend.resend) {
    globalForResend.resend = new Resend(apiKey)
  }

  return globalForResend.resend
}
