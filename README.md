# LangAssist

LangAssist is a React + TypeScript web app for language learning practice.

Current module status:

- Voice: usable (speech recognition, translation, text-to-speech flow)
- News: usable (technology headlines with reading/listening practice)
- Vocabulary: placeholder
- Speaking: text chat with Gemini via Netlify Functions (`netlify dev` locally, deploy-ready with server-side key)

## Tech Stack

- Frontend: React, TypeScript, Vite
- Routing: React Router
- i18n: i18next + react-i18next
- Motion/UI: framer-motion
- Linting: ESLint
- Optional local function runtime: Netlify Dev

## Project Structure

- `src/`: app pages, components, APIs, i18n resources
- `netlify/functions/`: serverless functions for deployment/runtime proxy tasks
- `netlify.toml`: Netlify Functions config (functions directory)
- `.env.example`: required environment variables template

## Environment Variables

Copy `.env.example` to `.env` and fill values:

```bash
cp .env.example .env
```

Required keys:

- `VITE_GOOGLE_CLOUD_API_KEY`
  - Browser-side key for Google Cloud APIs used by the app.
  - Restrict this key by HTTP referrer and API scope in Google Cloud Console.
- `NEWSAPI_KEY`
  - Server-side key for NewsAPI (used by Netlify Functions / local function runtime).
- `GEMINI_API_KEY`
  - Server-side key for the Gemini Generate Content API (used by `netlify/functions/speaking-chat.ts`).
  - This must be a key that can call `generativelanguage.googleapis.com` (Gemini API / Google AI Studio).
  - Avoid **HTTP referrer–restricted** keys here (those are for browser usage). Netlify Functions have no stable referrer, and IP allowlisting is usually impractical in production.

Security notes:

- Do not place service account JSON/private keys in frontend env files.
- Keep sensitive keys in deployment platform environment settings (for example, Netlify dashboard), not in git.

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

If you need local Netlify Functions behavior:

```bash
netlify dev
```

### Conversation practice (Gemini)

The speaking page streams replies from the Gemini Generate Content API.

1. Set `GEMINI_API_KEY` in your local environment (`.env` used by Netlify CLI) and in your deployment platform environment settings.
2. Run **`netlify dev`** (not only `npm run dev`) so `/.netlify/functions/speaking-chat` is available during local development.
3. Keep the model field aligned with a Gemini model your key can access. The app defaults to `gemini-3.1-flash-lite-preview`.

Optional: set `GEMINI_API_BASE` to override the API base URL (default: `https://generativelanguage.googleapis.com/v1beta`).

## Deployment Notes (Netlify)

- `netlify.toml` points functions to `netlify/functions`.
- Configure required environment variables in Netlify site settings:
  - `VITE_GOOGLE_CLOUD_API_KEY`
  - `NEWSAPI_KEY`
- Ensure frontend API calls and function paths align with deployed routes.

## Troubleshooting

- Microphone does not work:
  - Check browser microphone permission and HTTPS requirement (or localhost in dev).
- Google API request fails:
  - Confirm API key exists, key restrictions are correct, and required APIs are enabled.
- News data cannot load:
  - Verify `NEWSAPI_KEY` is set for your runtime (local Netlify env or Netlify dashboard).
- Empty translation/voice behavior:
  - Check browser support for Speech APIs and selected language configuration.
- Speaking chat fails or shows a network error:
  - Use `netlify dev`, verify `GEMINI_API_KEY` is set, and confirm the chosen model is available to that key.
  - If Gemini returns `API key not valid. Please pass a valid API key.`:
    - Double-check you did not accidentally paste a browser-only key (HTTP referrer restricted) into `GEMINI_API_KEY`.
    - Ensure the key’s project has access to the Gemini API and the Generative Language API is enabled for that project.
