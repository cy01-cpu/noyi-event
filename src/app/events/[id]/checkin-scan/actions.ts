"use server"

import { performCheckIn, type CheckInResult } from "@/lib/checkin"

// event_mismatch 判斷已併入 performCheckIn（同一次查詢內完成），
// 這裡不再對同一個 token 先行多查一次資料庫。
export type CheckInActionResult = CheckInResult

export async function checkInAttendee(
  eventId: string,
  token: string,
  gate?: string
): Promise<CheckInActionResult> {
  return performCheckIn(token, { gate, expectedEventId: eventId })
}
