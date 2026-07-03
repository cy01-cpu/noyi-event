import { AdminLoginForm } from "./admin-login-form"

// searchParams 在 Server Component 讀取後傳給 Client 表單，
// 避免在 Client Component 用 useSearchParams 而需要額外的 Suspense 邊界。
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>
}) {
  const { from } = await searchParams
  return <AdminLoginForm from={from ?? "/events"} />
}
