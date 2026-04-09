# LangAssist

[English README](./README.md)

LangAssist 是以 **React** 與 **TypeScript** 打造的語言練習網頁應用。

## 目前模組狀態

- **Voice**（`/voice`）：語音辨識、翻譯、文字轉語音（瀏覽器端呼叫 Google Cloud API）。
- **Speaking**（`/speaking`）：
  - **文字對話**：透過 Gemini **Generate Content** API 串流回覆。
  - **口語 — 管線模式（預設）**：錄音 → Cloud Speech-to-Text → Gemini 串流回覆 → Cloud Text-to-Speech。需同時設定 Google Cloud 與 Gemini 金鑰。
  - **口語 — Gemini Live**：以 WebSocket（`BidiGenerateContent`）進行即時語音；僅需 `VITE_GEMINI_API_KEY`。在介面中選擇 Live 模型即可使用此模式。

## 技術棧

- 前端：React、TypeScript、Vite
- 路由：React Router
- 動效／介面：framer-motion
- 對話內 Markdown：react-markdown、remark-gfm
- 程式品質：ESLint

## 專案結構

- `src/`：頁面、元件、功能模組（voice、speaking）、共用 API 輔助程式
- 介面文案多為**繁體中文**（`zh-Hant`）；未使用獨立的 i18n 資源包。
- `.env.example`：環境變數範本

## 環境變數

將 `.env.example` 複製為 `.env` 並填入值：

```bash
cp .env.example .env
```

必填項目：

- `VITE_GOOGLE_CLOUD_API_KEY`
  - 瀏覽器用金鑰，供 Cloud Speech-to-Text、Translation、Text-to-Speech 使用（**Voice** 頁與**管線**口語模式）。
  - 請在 Google Cloud Console 以 **HTTP 參照網址** 與 **API 範圍** 限制金鑰。
- `VITE_GEMINI_API_KEY`
  - 瀏覽器用金鑰，供 **Gemini Generate Content**（文字串流）、**Gemini Live**（WebSocket），以及**管線**口語模式中「模型產生文字」這一段使用。
  - 同樣請限制 HTTP 參照網址與 API 範圍。

安全提醒：

- 請勿將服務帳戶 JSON／私鑰放進前端環境變數檔。
- 請勿將 API 金鑰提交至 git。

## 本機開發

安裝依賴：

```bash
npm install
```

啟動開發伺服器（Vite）：

```bash
npm run dev
```

執行 Lint：

```bash
npm run lint
```

建置正式版：

```bash
npm run build
```

### Speaking 頁（Gemini）

1. 任何口說相關功能（文字對話、管線的模型步驟、Live）都需在 `.env` 設定 `VITE_GEMINI_API_KEY`。
2. 使用 **Voice** 或**管線口語**的 STT／TTS 時，需設定 `VITE_GOOGLE_CLOUD_API_KEY`，並在 GCP 啟用 `.env.example` 中列出的 Cloud API。
3. 執行 `npm run dev` 後開啟 `/speaking`。

**文字對話：** 由 Generate Content API 串流。預設文字模型為 `gemini-2.5-flash-lite`（若金鑰支援其他模型，可在介面中更換）。

**口語模式**（Speaking 頁下拉選單）：

- **管線**（`oral-pipeline-flash-lite`）：預設；在未改選 Live 前不會走到 Live API。需兩組環境變數與可用的 Cloud／Gemini 配額。
- **Gemini Live**（例如 `gemini-3.1-flash-live-preview`）：WebSocket 原生語音；請確認專案與金鑰支援你所選的 Live／預覽模型。

## 疑難排解

- 麥克風無法使用：
  - 檢查瀏覽器麥克風權限；正式環境需 **HTTPS**（本機開發可用 localhost）。
- Google API 請求失敗：
  - 確認金鑰存在、限制設定正確，且所需 API 已啟用。
- 翻譯／語音行為異常或空白：
  - 檢查瀏覽器對語音相關 API 的支援，以及語言設定。
- Speaking **文字對話**失敗或顯示網路錯誤：
  - 確認 `.env` 已設定 `VITE_GEMINI_API_KEY`，且所選模型對該金鑰可用。
  - 若出現 `API key not valid. Please pass a valid API key.`：
    - 再次確認 `VITE_GEMINI_API_KEY` 正確且有效。
    - 確認專案已啟用 Generative Language API，且金鑰有權使用 Gemini。
- **管線口語**在辨識或朗讀階段失敗：
  - 確認 `VITE_GOOGLE_CLOUD_API_KEY` 與 `.env.example` 所列 Speech／Translation／Text-to-Speech 等 API 已啟用。
- **Gemini Live** 連上後錯誤或沒有聲音：
  - 確認 Live 模型 ID 與金鑰權限相符；並檢查 Generative Language API 與該 Live／預覽模型的存取權限。
