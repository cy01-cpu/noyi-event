import { z } from "zod";

// 注意：amount 這裡驗證的單位是「元」（使用者在表單上輸入的單位）。
// 轉換成資料庫的「分」單位（× 100）在 Server Action 進行，這裡不處理。
//
// Zod 4 不允許在 .refine 之後再 .extend（會拋錯），所以建立/編輯兩種
// schema 改為共用同一份基底欄位，各自加上不同的 status 範圍後再套用
// 共通的交叉驗證規則。
const eventBaseFields = {
  title: z
    .string()
    .min(2, "活動名稱至少需要 2 個字")
    .max(100, "活動名稱最多 100 個字"),
  description: z.string().max(2000, "活動說明最多 2000 個字").optional(),
  location: z.string().max(100, "活動地點最多 100 個字").optional(),
  startAt: z.date("請選擇活動開始時間"),
  endAt: z.date().optional(),
  capacity: z.number("名額必須是數字").int("名額必須是整數").positive("名額必須大於 0").optional(),
  isPublic: z.boolean(),
  requirePayment: z.boolean(),
  amount: z.number("金額必須是數字").positive("金額必須大於 0").optional(),
};

function withEventRules<T extends z.ZodObject<typeof eventBaseFields & object>>(
  schema: T
) {
  return schema
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
}

// 建立活動：狀態只允許草稿/開放報名（新活動不該一出生就是已截止/已取消）
export const eventFormSchema = withEventRules(
  z.object({ ...eventBaseFields, status: z.enum(["DRAFT", "OPEN"]) })
);

// 編輯活動：開放完整的 EventStatus（含已截止、已取消）。
// 「已有報名時禁改繳費欄位」「名額不可低於已確認人數」這類需要查
// 資料庫的交叉驗證，在 updateEvent Server Action 處理，不放在 zod。
export const eventEditSchema = withEventRules(
  z.object({
    ...eventBaseFields,
    status: z.enum(["DRAFT", "OPEN", "CLOSED", "CANCELLED"]),
  })
);

export type EventFormValues = z.infer<typeof eventFormSchema>;
export type EventEditValues = z.infer<typeof eventEditSchema>;
