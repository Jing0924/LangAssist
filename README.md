# LangAssist

LangAssist is a React + TypeScript web app for language learning practice.

Current module status:

- Voice: usable (speech recognition, translation, text-to-speech flow)
- News: usable (technology headlines with reading/listening practice)
- Vocabulary: placeholder
- Speaking: placeholder

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
