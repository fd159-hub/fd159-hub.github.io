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
| 7. 遠端 staging | **尚未完成** | Wrangler whoami 明確回報未登入；沒有 Cloudflare 資源、Secret 或遠端部署成功證據 |
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

1. 登入正確 Cloudflare 帳戶，建立 staging D1、設定三組新 Secrets、部署 staging Worker。
2. 將開發分支放到獨立預覽站並設定 CORS，重跑遠端 API 與兩台實體裝置同步驗收。
3. 從使用者原本瀏覽器匯出真實 JSON，在 staging 演練、比對及復原；保留原本檔案與 localStorage。
4. 檢視本 PR 的 GitHub CI 結果。此文件的本機通過結果不表示 GitHub CI 或遠端驗收已通過。
5. 上述門檻完成前，保持 PR open 並且不要合併 main。
