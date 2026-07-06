import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="theme-orange flex flex-1 flex-col items-center justify-center bg-background px-4 py-16 text-foreground">
      <main className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
        <span className="rounded-full bg-secondary px-4 py-1.5 text-base font-medium text-secondary-foreground">
          諾億保經
        </span>
        <h1 className="text-4xl font-bold tracking-tight">諾億活動管理系統</h1>
        <p className="text-lg text-muted-foreground">
          建立活動、開放報名、現場掃碼報到，一站完成
        </p>
        <Button asChild size="lg">
          <Link href="/events">進入活動列表</Link>
        </Button>
      </main>
    </div>
  );
}
