# 單字星球雲端後端驗收紀錄

## 2026-10-21：正式／測試兩站並行

- 依使用者指示建立獨立 production Worker、D1 與 Pages，保留既有 staging；配置及操作方式見 DEPLOYMENTS.md。
- 預設 deploy／migrate 只操作 staging；正式須明確使用 production 指令。前端部署固定只上傳 index.html 與 cloud-client.js。
- 正式站與測試站的固定網址自動連到各自 API，畫面與 health 標示環境。CORS 與 session audience 隔離，兩站不共用資料庫或登入狀態。
- 回歸測試：13 項 API、8 組 workerd/D1、13 組 Chromium、語法及打包通過；新增兩環境資料異動／重置不互相影響、不同來源與跨站 token 拒絕、兩個固定網址不需 cloud 參數且不落入本機模式。
- 08:44:28（Asia/Taipei）完整雲端 SQL 備份為 19487 bytes，包含 10 課、82 字、8 筆作答、9 筆進度、7 筆手動開關。來源 D1 未寫入。
- 以該 SQL 在本機 SQLite 還原、檢查外鍵後，只還原到全新空白 production D1；完整 schema、資料列及 sequence 比對一致，遠端外鍵檢查通過。此項是真實雲端資料的備份／隔離復原演練，不是舊版 JSON 匯入。
- 原瀏覽器舊 JSON 未覆蓋現有雲端；舊 JSON 的獨立匯入仍未執行。實體裝置觸控、語音與兩台真人裝置同步仍待驗收。
- 本節完成的是配置及完整資料承接；實際雙站部署、登入與最終發布結果以本次 PR／Release 部署附錄為準。

以下為歷史記錄，其中「正式站尚待指定」及舊測試組數均屬當時狀態，以上述最新雙站紀錄為準。

## 最新：v1.0.0 版本基準（2026-10-19）

- package.json 與 lockfile 設定 version=1.0.0；雲端登入頁、管理頁及頁尾顯示版本，health 回傳 version。新增 CHANGELOG.md，列出 v1.0.0 功能基準與後續版本規則。
- 語法、12 項 API、8 組 workerd/D1、11 組 Chromium 及打包通過。
- 本階段只準備版本資訊，正式站採用方式尚待使用者指定；沒有據此合併 main、切換 Pages 或將未完成驗收標為通過。
- 真實備份已取得但尚未匯入；目前 staging 已有學習進度，後續必須保留。隔離復原演練與實體裝置驗收仍待完成。

## 最新：含空格片語與空格鍵（2026-10-19）

- 本機／雲端管理者可儲存 pencil case 等片語；統一清理首尾與重複空白，維持 100 字元上限、大小寫、連字號與撇號規則。備份驗證與匯入／匯出支援片語，不需要 migration 或重寫既有資料。
- 聽音保留完整片語；排列／圖片題提供可見空格字塊；消失字母只挖空英文字母、空格與標點固定；終極默寫增加空格／撇號／連字號鍵，保留三排字母、大小寫與倒退；複習使用裝置鍵盤。
- pencil case 新增預設 👝 圖示；其他沒有圖片的片語仍沿用跳過圖片模式。支援本機備份的明確 image 設定。
- 12 項 API、8 組 workerd/D1、11 組 Chromium 整合測試通過，無 pageerror。測試包含實際管理表單儲存／修改片語、六種模式作答、空格字塊與鍵盤按鍵、固定空格不被挖空、pencilcase 判錯、重複空白規整及備份往返。
- 上述作答均使用隔離的本機測試資料庫；未在遠端產生學生作答。實體裝置發音／觸控與真實備份匯入仍待驗收。

下方保留歷史記錄，最新功能及測試組數以上述結果為準。

## 最新：Miss／miss 合併聽音題與美式發音（2026-10-19）

- 第二課聽音辨字將同組的 Miss／miss 合併為單一選項與單一題目（8 組題），其餘拼字階段仍嚴格區分大小寫，不刪除或修改單字庫。
- 本機／雲端均同步更新同組聽音熟練度；雲端一題只新增一筆 attempts，重送仍去重。解鎖以分組計算，既有任一大小寫版本達熟練可沿用；同課不同組的拼字不會混算。
- 英文單字與字母名稱都指定 en-US 並優先選擇美式語音；移除選不到美式時主動改選其他英語語音的行為。保留中文回饋 zh-TW。語音清單每次發音時重新查詢，裝置稍後載入的美式語音可被選用。
- 11 項 API、8 組 workerd/D1、9 組 Chromium 整合測試通過，無 pageerror；另通過 inline JavaScript 語法檢查。
- 新增驗證：合併題顯示與第二課題數、本機兩筆聽音進度同步、workerd 實際處理合併答案／一筆作答、同組大小寫答案接受、其他拼字階段大小寫仍嚴格、不同組隔離及解鎖。
- 語音測試使用明確標記 en-GB／en-US 的模擬語音清單，確認單字與字母選擇美式；沒有美式時不主動選英式。這是參數與選擇規則驗證，未實際聆聽手機／iPad 音訊，不能標為實機發音驗收通過。

下方各節保留前次功能與部署的歷史記錄，測試組數以上述最新結果為準。

## 新增各階段解鎖開關（2026-10-19）

- 新增管理者「本課各階段解鎖」區塊，依選擇的課次顯示六個獨立開關；標示開放／關閉、手動／依學習進度，並可恢復該課自動解鎖。
- 本機與雲端皆支援；手動設定不改寫答題熟練度。伺服器獨立檢查開關權限，學生不能呼叫管理 API；重置熟練度保留教師開關。
- `0003_stage_access.sql` 只新增資料表；舊學習紀錄與自動解鎖仍保留。備份匯入／匯出會包含可選 `stageAccess`，兼容舊版 JSON。
- 本次 Windows Node.js 24 實測：10 項 API 測試、8 組 workerd／D1、7 組 Chromium 整合測試通過，無 pageerror。另通過 inline JavaScript 語法檢查、打包、本機 migration 首次及重跑。
- 新增案例涵蓋：跳階開放、手動鎖定優先、不同課次隔離、全部關閉提示、恢復自動、學生權限拒絕、備份往返、重置保留設定、兩個隔離瀏覽器 context 取得設定，以及雲端模式 localStorage 不變。
- staging migration 0003 已套用；Worker Version ID：`1a6faf86-21bc-4cd9-9194-97cf32c76a42`。本次遠端部署後檢查另見 PR 更新。
- 真實備份已取得並檢查：version 3、2154 bytes、3 課、25 個單字；來源沒有作答、錯題或解鎖紀錄。SHA-256：`cf822b216643add654a1f2addba07e9da389bc5197a90a326c430ba9c099cfb8`。原始檔與副本未提交 GitHub。
- 真實匯入仍待使用者本機輸入既有 staging 登入資料；本次功能開發未以自動測試資料取代真實匯入。實體裝置驗收仍未執行，不能將 Chromium 測試冒充實機。

以下保留前次部署的歷史驗收紀錄（含 schema 2 與當時測試組數）；目前版本以上方新增紀錄為準。

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
