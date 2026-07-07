import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// DATABASE_URL 檢查刻意延後到「第一次實際使用」才執行，模組載入時不做任何檢查。
// 若在模組頂層就 throw，任何 import 到這裡的模組（含 /api/health 本身）會在
// module evaluation 階段直接爆掉，呼叫端的 try-catch 根本沒機會生效，
// health 也無法回報「缺的是哪個環境變數」。與 resend.ts 的延遲初始化同一套修法。
function getPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const adapter = new PrismaNeon({ connectionString });
  const client = new PrismaClient({ adapter });
  globalForPrisma.prisma = client;
  return client;
}

// 用 Proxy 讓既有的 `import { prisma }` 呼叫端完全不用改：
// 第一次存取任何屬性（prisma.event、prisma.$transaction…）時才真正建立連線。
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const value = Reflect.get(client, prop);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
