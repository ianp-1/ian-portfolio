# Ian Pang — Portfolio

A single-page portfolio built with [Astro](https://astro.build). Near-zero JS,
self-hosted type, and interaction-triggered motion. Design intent lives in
[`PRODUCT.md`](./PRODUCT.md) (strategy) and [`DESIGN.md`](./DESIGN.md) (visual system).

## Stack

- **Astro 5** — static output, zero JS by default; small `<script>` islands for the
  theme toggle, active-section nav, and scroll reveals.
- **Tailwind CSS 4** (via `@tailwindcss/vite`) with OKLCH design tokens in
  `src/styles/global.css`.
- **Content collections** — projects and experience live as typed markdown in
  `src/content/` (`src/content.config.ts` defines the schemas).
- **Fonts** — General Sans + Geist Mono, self-hosted from `public/fonts/`.

## Develop

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static output to dist/
npm run preview  # preview the production build
```

## Editing content

- **Projects:** add/edit a markdown file in `src/content/projects/` (fields:
  `title`, `order`, `description`, `tags`, `award?`, `code?`, `demo?`).
- **Experience:** add/edit a file in `src/content/experience/` (fields:
  `company`, `role`, `period`, `order`, `highlights`).
- **Hero, links, skills:** `src/data/site.ts`.

## Deploy

Static site — deploy the `dist/` output to Vercel, Cloudflare Pages, or Netlify.
No server runtime required.
