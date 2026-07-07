import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";
import { getRecentEmailFailures } from "@/lib/email-failures";

// 必要環境變數清單。只回報「有沒有設定」的布林值，絕不能回傳實際內容。
const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "RESEND_API_KEY",
  "ADMIN_PASSCODE",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "NEXT_PUBLIC_APP_URL",
] as const;

export async function GET() {
  const env = Object.fromEntries(
    REQUIRED_ENV_VARS.map((name) => [name, Boolean(process.env[name])])
  );
  const envOk = REQUIRED_ENV_VARS.every((name) => env[name]);

  let databaseOk = false;
  let eventCount: number | null = null;
  let databaseError: string | null = null;
  try {
    eventCount = await prisma.event.count();
    databaseOk = true;
  } catch (error) {
    databaseError = error instanceof Error ? error.message : String(error);
  }

  const ok = envOk && databaseOk;
  const status = ok ? 200 : 500;

  // 未帶有效通行碼 cookie 時只回報整體健康與否，不曝露個別環境變數的
  // 設定狀態（等於告訴外人「哪道防線沒開」）或 eventCount 等內部資訊。
  const cookieStore = await cookies();
  const isAdmin = verifySessionToken(
    cookieStore.get(ADMIN_SESSION_COOKIE)?.value,
    process.env.ADMIN_PASSCODE
  );

  if (!isAdmin) {
    return NextResponse.json({ ok }, { status });
  }

  // 帶通行碼驗證時回報完整細節，並順帶回報近期寄信失敗數
  //（count 為 -1 表示 Redis 讀取失敗，與「沒有失敗」區分）
  const emailFailures = await getRecentEmailFailures();

  return NextResponse.json(
    {
      ok,
      database: databaseOk,
      ...(databaseError !== null && { databaseError }),
      eventCount,
      env,
      emailFailures,
    },
    { status }
  );
}
