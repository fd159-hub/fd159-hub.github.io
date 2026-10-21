# 正式／測試兩站並行

| 項目 | 正式站 | 測試站 |
|---|---|---|
| 網址 | https://ian-spelling.pages.dev/ | https://ian-spelling-staging.pages.dev/ |
| Worker | ian-spelling-api | ian-spelling-api-staging |
| API | https://ian-spelling-api.fd159.workers.dev | https://ian-spelling-api-staging.fd159.workers.dev |
| D1 | ian-spelling-db | ian-spelling-db-staging |
| D1 UUID | eef94075-5917-4a5c-89de-92c268041698 | 9a721721-31ca-49e8-bbbc-a935abe7d1cc |
| Wrangler env | production | staging |
| Pages 分支 | release | staging |
| 用途 | 日常教學與正式進度 | 功能修改、測試與驗證 |

兩站有各自三組 Secrets，敏感值只在使用者本機遮蔽輸入，不在本文件、Git、聊天或日誌中保存。session token 綁定前端 origin，即使誤用相同簽署密鑰也不能跨站使用。

## 一般修改：先測試站

於 `english-spelling/cloud` 使用 Node.js 24：

```sh
npm ci
npm run check
npm test
npm run test:runtime
npm run test:browser
npm run build
# 有新增 migration 時才執行：
npm run migrate:staging
# 同時部署 staging Worker 及僅含兩檔的前端：
npm run deploy
```

`npm run deploy`、`npm run migrate` 預設均為 staging。測試站的增改刪、作答與重置只影響測試 D1，不會傳到正式站。

## 正式發布

1. 在測試站完成修改與驗證，記錄實際結果及待驗收項目。
2. 選定通過驗證的提交，備份正式 D1；有資料結構變更時先在隔離副本驗證 migration 與復原。
3. 更新版本與 CHANGELOG，執行正式指令：

```sh
# 只有該正式版本有新增 migration 時才執行：
npm run migrate:production
npm run deploy:production
```

4. 核對正式 health 的 version／environment、前端兩檔、CORS、角色權限與資料保留。建立對應 Release/tag，以該版本作為回復依據。
5. 後續測試站部署不會自動更新正式站；未完成驗收不得補標通過。

前端部署程式在 OS 暫存目錄組裝並檢查僅有 `index.html` 與 `cloud-client.js`，再從該目錄執行 Pages 上傳，防止後端設定、原始備份或 Secrets 被打包。

## 資料承接與備份

- 初次正式站於 2026-10-21 08:44:28（臺灣時間）使用 Cloudflare 一致性 SQL 備份建立；10 課、82 字、8 筆逐筆作答、9 筆進度、7 筆階段手動開關。沒有改寫測試來源。
- 備份先在本機 SQLite 驗證，再還原到全新且已確認為空的正式 D1；完整 schema、所有資料列與 sequence 比對一致，外鍵檢查通過。
- SQL SHA-256：`0a5ce963e1cf3c53924edeb12d8332e978a78bc33a59004dfbf346ccbb1a046a`。
- 從此兩站資料各自累積。若要再次同步資料，必須另做備份、差異比對與明確遷移，不能直接覆蓋已有進度的 DB。
- 原本 GitHub Pages 的本機版及原瀏覽器 localStorage 保留。不要把 localStorage 清除作為上線步驟。
