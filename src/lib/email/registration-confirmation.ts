import type { Event, Registration } from "@prisma/client"
import { format } from "date-fns"

import { resend } from "@/lib/resend"
import { generateQrCodeBuffer } from "@/lib/qrcode"

// Resend 測試網域，僅供開發/測試使用。
// 正式上線前，需先在 Resend 後台驗證公司網域，再把下方 from 改成該網域的地址。
const FROM_ADDRESS = "諾億保經活動通知 <onboarding@resend.dev>"

function formatEventDateRange(event: Event) {
  const start = format(event.startAt, "yyyy/MM/dd HH:mm")
  if (!event.endAt) return start
  return `${start} - ${format(event.endAt, "yyyy/MM/dd HH:mm")}`
}

export async function sendRegistrationConfirmation(
  registration: Registration,
  event: Event
) {
  const dateRange = formatEventDateRange(event)
  const location = event.location ?? "未提供"

  if (registration.status === "CONFIRMED") {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (!appUrl) {
      throw new Error("NEXT_PUBLIC_APP_URL is not set")
    }
    // /checkin/[token] 報到頁面尚未開發，QR Code 先產生對應格式，
    // 待報到功能完成後即可直接掃碼導向該頁面。
    const checkinUrl = `${appUrl}/checkin/${registration.token}`
    const qrCodeBuffer = await generateQrCodeBuffer(checkinUrl)

    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: registration.email,
      subject: `報名成功｜${event.title}`,
      html: `
        <p>您好 ${registration.name}，</p>
        <p>您已成功報名「${event.title}」。</p>
        <p>活動時間：${dateRange}</p>
        <p>活動地點：${location}</p>
        <p>以下 QR Code 為您的報到憑證，活動當天請出示（截圖保存或列印皆可）。</p>
      `,
      attachments: [
        {
          filename: "checkin-qrcode.png",
          // Resend Node SDK 對非 FormData 請求會用 JSON.stringify 組 request body，
          // 若直接傳原始 Buffer，會被序列化成 {"type":"Buffer","data":[...]}
          // 而非合法的圖檔內容，導致附件損毀。需先轉成 base64 字串。
          content: qrCodeBuffer.toString("base64"),
        },
      ],
    })

    if (error) {
      throw new Error(`Resend 寄信失敗: ${error.message}`)
    }
    return
  }

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: registration.email,
    subject: `候補通知｜${event.title}`,
    html: `
      <p>您好 ${registration.name}，</p>
      <p>「${event.title}」目前活動名額已滿，已將您列入候補名單。</p>
      <p>活動時間：${dateRange}</p>
      <p>活動地點：${location}</p>
      <p>若後續有名額釋出，將另行寄信通知您，謝謝您的耐心等候。</p>
    `,
  })

  if (error) {
    throw new Error(`Resend 寄信失敗: ${error.message}`)
  }
}
