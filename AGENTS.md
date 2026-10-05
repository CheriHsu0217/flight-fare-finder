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

- Auth uses Lovable Cloud built-in auth only (no profiles table yet) — v1 scope keeps schema empty.
- Signed-in pages live under `src/routes/_authenticated/` (client-only gate redirecting to `/signin`) — session lives in browser storage, so SSR can't gate.
