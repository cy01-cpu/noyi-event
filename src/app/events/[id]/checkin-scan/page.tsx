"use client"

import dynamic from "next/dynamic"
import { useParams } from "next/navigation"

// html5-qrcode 需要瀏覽器的相機/DOM API，用 next/dynamic + ssr:false
// 避免 Server Component 預渲染階段執行到瀏覽器專屬程式碼而出錯。
const CheckinScanner = dynamic(() => import("./checkin-scanner"), {
  ssr: false,
})

export default function CheckinScanPage() {
  const { id } = useParams<{ id: string }>()

  return <CheckinScanner eventId={id} />
}
