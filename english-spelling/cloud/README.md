# IAN 單字星球：Cloudflare Worker + D1

這是獨立雲端後端的**部署準備版**。正式網站仍使用原本的本機紀錄，直到 Worker、D1 和前端切換完整測試通過。

## 一次性部署
1. 進入 `english-spelling/cloud`，執行 `npm install`（需 Node.js）。
2. 登入 `npx wrangler login`。
3. 建立資料庫：`npx wrangler d1 create ian-spelling-db`。
4. 把回傳的 `database_id` 寫入 `wrangler.jsonc`，替換 `REPLACE_WITH_D1_DATABASE_UUID`。
5. 建立三組 Worker Secret：`npx wrangler secret put ADMIN_PASSWORD`、`npx wrangler secret put IAN_PIN`、`npx wrangler secret put SESSION_SECRET`。管理密碼請設定**新的強密碼**，不可沿用已公開的舊密碼；IAN_PIN 亦不可使用預設值；SESSION_SECRET 使用至少 32 位隨機字串。
6. `npx wrangler d1 migrations apply ian-spelling-db --remote`
7. `npx wrangler deploy`。部署成功後取得 `https://ian-spelling-api.<your-subdomain>.workers.dev`。
8. `GET /api/health` 驗證，再分別測試管理登入、IAN PIN 登入、讀取單字、答題、重置。
9. 前端切換至 API 之前，先在舊網站管理者頁「匯出」既有進度備份。不要直接清除 localStorage。既有學習紀錄遷移仍待實作對照與驗收。
10. 未部署後端前，**不要刪除舊版管理功能**。正式切換時需停用瀏覽器本地管理密碼驗證與編輯權限。

## 說明
- API 登入：`POST /api/login` body `{"role":"student","password":"..."}` 或 role=admin。回傳 Bearer token，有效 12 小時。
- 已登入者：`GET /api/state` 返回 lessons、words、progress、unlocks。
- IAN 作答：`POST /api/attempt` body `{"wordId":1,"mode":"listen","answer":"one"}`。
- 管理者：`POST /api/admin/words`、`DELETE /api/admin/words`、`POST /api/admin/lessons`、`POST /api/admin/reset`。
- 學生需 PIN 是為避免任何知道網址的人修改 IAN 雲端紀錄；也可以在個人裝置以短期 session 保存登入。
- Cloudflare Secrets 不得提交 GitHub；請勿把 API Token 寫入此儲存庫。
- 現階段屬最小可用後端：尚需做登入節流、前端雲端接入、舊資料匯入及端到端驗收，**不要當作已可正式上線的安全服務**。
