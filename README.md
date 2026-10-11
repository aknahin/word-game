# Flowfield Word Game

A React + Vite word game that is ready to deploy on Netlify.

## Play

Play the game here: https://letter-chase-game.netlify.app/

## Controls

- Click any cell to move the cursor there.
- Use arrow keys to nudge the cursor.
- Use the entry slider to control how often new letters appear.
- Use the speed slider to set how long each letter takes per block.
- New letters enter from the top, right, bottom, or left edge.
- Locked letters become obstacles for future letters.
- End the game manually or fill the board.

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
