# IAN 單字星球：Cloudflare Worker + D1

此分支已包含可選雲端前端、後端、舊版備份匯入與自動測試。**staging 部署、登入、權限與 CORS 已驗證；真實備份匯入及後續資料驗收尚未完成，不要合併 main。** 實際執行狀態見 `TEST_REPORT.md`。

## 本機驗證

使用 Node.js 24，進入 `english-spelling/cloud`：

```sh
npm ci
npm run check
npm test
npm run test:runtime
npx playwright install --with-deps chromium
npm run test:browser
npm run build
npm run migrate:local
npm run migrate:local
```

- `test`：Node 原生 SQLite SQL 契約／API 測試，不冒充 D1 模擬器。
- `test:runtime`：真正的 workerd + Miniflare + D1 整合測試，使用隔離的暫存資料庫。
- `test:browser`：實際 Chromium，保留本機鍵盤、測試兩個獨立瀏覽器環境、作答回應遺失後重送、管理操作、備份匯入及 localStorage 不變。測試 API 由 Miniflare 執行；沒有連正式 Cloudflare。
- `build`：Wrangler dry-run，不上傳程式。
- `migrate:local` 重跑應顯示無待套用 migration；不要手動重跑含 ALTER TABLE 的 0002 SQL。
- GitHub Actions workflow 只測試，不需要 Secrets，不部署、不合併。

手動預覽時，複製 `.dev.vars.example` 為 `.dev.vars` 並填入本機測試值，再執行：

```sh
npm run migrate:local
npx wrangler dev --port 8787 --var FRONTEND_ORIGIN:http://localhost:4173
# 另一個終端機，於儲存庫根目錄：
python3 -m http.server 4173
```

本機版：`http://localhost:4173/english-spelling/`

雲端模式預覽：`http://localhost:4173/english-spelling/?cloud=http://localhost:8787`

未帶 `cloud` 參數仍為原本本機版。雲端版要求 IAN PIN／管理密碼，session token 只保存在目前分頁的記憶體，重整後需重新登入；不寫入 localStorage 或 sessionStorage。回到本機版會使用原先的本機資料。

## 遠端 staging 部署

2026-10-19 已完成登入與資源盤點，建立獨立 D1 `ian-spelling-db-staging`（`9a721721-31ca-49e8-bbbc-a935abe7d1cc`）及獨立 Pages 專案 `ian-spelling-staging`。再次接續時先查詢並使用既有資源，不要重複建立。前端上傳來源必須是隔離的目錄，僅含 `index.html` 與 `cloud-client.js`，不可直接上傳儲存庫或 `cloud` 目錄。正式 GitHub Pages 仍使用 `main /`。

