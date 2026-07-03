import { z } from "zod"

export const branchGroups = [
  {
    label: "直營分行",
    options: [
      "台北中山-台北分行",
      "台北大同-碩信分行",
      "桃園-桃園分行",
      "新竹-新竹分行",
      "台中西屯-台中分行",
      "嘉義西區-嘉義分行",
      "台南永康-台南分行",
      "高雄前鎮-高雄分行",
    ],
  },
  {
    label: "合作夥伴單位",
    options: [
      "台北中山-松江分行",
      "新竹-光復分行",
      "台中西屯-聚衆分行",
      "台南永康-加豐事業部",
      "高雄前鎮-旭立事業部",
      "高雄前鎮-承毅事業部",
      "高雄左營-聚衆分行(高雄)",
    ],
  },
] as const

export const otherBranchOption = "其他/非公司同仁" as const

export const branchOptions = [
  ...branchGroups.flatMap((group) => group.options),
  otherBranchOption,
] as const

// 手機：09 開頭 10 碼；市話：區碼（0 開頭，第二碼 2-8，09 保留給手機）+ 6-9 碼號碼。
// 去除使用者輸入中的連字號與空白後再比對，允許「0912-345-678」「02-1234-5678」等常見寫法。
const phoneRegex = /^(?:09\d{8}|0[2-8]\d{6,9})$/

export const registrationFormSchema = z.object({
  name: z.string().trim().min(2, "姓名至少需要 2 個字"),
  // email 統一轉小寫、去除頭尾空白後再比對／儲存，避免同一個信箱因大小寫或空白不同而繞過重複報名檢查。
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("請輸入正確的 Email 格式")),
  phone: z
    .string()
    .trim()
    .optional()
    .refine(
      (val) => !val || phoneRegex.test(val.replace(/[-\s]/g, "")),
      "電話格式不正確（手機請輸入 09 開頭 10 碼，市話請包含區碼）"
    ),
  branch: z.enum(branchOptions).optional(),
  note: z.string().trim().optional(),
})

export type RegistrationFormValues = z.infer<typeof registrationFormSchema>
