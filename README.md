# LangAssist

LangAssist is a React + TypeScript web app for language learning practice.

Current module status:

- Voice: usable (speech recognition, translation, text-to-speech flow)
- Speaking: text chat with Gemini (browser-side API call)

## Tech Stack

- Frontend: React, TypeScript, Vite
- Routing: React Router
- Motion/UI: framer-motion
- Linting: ESLint

## Project Structure

- `src/`: app pages, components, APIs, i18n resources
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
- `VITE_GEMINI_API_KEY`
  - Browser-side key for Gemini Generate Content API.
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

### Conversation practice (Gemini)

The speaking page streams replies from the Gemini Generate Content API.

1. Set `VITE_GEMINI_API_KEY` in `.env`.
2. Run `npm run dev`.
3. Keep the model field aligned with a Gemini model your key can access. The app defaults to `gemini-2.5-flash-lite`.

## Troubleshooting

- Microphone does not work:
  - Check browser microphone permission and HTTPS requirement (or localhost in dev).
- Google API request fails:
  - Confirm API key exists, key restrictions are correct, and required APIs are enabled.
- Empty translation/voice behavior:
  - Check browser support for Speech APIs and selected language configuration.
- Speaking chat fails or shows a network error:
  - Verify `VITE_GEMINI_API_KEY` is set in `.env` and confirm the chosen model is available to that key.
  - If Gemini returns `API key not valid. Please pass a valid API key.`:
    - Double-check your `VITE_GEMINI_API_KEY` value is correct and active.
    - Ensure the key’s project has access to the Gemini API and the Generative Language API is enabled for that project.
