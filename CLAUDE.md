# 版本控制規範 (Version Control)

本檔規範 Claude Code 在此專案 `noyi-event` 的 Git 操作方式。

---

## 專案技術棧

- **前端／後端**：Next.js (App Router)
- **資料庫**：PostgreSQL（公司帳號 Neon，非個人帳號）
- **ORM**：Prisma
- **樣式**：Tailwind CSS + shadcn/ui
- **部署**：Vercel
- **版本控制**：GitHub
- **快取／佇列**：Upstash（備用）

---

## 核心原則

- 每完成一個可運作的小改動就 commit，小步快跑。
- `main` 分支永遠保持可運作，Vercel 以 `main` 為部署來源。
- 高風險或大型改動先開分支，完成後再合併回 main。
- push 前先確認程式碼能正常執行。

---

## 日常工作流程

```bash
# 每天開工第一件事
git pull

# 改完存檔後提交
git add -A && git commit -m "說明做了什麼"
git push

# push 被拒時（雲端有新版本）
git pull --rebase
git push
```

---

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

---

## 分支（大改動時才需要）

```bash
git checkout -b feature-xxx   # 開新功能分支
git checkout main             # 切回主線
git merge feature-xxx         # 合併回主線
git branch -d feature-xxx     # 合併後刪除分支（可選）
```

常用分支命名範例：
- `feature-qrcode-checkin`
- `feature-email-notify`
- `feature-payment-reconcile`

---

## 查看目前狀態

```bash
git status              # 看哪些檔案被修改
git log --oneline       # 看 commit 歷史（精簡版）
git diff                # 看具體改了哪些內容
```

---

## 不可提交的東西

以下內容絕對不能進 Git，Vercel 環境變數另外設定：

- **機密金鑰**：`.env`、`.env.local`、API 金鑰、資料庫連線字串、密碼
- **相依套件**：`node_modules/`
- **系統暫存**：`.DS_Store`、`*.log`、`.next/`、`build/`

提交前確認 `.gitignore` 已涵蓋上述項目；若誤加，用以下指令移除：

```bash
git rm --cached <檔名>
```

---

## 🔒 .env 安全強制規定

> **這是本專案最高優先級的安全規則，任何情況下不得違反。**

### 專案初始化時的強制檢查順序

Claude Code 在執行第一個 `git add` 之前，**必須**完成以下三步驟：

```bash
# 步驟一：確認 .gitignore 存在且包含 .env
cat .gitignore | grep "\.env"

# 步驟二：若未包含，立即補上（Next.js 預設通常已有，仍需確認）
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
echo ".env*.local" >> .gitignore

# 步驟三：確認 .env 目前未被 Git 追蹤
git status
```

三步驟確認完畢後，才可執行 `git add -A`。

### .env 檔案規範

本專案的 `.env` 包含以下機密，**全部只存本機與 Vercel Dashboard**，絕不上傳：

- `DATABASE_URL`（公司 Neon 資料庫連線字串）
- `DIRECT_URL`（Prisma migration 用）
- Email 服務 API 金鑰
- QR Code 簽章密鑰（未來使用）

### 提供給團隊的替代方案

不要把 `.env` 傳給同仁，改提供 `.env.example`（範本檔，**不含真實值**）：

```bash
# .env.example 範例內容（可以 commit，真實值用 YOUR_ 開頭佔位）
DATABASE_URL="YOUR_NEON_DATABASE_URL"
DIRECT_URL="YOUR_NEON_DIRECT_URL"
EMAIL_API_KEY="YOUR_EMAIL_API_KEY"
NEXTAUTH_SECRET="YOUR_SECRET"
```

### 如果不小心 commit 了 .env

**立刻停止所有 push 動作**，告知 Claude Code 處理，步驟如下：

```bash
# 1. 從 Git 追蹤中移除（不刪除本機檔案）
git rm --cached .env

# 2. 確認 .gitignore 已加入
echo ".env" >> .gitignore

# 3. 提交這個修正
git add -A && git commit -m "移除誤加的 .env，補上 .gitignore 規則"

# 4. 若已經 push 到 GitHub，需立即更換所有外洩的金鑰
#    並通知主管，此步驟需人工處理
```

> **已 push 到 GitHub 的金鑰視同外洩，即使之後刪除 commit 也無法確保安全，必須立即更換。**

---

## 修正與還原

```bash
# 還沒 commit，想丟棄某個檔案的修改
git restore <檔名>

# 還沒 commit，全部丟掉
git restore .

# 已經 push，想安全撤銷某次提交（不改寫歷史）
git revert <commit hash>
```

---

## GitHub CLI 常用指令

```bash
# 建立並推送雲端倉庫（第一次用）
gh repo create noyi-event --public --source=. --push

# 查看遠端倉庫連結
gh repo view --web
```

---

## ⚠️ 破壞性操作：需先取得同意

以下指令執行後**無法復原**，Claude Code 執行前必須先說明原因並等待確認：

- `git reset --hard`
- `git push --force`
- 刪除任何分支
- 直接修改已 push 的 commit 歷史

**未經確認不得自行執行。**

---

## Vercel 部署說明

- 每次 push 到 `main` 分支，Vercel 會**自動觸發部署**。
- 環境變數（資料庫連線、API 金鑰等）統一在 Vercel Dashboard 的 **Environment Variables** 設定，不寫進程式碼。
- 部署失敗時先看 Vercel 的 Build Log，再回來修正。

---

*最後更新：2026-06-16*
