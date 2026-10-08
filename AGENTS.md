<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# Project rules

- Plain Vite + React SPA (no SSR). `vite build` emits static files to `dist/`; `vercel.json` rewrites every path to `/index.html` so deep links resolve client-side.
- Routing uses React Router (`src/router.tsx`); pages live in `src/pages/`.
- Auth uses Lovable Cloud built-in auth only (no profiles table yet) — v1 scope keeps schema empty.
- Signed-in pages are wrapped in `RequireAuth` (`src/pages/RequireAuth.tsx`), a client-only gate redirecting to `/signin`.
