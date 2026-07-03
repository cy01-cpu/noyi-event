import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"

export type CheckInResult =
  | { success: true; name: string; eventTitle: string; checkedAt: Date }
  | { success: false; reason: "not_found" }
  | { success: false; reason: "not_confirmed"; status: string }
  | {
      success: false
      reason: "already_checked_in"
      checkedAt: Date
      gate: string | null
    }

export async function performCheckIn(
  token: string,
  gate?: string
): Promise<CheckInResult> {
  const registration = await prisma.registration.findUnique({
    where: { token },
    include: { event: true },
  })

  if (!registration) {
    return { success: false, reason: "not_found" }
  }

  if (registration.status !== "CONFIRMED") {
    return {
      success: false,
      reason: "not_confirmed",
      status: registration.status,
    }
  }

  try {
    const checkIn = await prisma.checkIn.create({
      data: { registrationId: registration.id, gate: gate || null },
    })

    return {
      success: true,
      name: registration.name,
      eventTitle: registration.event.title,
      checkedAt: checkIn.checkedAt,
    }
  } catch (err) {
    // registrationId 的 unique 限制天生具備併發保護：多個入口同時掃到
    // 同一人，只有第一筆 create 會成功，其餘都會落在這個 P2002 分支，
    // 不需要額外寫 transaction 鎖定邏輯。
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const existing = await prisma.checkIn.findUnique({
        where: { registrationId: registration.id },
      })

      return {
        success: false,
        reason: "already_checked_in",
        checkedAt: existing!.checkedAt,
        gate: existing!.gate,
      }
    }
    throw err
  }
}
