# 單字星球雲端後端驗收紀錄

日期：2026-10-19（Asia/Taipei）。修改僅提交 `feat/english-spelling-cloud`，不合併 `main`。前端以 main 的 `ad472ed` 為基礎，保留自製 A–Z 鍵盤、大小寫、倒退、三排按鍵及字母名稱發音實作。

| 原定階段 | 結果 | 證據／範圍 |
|---|---|---|
| 1. 語法／打包 | 通過 | npm ci、npm run check、Wrangler deploy --dry-run |
| 2. 本機 D1 migration | 通過 | 0001、0002 在 Wrangler 本機 D1 成功套用；再次套用無待執行 migration |
| 3. 登入與設定 | 通過（本機） | 測試登入成功／失敗、缺設定、短 SESSION_SECRET、過期與畸形 token、登入限制 |
| 4. 權限與 CORS | 通過（本機） | 未登入 401、錯誤角色 403、非允許 origin 403、preflight |
| 5. 作答與解鎖 | 通過（本機） | 連續答對、答錯歸零、大小寫、第三課圖片、零圖片跳關、網路回應遺失重送去重 |
| 6. 管理與重置 | 通過（本機） | 增改刪、無效 id、刪字清理、指定課次重置隔離 |
| 7. 遠端 staging | **部署與無作答 API 檢查通過；資料驗收待完成** | 獨立 Worker／D1、三組 Secrets、migration 與前端已部署；12 項登入／角色／CORS 檢查通過，學生作答與進度仍為零 |
| 8. 前端／遷移驗收 | 程式與本機演練通過；**遠端與真實資料待驗收** | 兩個獨立 Chromium context、管理匯入／匯出、原 localStorage 不變；未取得使用者真實備份，未在實體 iPad 或跨網路裝置測試 |

## 測試組數

- `npm test`：9 項 SQLite SQL 契約／API 測試。
- `npm run test:runtime`：8 組 workerd／Miniflare／D1 整合測試。
- `npm run test:browser`：5 組 Chromium 瀏覽器整合測試，無 pageerror。
- 所有測試資料庫均屬本機或隔離的暫存資料庫。沒有連線或修改正式雲端學習資料。
- 語音測試替換 SpeechSynthesis，驗證字母按鍵送出字母名稱參數；**沒有驗證實體裝置的語音輸出或音質**。
- 容器的無頭 Chromium 缺中文字型；本次 UI 驗證範圍為操作與 DOM 行為，未將此環境的截圖當成中文字型／裝置視覺驗收。

## 已修正／新增

- 增量 schema、third lesson 圖片、空圖片關跳過、missed 錯題狀態。
- HMAC token 輸入檢查、登入限制、JSON 錯誤回應、health 查詢 schema。
- UUID requestId 防止網路重送重複作答；刪字清理 attempts，指定課次重置不影響其他課。
- 可選雲端前端；預設本機模式不切換、不移除原儲存資料；session 不寫瀏覽器持久儲存。
- 一次性、單交易舊版備份匯入，拒絕覆蓋已有雲端進度；精確區分 Miss／miss。
- staging 獨立設定、UUID 部署前檢查、鎖定依賴版本、GitHub Actions 測試流程。

## 尚待完成

1. 取得使用者從原瀏覽器匯出的真實備份 JSON，先匯入 staging、比對，再開放學生作答測試。
2. 使用獨立測試課驗證作答、解鎖、管理及指定課次重置；完成遠端備份與隔離復原演練、兩台實體裝置同步驗收。
3. 從使用者原本瀏覽器匯出真實 JSON，在 staging 演練、比對及復原；保留原本檔案與 localStorage。
4. `188d2638` 與 `ceb659b` 的 GitHub CI 已確認成功；後續提交須另行確認。此文件的本機通過結果不表示所有遠端驗收已通過。
5. 上述門檻完成前，保持 PR open 並且不要合併 main。

## Windows 接續部署紀錄（2026-10-19）

