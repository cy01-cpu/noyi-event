"use server"

import { revalidatePath } from "next/cache"

import { prisma } from "@/lib/prisma"

type TogglePaymentResult =
  | { success: true }
  | { success: false; error: string }

export async function togglePaymentStatus(
  registrationId: string,
  isPaid: boolean,
  // 繳費稽核軌跡：操作者自填的站別/姓名（仿報到的 gate 欄位模式，選填）
  operator?: string
): Promise<TogglePaymentResult> {
  try {
    const paidBy = operator?.trim().slice(0, 50) || null

    const registration = await prisma.registration.update({
      where: { id: registrationId },
      data: {
        isPaid,
        // 標記已繳費時記錄當下時間與經手人，取消標記則一併清空
        // （雙向可切換，點錯可復原）
        paidAt: isPaid ? new Date() : null,
        paidBy: isPaid ? paidBy : null,
      },
    })

    revalidatePath(`/events/${registration.eventId}/attendees`)
    return { success: true }
  } catch {
    return { success: false, error: "更新繳費狀態時發生錯誤，請稍後再試" }
  }
}