- [staging 前端（已連接雲端模式）](https://ian-spelling-staging.pages.dev/?cloud=https://ian-spelling-api-staging.fd159.workers.dev)
- [staging health](https://ian-spelling-api-staging.fd159.workers.dev/api/health)
- 僅允許的前端 origin：`https://ian-spelling-staging.pages.dev`。帶部署雜湊的 Pages 網址不在 CORS 白名單，請使用上述固定網址。
- 已設定三組 staging Secrets；migration 0001、0002 已套用且重跑無待套用項目。真實 JSON 匯入前不做學生作答測試。

1. `npx wrangler login`，確認登入的是預定使用的 Cloudflare 帳戶。
2. `npx wrangler d1 create ian-spelling-db-staging`。
3. 將回傳 UUID 寫入 `wrangler.jsonc` 的 `env.staging.d1_databases[0].database_id`。**不要把 staging UUID 填到正式 DB，也不要共用資料庫。**
4. 設定 staging 的三組 Worker Secrets：

```sh
npx wrangler secret put ADMIN_PASSWORD --env staging
npx wrangler secret put IAN_PIN --env staging
npx wrangler secret put SESSION_SECRET --env staging
```

使用全新管理密碼與私人 PIN；SESSION_SECRET 使用至少 32 字元的隨機字串。不要沿用曾公開的舊管理密碼，也不要將 Secret／Cloudflare API Token 提交到 GitHub。

```sh
npm run migrate:staging
npm run deploy:staging
```

取回真實 workers.dev 網址後，先測試 health，再測試登入及 state（health 會查詢 schema，但不能證明兩種登入 Secret 正確）。前端 `FRONTEND_ORIGIN` 必須是實際預覽頁的 origin，不能包含路徑。若用 GitHub Pages 主網域，為 `https://fd159-hub.github.io`。可把開發分支檔案發布到獨立預覽站；不要為了預覽而合併 main，也不要更改現有正式 Pages 的來源。

前端透過 `?cloud=https://實際Worker網址` 或登入頁的「連接雲端」切換。預覽站必須完整包含 `english-spelling/index.html` 與 `cloud-client.js`；只開目前 main 的正式網站不會出現尚未合併的功能。

`npm run deploy`／`npm run migrate` 操作正式環境；本分支的 preflight 會拒絕佔位 UUID。**完成 staging 驗收並另行確認正式切換後才使用。**

## API

### 各課各階段解鎖開關

管理者登入後，在「選擇課次」選好課，再使用下方「本課各階段解鎖」的六個開關。每個階段獨立設定，不必依序開放；包含聽音辨字、字母排列、消失的字母、看圖拼字、終極默寫與錯題複習。

- 開關變更立即儲存。雲端學生重新載入並登入後取得最新設定，伺服器也會拒絕已關閉階段的作答。
- 沒有手動設定的階段，沿用原本學習進度自動解鎖。手動關閉優先於自動進度；「恢復本課自動解鎖」只移除該課的手動設定，不清除作答。
- 六個階段全部關閉時，學生會看到請洽管理者開放的提示，仍可切換其他課次。
- 重置本課熟練度保留手動開關。若要回到原始解鎖規則，再按「恢復本課自動解鎖」。
- 本機版新增 `ian-stage-access-v3` 儲存鍵；雲端版使用增量 migration `0003_stage_access.sql`，保留既有進度。version 3 備份新增可選的 `stageAccess` 欄位，舊備份仍可匯入。
- `POST /api/admin/stage-access`：`{"lessonId":1,"mode":"dictation","allowed":true}`；管理者限定，allowed 必須為布林值。
- `DELETE /api/admin/stage-access`：`{"lessonId":1}`，恢復本課自動解鎖。
- health 現在檢查開關資料表並回傳 `schema:3`。

- `GET /api/health`：檢查 DB 與 schema。
- `POST /api/login`：`{"role":"student","password":"..."}`，或 role=`admin`；token 有效 12 小時。同來源 IP 在 15 分鐘內至多 10 次連續失敗嘗試，成功登入會清除該 IP 計數。
- `GET /api/state`：已登入者取得 IAN 的 lessons、words、progress、unlocks。
- `POST /api/attempt`：學生限定，`{"wordId":1,"mode":"listen","answer":"one","requestId":"隨機UUID"}`。重試同一筆請沿用 requestId；相同 id 不會重複計數，不同作答不能共用 id。
- 管理者：`POST /api/admin/words`、`DELETE /api/admin/words`、`POST /api/admin/lessons`、`POST /api/admin/reset`。
- `GET /api/admin/export`：匯出可還原的 version 3 JSON。
- `POST /api/admin/import`：`{"confirm":"IMPORT_BACKUP","backup":備份物件}`；單次交易、僅允許尚無雲端學習進度且未匯入過的 DB。

`0002_sync.sql` 是增量 migration：補上 three／cap 圖片、錯題欄位、登入限制、作答去重與一次性匯入紀錄。既有進度不會清除。刪除單字會同時清除其進度與逐筆作答；指定課次重置不影響其他課或單字庫。

## 舊資料遷移與復原

1. 在**原本使用的瀏覽器、本機版**管理頁匯出 `ian-spelling-backup.json`，另存原始檔；跨裝置不會自動找回其他瀏覽器的 localStorage。
2. 雲端管理者登入 staging，點「匯入舊版備份」，確認課數與單字數後執行。**會替換雲端單字庫，但拒絕覆蓋已有學習進度的 DB；原本 localStorage 不會刪除。**匯入期間先停止其他使用者操作。
3. 檢查自訂課次、Miss／miss 同組、解鎖、錯題與連續答對數，再匯出雲端備份比對。單次最多 1 MB、80 個批次 SQL statements；過大會整筆拒絕，不會部分匯入。
4. 舊課次 0-based 會對應 D1 課次 1-based；單字依課次與大小寫精確拼字對照。同課同拼字多義、遺失單字、無法對照的 key 會拒絕匯入並要求人工整理。
5. 舊 `good` 只有目前 streak，**無法還原歷史總答對數**。匯入時 correct 暫以已知 streak 作為下限，wrong 由 bad 還原。舊 attempts 的各模式總次數與時間不足以重建逐筆作答，因此保留在原始 JSON，沒有偽造歷史 attempts。
6. 本機復原：回到不帶 cloud 的網址，原紀錄仍在；若需要，使用原本本機匯入功能還原原始 JSON。正式切換前保留此路徑。

## 遠端驗收門檻

- [x] staging Worker／D1 真實建立，三組 Secrets 設定。
- [x] 遠端 health、兩種登入／重登入、角色權限與 CORS 驗證；前端僅兩檔部署且內容一致。
- [ ] 遠端兩種登入、CORS、真實資料讀寫與重登入通過。
- [ ] 獨立前端預覽站接入；手機／iPad／另一台實體裝置同步驗收。
- [ ] 真實舊備份先在 staging 演練並人工比對（本機合成測資通過不代表真實資料已遷移）。
- [ ] 遠端指定課次重置、備份與復原演練通過。
- [ ] 檢視 GitHub CI 結果與 PR diff，再決定正式切換。未完成前維持 PR open、不合併 main。
