"use server"

import { Prisma } from "@prisma/client"

import { prisma } from "@/lib/prisma"
import {
  registrationFormSchema,
  type RegistrationFormValues,
} from "@/lib/validations/registration"

type CreateRegistrationResult =
  | { success: true; status: "CONFIRMED" | "WAITLISTED" }
  | { success: false; error: string }

export async function createRegistration(
  eventId: string,
  values: RegistrationFormValues
): Promise<CreateRegistrationResult> {
  const parsed = registrationFormSchema.safeParse(values)

  if (!parsed.success) {
    return { success: false, error: "表單資料有誤，請確認後再試一次" }
  }

  const data = parsed.data

  const event = await prisma.event.findUnique({ where: { id: eventId } })

  if (!event) {
    return { success: false, error: "找不到此活動" }
  }

  if (event.status !== "OPEN") {
    return { success: false, error: "此活動目前未開放報名" }
  }

  try {
    const registration = await prisma.$transaction(async (tx) => {
      let status: "CONFIRMED" | "WAITLISTED" = "CONFIRMED"

      if (event.capacity !== null) {
        const confirmedCount = await tx.registration.count({
          where: { eventId, status: "CONFIRMED" },
        })
        if (confirmedCount >= event.capacity) {
          status = "WAITLISTED"
        }
      }

      return tx.registration.create({
        data: {
          eventId,
          name: data.name,
          email: data.email,
          // phone 未填時存 null（而非空字串），刻意利用 Postgres
          // unique 限制中「NULL 不等於 NULL」的特性：不收電話的活動，
          // 同名同姓的不同真人才不會被誤判為重複報名而擋下。
          phone: data.phone || null,
          branch: data.branch ?? null,
          note: data.note || null,
          status,
        },
      })
    })

    return {
      success: true,
      status: registration.status as "CONFIRMED" | "WAITLISTED",
    }
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return {
        success: false,
        error: "您已經用這個 Email 和姓名報名過這場活動了",
      }
    }
    return { success: false, error: "報名時發生錯誤，請稍後再試" }
  }
}
