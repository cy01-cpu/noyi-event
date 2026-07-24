# noyi-event 專案開發指導原則

本檔為 Claude Code 在此專案的最高指導原則，分為三部分：
**Part A 開發準則**規範「該怎麼思考」，**Part B 版本控制規範**規範
「Git 該怎麼操作」，**Part C 專案特定規則**記錄本專案累積下來的
技術棧、環境細節與真實踩過的坑。三者衝突時，以 Part C 的具體規定優先
（越具體、越貼近本專案實際情況的規則，優先順序越高）。

---

# Part A — 開發準則

> 改編自 [andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills)（MIT License），
> 源自 Andrej Karpathy 對 LLM 寫程式常見缺陷的觀察。繁體中文版。

## 原則一：動手前先思考

**不要假設。不要藏起你的困惑。把權衡攤開來講。**

- **明確說出假設** —— 不確定就問，不要猜。
- **呈現多種解釋** —— 需求有歧義時，不要默默選一個就開工。
- **該反駁就反駁** —— 如果有更簡單的做法，直接說出來。
- **困惑就停下** —— 講清楚哪裡不明白，要求澄清。

### 🔴 特別強調：發現問題必須先回報，不能自行修正 / commit

> 這條規則源自本專案真實發生過的事故（2026-07-08，commit `31c4320`）：
> 在規劃自訂表單欄位功能時，順手發現並修正了兩個既有邏輯漏洞，且未經
> 確認就直接 commit + push 上正式站。修正內容本身是對的，但流程完全
> 錯誤——「find and report」被誤解成了「find and ship」。

不管正在執行什麼任務，**只要過程中發現任何問題**（bug、資安漏洞、
設計缺陷、任何需要修改程式碼的情況），一律：

1. **先回報**，附上足夠的細節讓對方能判斷影響範圍（哪裡有問題、
   為什麼是問題、可能造成什麼後果）
2. **等待明確同意**，才能動手修改程式碼
3. **絕對不能自行執行 `git commit` / `git push`**，即使是「附帶發現、
   順手修好」的小問題也一樣

這條規則不因為「當下在忙別的主要任務」而失效，也不會因為
使用者說了「請審查更正」這類指令就自動被覆蓋——「審查更正」
指的是「找出問題並提出修正方案」，不是「找到問題就直接上線」。

## 原則二：簡潔優先

**用最少的程式碼解決問題，不做任何投機性的預留。**

- 不加沒被要求的功能。
- 不為只用一次的程式碼建立抽象層。
- 不加沒被要求的「彈性」或「可設定性」。
- 不為不可能發生的情境寫錯誤處理。
- 200 行能寫成 50 行，就重寫。

**檢驗標準：** 資深工程師看了會不會覺得「這也太複雜」？會的話就簡化。

## 原則三：精準修改

**只碰非碰不可的地方。只清理自己造成的髒亂。**

- 不順手「改善」旁邊的程式碼、註解或排版。
- 不重構沒壞掉的東西。
- 配合現有風格，即使你偏好別的寫法。
- 看到無關的死程式碼，**提出來就好，不要刪**。

當你的改動產生孤兒程式碼時：

- 刪掉因**你的改動**而變得沒用的 import／變數／函式。
- 既有的死程式碼，**除非我明確要求，否則不要刪**。

**檢驗標準：** 每一行改動都必須能直接追溯到我提出的需求。

## 原則四：目標驅動執行

**先定義成功標準，再循環驗證到達成為止。**

把指令式任務轉成可驗證的目標：

| 不要這樣說 | 轉換成 |
|---|---|
| 「加上驗證」 | 「為無效輸入寫測試，然後讓它通過」 |
| 「修掉這個 bug」 | 「寫一個能重現 bug 的測試，然後讓它通過」 |
| 「重構 X」 | 「確保重構前後測試都會過」 |

多步驟任務要先講一份簡短計畫：

```
1. [步驟] → 驗證：[檢查方式]
2. [步驟] → 驗證：[檢查方式]
3. [步驟] → 驗證：[檢查方式]
```

