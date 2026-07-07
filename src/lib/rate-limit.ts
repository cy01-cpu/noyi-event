import { headers } from "next/headers"
import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"

// Vercel 是無伺服器架構，請求會分派到不同執行環境，記憶體內的計數器
// 無法跨實例累加，因此頻率限制統一記在 Upstash Redis。
// admin-login 與公開報名表單共用這一套模式，只差 prefix 與額度。

export function hasUpstashEnv(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  )
}

type Duration = Parameters<typeof Ratelimit.slidingWindow>[1]

// 未設定 Upstash 環境變數時回傳 null（本機開發不強制架 Redis）。
// production 該不該放行由各呼叫端自行決定：登入這種安全敏感端點
// 應 fail closed，見 admin-login/actions.ts。
export function createRateLimiter(
  prefix: string,
  limit: number,
  window: Duration
): Ratelimit | null {
  if (!hasUpstashEnv()) {
    console.warn(
      `UPSTASH_REDIS_REST_URL/TOKEN 未設定，${prefix} 未啟用頻率限制`
    )
    return null
  }
  return new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(limit, window),
    prefix,
  })
}

// 取得客戶端 IP。採 x-real-ip：經查證 Vercel 官方文件，在沒有自建
// reverse proxy 的部署情境（本專案的情況）下，Vercel 邊緣網路本身就會
// 覆寫 x-forwarded-for，不會轉發客戶端偽造值，兩個標頭內容一致。
// 改用 x-real-ip 是為了語意更清楚、以及未來若在前面加了自建 proxy 時
// 多一層保險，並非修補一個正在被利用的漏洞。
export async function getClientIp(): Promise<string> {
  const headerStore = await headers()
  return (
    headerStore.get("x-real-ip")?.trim() ||
    headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  )
}

// limiter.limit() 失敗（Redis 連線異常等暫時性錯誤）時的行為在此統一決定：
// 記錄錯誤後放行。理由：頻率限制是輔助防線（通行碼比對、表單驗證等主防線
// 不受影響），Redis 短暫故障不應讓整個功能跟著癱瘓或直接 500。
// 注意這與「環境變數根本沒設」不同——那屬於部署設定錯誤，敏感端點應拒絕服務。
export async function checkRateLimit(
  limiter: Ratelimit | null,
  key: string
): Promise<"allowed" | "limited"> {
  if (!limiter) return "allowed"
  try {
    const { success } = await limiter.limit(key)
    return success ? "allowed" : "limited"
  } catch (err) {
    console.error("頻率限制檢查失敗（Redis 異常），本次放行:", err)
    return "allowed"
  }
}