- 接續基準：`188d2638a04958c8a0ec2116cce81f43ce7d1388`，分支 `feat/english-spelling-cloud`，PR #1 狀態 OPEN。
- npm ci 成功；以隔離的 Node.js 24.22.0 重跑 check、9 項 API 測試、8 組 workerd/Miniflare/D1 測試及 dry-run 打包，均通過。本次沒有重跑本機 Chromium 測試。
- `188d2638` 的 GitHub Actions [Spelling cloud tests](https://github.com/fd159-hub/fd159-hub.github.io/actions/runs/39207693460) 結果 SUCCESS。
- 登入後盤點：D1 與 Pages 專案列表原先均為空；`ian-spelling-api-staging` 原先不存在。
- 已建立獨立 D1：`ian-spelling-db-staging`，UUID `9a721721-31ca-49e8-bbbc-a935abe7d1cc`，APAC。migration 前只讀檢查僅有平台 `_cf_KV` 表，沒有既有學習資料。
- 已建立及部署獨立 Pages 專案 `ian-spelling-staging`；origin `https://ian-spelling-staging.pages.dev`。
- `wrangler.jsonc` 僅修改 `env.staging` 的 UUID 與 FRONTEND_ORIGIN；正式設定保留。
- 前端上傳目錄已隔離，僅含 `index.html`（38227 bytes）與 `cloud-client.js`（10275 bytes）；Wrangler 回報 Uploaded 2 files。線上兩檔均 HTTP 200，與來源逐位元相同。
- 正式 GitHub Pages 來源只讀確認為 `main /`，build_type `legacy`；未更改來源。
- Secrets 已由使用者在本機遮蔽輸入，以 stdin 傳給記憶體中的 Cloudflare API 請求；未啟動 Wrangler Secrets 記錄器。只保存成功旗標，沒有保存數值、登入 token 或 HTTP 請求本文。輸入工具與非敏感狀態檔均位於儲存庫外。
- 真實備份尚未取得。尚未送出學生作答，尚未進行真實匯入、課次重置、遠端備份復原或實體裝置驗收；以上均不得標為通過。

### 實際網址與版本

- [staging 前端](https://ian-spelling-staging.pages.dev/?cloud=https://ian-spelling-api-staging.fd159.workers.dev)
- [staging Worker health](https://ian-spelling-api-staging.fd159.workers.dev/api/health)
- Worker Version ID：`793890a2-c6ef-431f-bd4e-7cc0294dd1bb`；前端 Deployment ID 前綴：`692e084a`。
- Worker 程式與兩個前端檔案對應 `188d2638`；部署設定於 `ceb659b` 提交。
- 僅固定前端 origin 允許跨來源 API 呼叫；帶部署雜湊的預覽別名不在 CORS 白名單。

### 實際遠端驗證（2026-10-19 15:59–16:00，Asia/Taipei）

| 檢查 | 實際結果 |
|---|---|
| health | 200；ok=true、db=true、schema=2 |
| 未登入讀取 state | 401 |
| 不允許的 Origin | 403，沒有 Access-Control-Allow-Origin |
| 允許來源 OPTIONS | 204，Access-Control-Allow-Origin 精確等於固定前端 origin |
| 管理者錯誤密碼 | 401 |
| 管理者、學生登入 | 兩者均 200；token 僅留記憶體 |
| 學生讀取 state | 200，CORS 正確，progress／unlocks 為空 |
| 學生呼叫管理匯出 | 403 |
| 管理者呼叫 attempt | 403，角色檢查先拒絕，沒有新增作答 |
| 管理者匯出 | 200，version=3；本次僅檢查格式，尚未進行可還原性演練 |
| 兩種角色再次登入 | 均 200 |
| migration 重跑 | No migrations to apply |
| 匯入前 D1 只讀盤點 | lessons=3、words=25；progress=0、attempts=0、unlocks=0、imports=0、requests=0 |

前端 SHA-256：

- index.html：`fb8b84eaf884834ce20e060c0dd835b7894a705be87a0343669270dcaab839ab`
- cloud-client.js：`3f3da09cb0e757a1af35ed465886d176f58cbc5ca2b6e3e760ceb6869cfff3eb`

以上為遠端 HTTP/API 與檔案內容驗證。尚未以真人在預覽站完成登入操作，尚未做實體裝置／語音驗收，也沒有將 API 匯出成功視為備份復原通過。
