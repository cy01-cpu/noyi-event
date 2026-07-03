import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth"

// 公開報名頁 /events/{id}/register 開放所有人存取，其餘 /events 底下
// 一律視為內部頁面。Server Action 的 POST 會打到所在頁面的路徑，
// 所以報名表單送出（POST /events/{id}/register）同樣會被此規則放行。
const PUBLIC_REGISTER_PATTERN = /^\/events\/[^/]+\/register$/

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_REGISTER_PATTERN.test(pathname)) {
    return NextResponse.next()
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value
  if (verifySessionToken(token, process.env.ADMIN_PASSCODE)) {
    return NextResponse.next()
  }

  const loginUrl = new URL("/admin-login", request.url)
  loginUrl.searchParams.set("from", pathname)
  return NextResponse.redirect(loginUrl)
}

// 用路徑前綴涵蓋整個 /events 底下（含未來新增的內部頁面，不必逐頁列舉）。
// /checkin/* 與首頁不在 matcher 內，維持公開。
export const config = {
  matcher: ["/events/:path*"],
}
