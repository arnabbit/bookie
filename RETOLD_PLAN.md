# Retold — pivot from "Booksocial" to solo reading-habit app

## Context

Critics read the current app as "AI summaries branded as books" — UI presents Gemini-generated condensations with the real author's name, no disclosure, no link to the original. The actual mission: fun on-ramp that builds a daily reading habit and pushes people toward the real book. Pivot decisions (user-confirmed):

- New branch `rethinking` off `booksocial`; work happens there.
- Rebrand to **Retold** (one word). Artifact is called a **"retelling"** — never "AI retelling" (copy must not say "AI").
- Formats stay mini/pro/ultra = retelling lengths (Essentials/Abridged/Full); copy clarifies length honestly.
- No paperback mode. Instead: Amazon/Kindle **affiliate link** per book (placeholder tag, env-configured).
- Duolingo-style streaks with freeze tokens.
- **Kill legacy local reader** stack entirely.
- **Hide all social** behind a flag (solo launch); server social code stays.
- Public-domain catalogue — no copy/legal work needed beyond honesty layer.

## 0. Branch

`git checkout booksocial && git checkout -b rethinking`

## 1. Social hide (flag)

New `lib/flags.ts`: `export const SOCIAL_ENABLED = false;`

- `app/(tabs)/_layout.tsx` — social tab: `options={{ href: SOCIAL_ENABLED ? undefined : null }}` (route file stays, tab disappears; one-line flip to restore).
- `app/_layout.tsx:115-117` — register `chat`, `conversations`, `book-picker` Stack.Screens only when `SOCIAL_ENABLED`.
- `app/read/[id].tsx` — delete social surface: share/comment state (26-31), `fetchComments` + effect (64-80), `openShareModal`/`sharePageWithFriend` (144-185), `postComment`/`deleteComment` (187-218), socket.io import (line 18), header action buttons (257-270), both modals (305-398) + their styles. (Full deletion here, not flag — reader gets rebuilt around habit features.)
- `app/(tabs)/profile.tsx` — Friends stat tile replaced by Streak tile (see §5).

## 2. Kill legacy local reader (clean deletion — verified no live importers; BooksProvider never mounted)

Delete: `books.ts`, `books/phophet.ts`, `books/portrait.ts`, `books/prideAndPrejudice.ts`, `types.ts`, `lib/BooksContext.tsx`, `lib/bookStorage.ts`, `components/ChapterView.tsx`, `components/PageView.tsx`, `components/ProgressBar.tsx`, `components/BookCard.tsx`, `components/AddBookButton.tsx`, `app/add-book.tsx`, `app/read/[id]/chapter/[chapterId].tsx` (+ empty dir).

Keep: `lib/openrouter.ts` (admin OCR uses `ocrPdf`; unused named exports may be pruned), `app/index.tsx` (entry redirect), admin pipeline untouched.

Check client `__tests__/` for tests importing deleted modules (e.g. page-indicator); delete/update those tests.

## 3. Rebrand → Retold

- `app.json` — `name`/`slug` → `retold`. **Caution**: `scheme` change affects deep links/OAuth callback — grep for `bookie://` (incl. `server/public/auth-callback.html`, passport config) before renaming scheme; rename everywhere together or leave scheme as-is this pass.
- `package.json:2` name → `retold`.
- `app/auth/login.tsx:105-119` — brand "Retold", new tagline (e.g. "Great books, retold. Then read for real." — finalize during impl; no "AI" wording), keep login flow.
- `app/(tabs)/profile.tsx:148` — "Logout from Retold".
- `app/help.tsx` — rewrite: remove stale PDF-upload/API-key copy (109, 132, 137, 157); describe: retellings of real books, three lengths, streaks, get-the-real-book link.
- `README.md` — replace Expo boilerplate with short product description. `BOOKSOCIAL_PLAN.md` — superseded; replace or prepend pointer to new positioning.

## 4. Progress → UserBook + completion (server)

- `server/src/models/UserBook.js` — add `lastPage: Number (0)`, `startedAt: Date`, `finishedAt: Date (null)`.
- `server/src/routes/books.js`:
  - `POST /:id/position` (158-173): write `UserBook.lastPage` (legacy Map write as fallback if no UserBook row); set `finishedAt = now` when `page >= formats[format].length - 1` first time; run streak transition (§5). Response: `{ page, streak: {current, longest, freezeTokens, extendedToday}, finished, finishedNow, purchaseUrl }`.
  - `GET /:id/position` (176-187): read `UserBook.lastPage ?? user.readingPositions[key] ?? 0`.
  - `GET /my-books` (44-75): progress from `ub.lastPage` (legacy fallback), include `finishedAt`.
- Migration: lazy — writes self-heal to UserBook; no script required. Optional later script to drop `User.readingPositions`.
- `finishedAt` not backfillable; Books Finished starts at 0 — acceptable.

## 5. Streaks (Duolingo-style)

