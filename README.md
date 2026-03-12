# Texty AI

Custom AI chat app built with RedwoodSDK and the OpenRouter API.

## Setup

1. Install dependencies:

```shell
npm install
```

2. Create a `.dev.vars` file for local development:

```shell
OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_MODEL=openai/gpt-4o-mini
OPENROUTER_SITE_URL=http://localhost:5173
OPENROUTER_SITE_NAME=Texty AI
```

3. Start the app:

```shell
npm run dev
```

For deployment, set `OPENROUTER_API_KEY` as a Wrangler secret and keep the other values in Wrangler vars if you want to override the defaults.

## Scripts

- `npm run dev` starts the RedwoodSDK dev server.
- `npm run check` regenerates Wrangler types and runs TypeScript.
- `npm run build` creates a production build.
