# Retold 📖

Retold is a reading-habit app. It gives you short, swipeable **retellings** of great books — a low-friction on-ramp that rebuilds the daily reading habit and nudges you toward finishing the real thing.

A retelling is *not* the book. It's our narrated take, offered in three lengths — **Essentials** (shortest), **Abridged** (condensed), and **Full** (full-length) — so you can meet a story before committing to the full text. Every book links out to buy or borrow the original.

The launch catalogue is public-domain classics. Progress persists per book, a Duolingo-style streak rewards reading a little every day, and finishing a retelling celebrates with a "get the real book" hand-off.

## Stack

- **App**: React Native / Expo (expo-router), TypeScript
- **Server**: Express + MongoDB (Mongoose), JWT auth
- Retellings are generated from source PDFs via an admin pipeline (Gemini / OpenRouter).

## Get started

```bash
npm install
npx expo start
```

Server:

```bash
cd server
npm install
npm start
```

See `RETOLD_PLAN.md` for the product direction and roadmap.
