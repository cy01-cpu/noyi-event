import type { Event } from "@prisma/client"

// 報名與報到的時間邊界規則（2026-07-07 拍板）：
// - 報名開放到「活動結束」為止；沒填結束時間則視為活動當天結束
// - 報到有效窗＝活動當天 00:00 起，到活動結束後 2 小時止
//
// 「當天」一律以台北時間計算：Vercel 伺服器時區是 UTC，直接用
// Date 的本地日界線會差 8 小時（晚上 8 點就被當成隔天）。台灣
// 無日光節約時間，固定 +8 偏移即可，不需引入時區函式庫。
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

// 報到在活動結束後保留的補登緩衝
export const CHECKIN_GRACE_AFTER_END_MS = 2 * 60 * 60 * 1000

type EventTimes = Pick<Event, "startAt" | "endAt">

// 台北時間中「包含 date 的那一天」的起點（00:00）
function startOfTaipeiDay(date: Date): Date {
  const shifted = date.getTime() + TAIPEI_OFFSET_MS
  return new Date(Math.floor(shifted / DAY_MS) * DAY_MS - TAIPEI_OFFSET_MS)
}

// 活動的有效結束時間：有 endAt 用 endAt，沒填則視為
// 活動開始日（台北時間）的 24:00
export function effectiveEndAt(event: EventTimes): Date {
  if (event.endAt) return event.endAt
  return new Date(startOfTaipeiDay(event.startAt).getTime() + DAY_MS)
}

export function isRegistrationClosed(
  event: EventTimes,
  now: Date = new Date()
): boolean {
  return now.getTime() >= effectiveEndAt(event).getTime()
}

export function getCheckInWindow(event: EventTimes): {
  opensAt: Date
  closesAt: Date
} {
  return {
    opensAt: startOfTaipeiDay(event.startAt),
    closesAt: new Date(
      effectiveEndAt(event).getTime() + CHECKIN_GRACE_AFTER_END_MS
    ),
  }
}
