import QRCode from "qrcode"

export function generateQrCodeBuffer(data: string): Promise<Buffer> {
  return QRCode.toBuffer(data, { type: "png" })
}