強的成功標準能讓你自己跑完；弱的標準（「讓它動就好」）只會不斷回來問我。

> 本專案的實務補充：凡是「點按鈕觸發 Server Action」這類流程
> （報到、繳費標記、取消報名等），只驗證 GET 頁面顯示的文字**不算
> 完整驗證**——必須用 Playwright 真的模擬點擊，或直接對 Server Action
> 發送等價請求，才能確認背後的邏輯真的有被觸發、真的有被正確攔截。
> 這條經驗來自本專案處理報到時間邊界檢查時，發現「只驗證頁面文字」
> 留下的測試死角。

## 如何判斷這套準則有在起作用

出現以下情況，代表準則有生效：

- **diff 裡不必要的改動變少** —— 只有我要求的改動出現。
- **因過度複雜而重寫的次數變少** —— 程式碼第一次就寫得夠簡潔。
- **澄清問題出現在實作之前** —— 而不是在犯錯之後才發現。
- **PR 乾淨精簡** —— 沒有順手夾帶的重構或「改善」。

## 互動約定

當我提出任何專案操作或任務時：

1. **先簡述你的執行步驟**，不要直接產出程式碼或 Git 指令。
2. 有任何不清楚、需要預設假設的地方，**持續向我提問**。
3. 直到我們對齊具體的**成功標準**之後，才開始動手。

## 權衡說明

本準則傾向**謹慎優先於速度**。瑣碎任務（改錯字、明顯的一行修正）請自行判斷，
不是每個改動都需要走完整流程。目的是減少非瑣碎工作上的昂貴錯誤，
不是拖慢簡單任務。

---

# Part B — 版本控制規範

## 核心原則

- 每完成一個可運作的小改動就 commit，小步快跑。
- `main` 分支永遠保持可運作，Vercel 以 `main` 為部署來源。
- 高風險或大型改動先開分支，完成後再合併回 `main`。
- push 前先確認程式碼能正常執行。
- **任何 commit / push 之前，必須先取得使用者明確同意**（見 Part A
  「發現問題必須先回報」一節，這不只適用於規劃外的順手修正，
  也適用於已經確認要做的功能，完成後仍要等使用者驗證過才能進版，
  除非使用者已明確授權「這批完成就直接送出」）。

## 日常工作流程

```powershell
# 每天開工第一件事
git pull

# 改完存檔後提交（PowerShell 不支援 &&，分行執行）
git add -A
git commit -m "說明做了什麼"
git push

# push 被拒時（雲端有新版本）
git pull --rebase
git push
```

## Commit Message 格式

- 動詞開頭，一行講清楚「做了什麼」。
- 中英文皆可，重點是未來看得懂。

```
✅ 正確範例
Add 活動建立表單
修正 QR Code 報到邏輯錯誤
新增 email 報名成功通知
調整報名截止時間欄位驗證

❌ 避免這樣寫
update
改東西
fix bug
```

## 分支（大改動時才需要）

```bash
git checkout -b feature-xxx   # 開新功能分支
git checkout main             # 切回主線
git merge feature-xxx         # 合併回主線（fast-forward 為主）
git branch -d feature-xxx     # 合併後刪除分支（需先確認，屬破壞性操作）
```

常用分支命名範例：`feature-qrcode-checkin`、`feature-payment-reconcile`

## 查看目前狀態

```bash
git status              # 看哪些檔案被修改
git log --oneline       # 看 commit 歷史（精簡版）
git diff                # 看具體改了哪些內容
```

## 不可提交的東西

以下內容絕對不能進 Git，Vercel 環境變數另外設定：

- **機密金鑰**：`.env`、`.env.local`、API 金鑰、資料庫連線字串、密碼
- **相依套件**：`node_modules/`
- **系統暫存**：`.DS_Store`、`*.log`、`.next/`、`build/`

提交前確認 `.gitignore` 已涵蓋上述項目；若誤加，用以下指令移除：

```bash
git rm --cached <檔名>
```

## 🔒 .env 安全強制規定

> **這是本專案最高優先級的安全規則，任何情況下不得違反。**

