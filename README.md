# LangAssist

[繁體中文說明](./README.zh-Hant.md)

LangAssist is a React + TypeScript web app for language learning practice.

Current module status:

- **Voice** (`/voice`): speech recognition, translation, and text-to-speech (Google Cloud APIs from the browser).
- **Speaking** (`/speaking`):
  - **Text chat**: streaming replies from the Gemini Generate Content API.
  - **Oral — pipeline (default)**: record audio → Cloud Speech-to-Text → streaming Gemini reply → Cloud Text-to-Speech. Uses both Google Cloud and Gemini keys.
  - **Oral — Gemini Live**: real-time voice over WebSocket (`BidiGenerateContent`); uses `VITE_GEMINI_API_KEY` only. Pick a Live model in the UI when you want this mode.

## Tech Stack

- Frontend: React, TypeScript, Vite
- Routing: React Router
- Motion/UI: framer-motion
- Markdown in chat: react-markdown, remark-gfm
- Linting: ESLint

## Project Structure

- `src/`: pages, components, feature modules (voice, speaking), shared API helpers
- UI copy is largely Traditional Chinese (`zh-Hant`); there is no separate i18n bundle.
- `.env.example`: required environment variables template

## Environment Variables

Copy `.env.example` to `.env` and fill values:

```bash
cp .env.example .env
```

Required keys:

- `VITE_GOOGLE_CLOUD_API_KEY`
  - Browser-side key for Cloud Speech-to-Text, Translation, and Text-to-Speech (Voice page and **pipeline** oral mode).
  - Restrict this key by HTTP referrer and API scope in Google Cloud Console.
- `VITE_GEMINI_API_KEY`
  - Browser-side key for **Gemini Generate Content** (text streaming), **Gemini Live** (WebSocket), and the text-generation leg of **pipeline** oral mode.
  - Restrict this key by HTTP referrer and API scope.

Security notes:

- Do not place service account JSON/private keys in frontend env files.
- Never commit API keys in git.

## Local Development

Install dependencies:

```bash
npm install
```

Run app (Vite):

```bash
npm run dev
```

Run lint:

```bash
npm run lint
```

Build production bundle:

```bash
npm run build
```

### Speaking page (Gemini)

1. Set `VITE_GEMINI_API_KEY` in `.env` for any speaking feature (text chat, pipeline LLM step, or Live).
2. For **Voice** or **pipeline oral** STT/TTS, set `VITE_GOOGLE_CLOUD_API_KEY` and enable the Cloud APIs listed in `.env.example`.
3. Run `npm run dev` and open `/speaking`.

**Text chat:** streams from the Generate Content API. Default text model: `gemini-2.5-flash-lite` (change in the UI if your key supports other models).

**Oral modes** (dropdown on the speaking page):

- **Pipeline** (`oral-pipeline-flash-lite`): default; avoids Live API usage until you opt in. Requires both env keys and working Cloud + Gemini quotas.
- **Gemini Live** (e.g. `gemini-3.1-flash-live-preview`): native audio over WebSocket; ensure your project and key can use the Live / preview model you select.

## Troubleshooting

- Microphone does not work:
  - Check browser microphone permission and HTTPS requirement (or localhost in dev).
- Google API request fails:
  - Confirm API key exists, key restrictions are correct, and required APIs are enabled.
- Empty translation/voice behavior:
  - Check browser support for Speech APIs and selected language configuration.
- Speaking text chat fails or shows a network error:
  - Verify `VITE_GEMINI_API_KEY` is set in `.env` and confirm the chosen model is available to that key.
  - If Gemini returns `API key not valid. Please pass a valid API key.`:
    - Double-check your `VITE_GEMINI_API_KEY` value is correct and active.
    - Ensure the key’s project has access to the Gemini API and the Generative Language API is enabled for that project.
- Pipeline oral mode fails at transcribe or TTS:
  - Confirm `VITE_GOOGLE_CLOUD_API_KEY` and the Speech / Translation / Text-to-Speech APIs per `.env.example`.
- Gemini Live connects but errors or stays silent:
  - Confirm the Live model id matches what your key supports; check Generative Language API / Live preview access for that model.
