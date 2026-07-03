"use server"

import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/prisma"

type TogglePaymentResult =
  | { success: true }
  | { success: false; error: string }

export async function togglePaymentStatus(
  registrationId: string,
  isPaid: boolean
): Promise<TogglePaymentResult> {
  try {
    const registration = await prisma.registration.update({
      where: { id: registrationId },
      data: {
        isPaid,
        // 標記已繳費時記錄當下時間，取消標記則清空（雙向可切換，點錯可復原）
        paidAt: isPaid ? new Date() : null,
      },
    })

    revalidatePath(`/events/${registration.eventId}/attendees`)
    return { success: true }
  } catch {
    return { success: false, error: "更新繳費狀態時發生錯誤，請稍後再試" }
  }
}