### 每次 commit 前的強制檢查順序

Claude Code 在執行 `git add` 之前，**必須**完成以下檢查：

```bash
cat .gitignore | grep "\.env"    # 確認 .gitignore 涵蓋 .env
git status                        # 確認 .env 未被 Git 追蹤
```

若 `.gitignore` 未涵蓋，立即補上：

```bash
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
echo ".env*.local" >> .gitignore
```

### .env 檔案規範

本專案的 `.env` 包含以下機密，**全部只存本機與 Vercel Dashboard**，絕不上傳：

- `DATABASE_URL` / `DIRECT_URL`（公司 Neon 資料庫連線字串）
- `RESEND_API_KEY`（Email 服務金鑰）
- `ADMIN_PASSCODE`（內部頁面通行碼）
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`（頻率限制）
- `NEXT_PUBLIC_APP_URL`（QR Code 網址組合用）

### 提供給團隊的替代方案

不要把 `.env` 傳給同仁，改提供 `.env.example`（範本檔，**不含真實值**，
`.gitignore` 需明確用 `!.env.example` 排除，否則會被 `.env*` 規則
一併忽略掉，導致新成員拿不到範本——這是本專案真實發生過的疏漏，
已修正，記錄於此避免回歸）。

### 如果不小心 commit 了 .env

**立刻停止所有 push 動作**，回報後依以下步驟處理：

```bash
git rm --cached .env
echo ".env" >> .gitignore
git add -A
git commit -m "移除誤加的 .env，補上 .gitignore 規則"
```

若已經 push 到 GitHub，**視同金鑰外洩**，即使之後刪除 commit 也無法
確保安全，必須立即更換所有外洩的金鑰並通知主管，此步驟需人工處理。

## 修正與還原

```bash
git restore <檔名>        # 還沒 commit，丟棄某個檔案的修改
git restore .              # 還沒 commit，全部丟掉
git revert <commit hash>   # 已 push，安全撤銷某次提交（不改寫歷史）
```

## GitHub CLI 常用指令

```bash
gh repo create noyi-event --public --source=. --push
gh repo view --web
```

## ⚠️ 破壞性操作：需先取得同意

以下指令執行後**無法復原**，執行前必須先說明原因並等待確認：

- `git reset --hard`
- `git push --force`
- 刪除任何分支
- 直接修改已 push 的 commit 歷史
- 資料庫層級的刪除操作（例如清除測試資料以外的真實資料）

**未經確認不得自行執行。**

---

# Part C — 專案特定規則

## 技術棧

- **前端／後端**：Next.js 16（App Router）
- **資料庫**：PostgreSQL（公司帳號 Neon，AWS AP Singapore，非個人帳號）
- **ORM**：Prisma 7
- **樣式**：Tailwind CSS + shadcn/ui，雙色主題（諾億橘＝公開頁面，
  森林柔和綠＝內部每日操作頁面），全站字體與觸控元件加大（長輩友善）
- **部署**：Vercel（push 到 `main` 自動部署）
- **版本控制**：GitHub
- **Email**：Resend（`RESEND_API_KEY`，延遲初始化，避免模組載入失敗
  拖垮 try-catch 保護——見 `src/lib/resend.ts` 註解）
- **QR Code 掃描**：html5-qrcode
- **快取／頻率限制**：Upstash Redis
- **存取控制**：全站共用通行碼（非個人帳號），`src/proxy.ts`
  （Next.js 16 已將 `middleware.ts` 更名為 `proxy.ts`）保護內部頁面，
  HMAC 簽章 cookie，Upstash 頻率限制防暴力猜測
- **E2E／真點擊測試**：Playwright（`devDependencies`）——用來驗證
  「點按鈕觸發 Server Action」這類流程，範例：
  `scripts/real-click-checkin-test.ts`

## 新電腦設定專案時的額外安裝步驟

除了 `npm install`，**Playwright 還需要另外下載瀏覽器執行檔**：

```bash
npx playwright install chromium
```

只需執行一次（瀏覽器裝在使用者層級的快取目錄，不隨專案資料夾走）。

## PowerShell 注意事項

本機開發環境（Windows）使用 PowerShell，語法與 Bash 不同：

- **不支援 `&&` 串接指令**：PowerShell 5.1 會直接報錯（parser error）。
  多個指令請分行執行，或用 `;` 串接（但 `;` 不保證前一個指令成功）：

  ```powershell
  # ❌ 錯誤
  git add -A && git commit -m "訊息"

  # ✅ 正確：分行執行
  git add -A
  git commit -m "訊息"
  ```

- **常見指令對照表**：

  | 用途 | Bash / cmd.exe | PowerShell |
  |---|---|---|
  | 刪除資料夾（含內容） | `rd /s /q <資料夾>` | `Remove-Item -Recurse -Force <資料夾>` |
  | 刪除檔案 | `del <檔名>` | `Remove-Item <檔名>` |
  | 列出檔案 | `ls` / `dir` | `Get-ChildItem` |
  | 查看檔案內容 | `cat <檔名>` | `Get-Content <檔名>` |
  | 建立資料夾 | `mkdir -p <路徑>` | `New-Item -ItemType Directory -Force <路徑>` |

- Claude Code 內建的 Bash 工具使用 Git Bash（POSIX sh），`&&` 在該工具
  中可正常使用；只有**使用者自己在 PowerShell 終端機**手動下指令時，
  才需要改用上述對照寫法。

## 已知的併發與時序陷阱（務必記住，避免回歸）

- **任何涉及名額 / 狀態判斷的寫入，一律在交易內用 `SELECT ... FOR
  UPDATE` 鎖住 `Event` 行、鎖後重讀最新值再判斷**——不能用鎖之前
  讀到的舊資料做判斷，否則等於鎖了但沒真的鎖住（見 `src/lib/
  registration.ts`、`src/lib/events.ts` 的既有寫法）。
- **驗證併發邏輯不能只跑一次就信**：跑分公平競速多輪，並設計定向
  情境刻意讓「較少發生的那一方」贏，確認兩種時序結果都正確
  （範例：`scripts/concurrency-test.ts`）。
- **Migration 套用後務必重啟 dev server**，否則會沿用記憶體中的舊
  Prisma client，出現「資料庫明明是對的，畫面卻不動」的假象。

## 修改依賴外部服務可用性的功能時

- **模組載入時不做外部依賴檢查**（例如檢查 API 金鑰是否存在），
  一律延遲到實際呼叫時才檢查——模組頂層 `throw` 會讓所有依賴它的
  `try-catch` 保護失效（真實事故：`RESEND_API_KEY` 缺失曾導致
  正式站報名功能整個 500，因為檢查發生在 try-catch 生效範圍之前）。
- **外部服務暫時故障時該 fail-open 還是 fail-closed，要明確決定並
  寫註解說明理由**，不要讓例外自然拋出決定行為。本專案的既有取捨：
  通行碼登入在 Upstash 故障時 fail-open（可用性優先，主防線是通行碼
  比對本身不受影響）；報名頻率限制同樣 fail-open（報名是核心業務）；
  正式環境完全缺少 Upstash 環境變數則 fail-closed（防禦性設計錯誤
  的部署本身）。

## 目前已知、刻意擱置的待辦

- **C2（取消活動自動通知已報名者）**：邏輯簡單、可低成本沿用
  C1 的寄信基礎，但價值建立在「信寄得出去」上，等 C3 完成後再做。
- **C3（Resend 網域驗證）**：需公司 IT／主管走 DNS 驗證流程，
  非技術問題，完成前正式站對外部信箱的 Email 一律寄不出去。
- **候補/報名重複提醒**：schema 已留 TODO，需要先解決分行欄位
  新舊格式不一致的技術債才能準確判斷，未排入時程。
- **活動刪除功能**：尚未實作，涉及已有報名/報到/繳費資料的處理
  方式（封存？禁止刪除？層層確認？），需要先出設計方案再動工，
  不是單純的一行程式碼。

---

*最後更新：2026-07-08*
