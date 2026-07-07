import { Redis } from "@upstash/redis"

import { hasUpstashEnv } from "@/lib/rate-limit"

// 寄信失敗的輕量可視化：失敗時把摘要塞進 Redis 的一個 capped list，
// /api/health（帶通行碼驗證時）回報近期失敗數與清單。
// 刻意不做完整重試佇列——目前的量級用不上，先讓「有信沒寄出去」這件事
// 至少看得見，承辦人可依名單手動補寄。

const FAILURE_LIST_KEY = "noyi-event:email-failures"
const MAX_ENTRIES = 50
const TTL_SECONDS = 7 * 24 * 60 * 60 // 保留 7 天

export type EmailFailureEntry = {
  at: string
  registrationId: string
  email: string
  eventTitle: string
  reason: string
}

// 呼叫端在報名主流程的 catch 裡使用，這裡再失敗也只記 log，
// 絕不能把例外往外丟影響報名。
export async function recordEmailFailure(entry: {
  registrationId: string
  email: string
  eventTitle: string
  reason: string
}): Promise<void> {
  if (!hasUpstashEnv()) {
    console.warn("Upstash 未設定，寄信失敗記錄僅保留在 log 中:", entry)
    return
  }
  try {
    const redis = Redis.fromEnv()
    const payload: EmailFailureEntry = {
      at: new Date().toISOString(),
      ...entry,
    }
    await redis.lpush(FAILURE_LIST_KEY, payload)
    await redis.ltrim(FAILURE_LIST_KEY, 0, MAX_ENTRIES - 1)
    await redis.expire(FAILURE_LIST_KEY, TTL_SECONDS)
  } catch (err) {
    console.error("寄信失敗記錄寫入 Redis 失敗:", err, entry)
  }
}

export async function getRecentEmailFailures(): Promise<{
  count: number
  recent: EmailFailureEntry[]
}> {
  if (!hasUpstashEnv()) {
    return { count: 0, recent: [] }
  }
  try {
    const redis = Redis.fromEnv()
    const recent = await redis.lrange<EmailFailureEntry>(
      FAILURE_LIST_KEY,
      0,
      MAX_ENTRIES - 1
    )
    return { count: recent.length, recent }
  } catch (err) {
    console.error("讀取寄信失敗記錄失敗:", err)
    return { count: -1, recent: [] } // -1 表示「讀不到」，與「沒有失敗」區分
  }
}
