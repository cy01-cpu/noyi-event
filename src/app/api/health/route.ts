import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 必要環境變數清單。只回報「有沒有設定」的布林值，絕不能回傳實際內容
// （這是公開端點，洩漏金鑰等同外洩）。
const REQUIRED_ENV_VARS = [
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

  try {
    const eventCount = await prisma.event.count();
    return NextResponse.json(
      { ok: envOk, database: true, eventCount, env },
      { status: envOk ? 200 : 500 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        database: false,
        error: error instanceof Error ? error.message : String(error),
        env,
      },
      { status: 500 }
    );
  }
}