- `server/src/models/User.js` — add subdoc `streak: { current:0, longest:0, lastActiveDay:'YYYY-MM-DD', freezeTokens:0, lastFreezeEarnedAt:0 }` (keep `readingPositions`).
- New `server/src/lib/streak.js` — pure `applyStreakTransition(streak, localDate)`:
  - same day → no-op; +1 day → `current+1`; gap of exactly 2 days AND token → spend token, `current+1`; else reset to 1. `longest = max`. Earn +1 token per streak multiple of 7 (guard `lastFreezeEarnedAt`), cap 2. Date math via UTC-noon helper on `YYYY-MM-DD` strings.
  - Unit tests (server jest exists): same-day / next-day / freeze-gap / long-gap / clock-skew.
- Day counts on first position-save of that day. Client sends `localDate` (device-local `YYYY-MM-DD`) in position POST; server sanity-checks ±1 day vs server UTC date, else uses server date.
- New `GET /api/users/me/streak` in `server/src/routes/users.js` → `{ current, longest, freezeTokens, lastActiveDay, activeToday }`.
- Client: flame+count chip in books-tab header (`app/(tabs)/books.tsx`) fed by `/me/streak`; Streak tile on profile (current/longest, freeze token count); one-shot streak celebration overlay in reader when `extendedToday`.

## 6. Completion celebration + Amazon CTA

- `components/CompletionCelebration.tsx` (new) — full-screen overlay in reader on `finishedNow` (or last page + finished): "You finished the retelling of {title}", streak line, primary CTA **"Get the real book"** → `Linking.openURL(purchaseUrl)`, secondary "Done" → back to library.
- `server/src/models/Book.js` — add `amazonUrl: String` (optional, admin-entered; add field to `app/admin.tsx` upload form + `POST /upload`).
- Server computes `purchaseUrl` in list/detail/read/position responses: `amazonUrl` if set, else `https://www.amazon.com/s?k=<encoded title+author>` + `&tag=$AMAZON_AFFILIATE_TAG` when env set. Tag: `AMAZON_AFFILIATE_TAG` in `server/.env(.example)` — placeholder now, keeps tag server-side.
- `app/(tabs)/books.tsx` detail modal — "Get the real book" outline button; "Finished" badge on library cards with `finishedAt`.

## 7. Honesty/attribution layer

- Server adds `readMinutes: {mini, pro, ultra}` = `ceil(pages*30/60)` to book list/detail responses.
- `lib/theme.ts:157` — keep `FORMAT_DISPLAY`, add `FORMAT_TAGLINE`: mini "shortest retelling", pro "condensed retelling", ultra "full-length retelling".
- `app/(tabs)/books.tsx` detail modal (230-341) — badge under title: "A retelling — not the original text"; format cards show `~{min} min · {tagline}` (replaces bare `N PAGES`, 293-305).
- `app/read/[id].tsx` header — attribution line: "A retelling of {title} by {author}" + `~X min`.
- **Copy rule everywhere: "retelling", never "AI".**

## 8. Onboarding (3 screens, first launch)

- `app/onboarding.tsx` (new single route) — horizontal pager (FlatList paging + dots + Skip/Next): (1) "Retellings, not the books" (2) "Read a little every day — keep your streak" (3) "Love it? Get the real book." Final button writes AsyncStorage `retold_onboarding_seen_v1`, `router.replace('/(tabs)/books')`.
- `app/_layout.tsx` — register screen (`headerShown:false`); AuthGuard: when `token && !onboardingSeen && segments[0] !== 'onboarding'` → replace to onboarding; render existing spinner while flag loading (avoid tab flash).

## Commit order (each independently shippable)

1. branch + social hide (flags, tab/stack gating, reader strip)
2. legacy reader deletion
3. rebrand copy (Retold)
4. progress → UserBook (no visible change)
5. streaks (+ streak.js unit tests)
6. completion overlay + finished stats
7. attribution + readMinutes + format copy
8. amazonUrl/purchaseUrl + CTAs
9. onboarding

## Verification

- `npm test` (client) and `cd server && npm test` after each phase; new streak.js unit tests must cover the 5 date cases.
- Run app (expo web via launch.json) + server: login → onboarding shows once → Library: no Social tab, streak chip → open book detail: retelling badge, `~min` copy, Get-the-real-book link opens Amazon search → read pages: position persists (reload restores), first page of day pops streak overlay → jump to last page: completion overlay + CTA → profile: Books Finished/Pages/Streak tiles, no Friends.
- Grep checks: no imports of deleted modules; no user-facing "Booksocial"/"Bookie"/"AI" strings; `bookie://` scheme audit before any scheme rename.

## Unresolved questions

1. Rename `app.json` `scheme` too (deep-link/OAuth risk) or defer?
2. Login tagline final copy ok to draft during impl?
3. Streak freeze cap 2, earn every 7 days — fine?
4. Read-time constant 30s/page — fine?
5. Delete `BOOKSOCIAL_PLAN.md` or rewrite as RETOLD_PLAN.md?
