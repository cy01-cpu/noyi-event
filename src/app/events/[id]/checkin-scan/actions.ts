"use server"

import { prisma } from "@/lib/prisma"
import { performCheckIn, type CheckInResult } from "@/lib/checkin"

export type CheckInActionResult =
  | CheckInResult
  | { success: false; reason: "event_mismatch" }

export async function checkInAttendee(
  eventId: string,
  token: string,
  gate?: string
): Promise<CheckInActionResult> {
  const registration = await prisma.registration.findUnique({
    where: { token },
    select: { eventId: true },
  })

  if (registration && registration.eventId !== eventId) {
    return { success: false, reason: "event_mismatch" }
  }

  return performCheckIn(token, gate)
}
