# Flight Price Notifier

Vite + React single-page app, deployed as static files on Vercel.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1c4f2df5-6901-46c3-995e-0f3a1dd2085e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Deploying to Vercel

`npm run build` (or `bun run build`) produces a static SPA in `dist/`. `vercel.json` sets the Vite framework preset, output directory `dist`, and rewrites all paths to `/index.html` so routes like `/app` work on refresh.

The backend is our own Supabase project (`https://xkamsmqpaqhqhauddrov.supabase.co`). Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (same values as `.env`) under Vercel → Project → Settings → Environment Variables for Production and Preview, then redeploy.
