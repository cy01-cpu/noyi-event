import { z } from "zod";

// 注意：amount 這裡驗證的單位是「元」（使用者在表單上輸入的單位）。
// 轉換成資料庫的「分」單位（× 100）在 src/app/events/actions.ts 進行，這裡不處理。
export const eventFormSchema = z
  .object({
    title: z.string().min(2, "活動名稱至少需要 2 個字"),
    description: z.string().optional(),
    location: z.string().optional(),
    startAt: z.date("請選擇活動開始時間"),
    endAt: z.date().optional(),
    capacity: z.number("名額必須是數字").int("名額必須是整數").positive("名額必須大於 0").optional(),
    isPublic: z.boolean(),
    requirePayment: z.boolean(),
    amount: z.number("金額必須是數字").positive("金額必須大於 0").optional(),
    status: z.enum(["DRAFT", "OPEN"]),
  })
  .refine((data) => !data.endAt || data.endAt > data.startAt, {
    message: "結束時間必須晚於開始時間",
    path: ["endAt"],
  })
  .refine(
    (data) => !data.requirePayment || (data.amount !== undefined && data.amount > 0),
    {
      message: "開啟「需要繳費」後，金額為必填且必須大於 0",
      path: ["amount"],
    }
  );

export type EventFormValues = z.infer<typeof eventFormSchema>;
