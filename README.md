# Flowfield Word Game

A React + Vite word game that is ready to deploy on Netlify.

## Local development

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Netlify

This repo includes a [`netlify.toml`](/Volumes/AK-Drive/word-game/netlify.toml) with:

- Build command: `npm run build`
- Publish directory: `dist`
- SPA redirect: all routes rewrite to `/index.html`

If you connect this GitHub repo to Netlify, it should deploy without extra UI configuration.
