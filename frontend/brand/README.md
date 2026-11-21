# CheckAm logo asset package

Mark: **Basket tick** (Concept E "Basket", logo option 1). Eggplant `#4B2A7B`, white tick, leaf-green ground `#EAF4E1`, wordmark in Nunito 900 ("Check" ink `#1D2A1A`, "Am" eggplant).
Full usage rules are in `DESIGN_SYSTEM.md`, section 13.

## Where things live

| Location | Contents | Shipped to users? |
|---|---|---|
| `frontend/public/` | favicon set, `apple-touch-icon.png`, `safari-pinned-tab.svg`, `site.webmanifest`, `browserconfig.xml`, `mstile-150x150.png` | Yes, from the web root |
| `frontend/public/icons/` | PWA icons `icon-48` to `icon-512` (purpose `any`, transparent) and `maskable-192/512` (opaque, safe zone respected) | Yes, at `/icons/` |
| `frontend/src/assets/brand/svg/` | Master SVGs for in-app use: marks, horizontal and stacked lockups, app-icon variants | Bundled when imported |
| `frontend/brand/` | Non-web assets: `android/` (adaptive icon layers, Play Store 512), `ios/` (touch icons, App Store 1024), `png/mark/` (mark at 16 to 1024 in primary, reversed, mono ink, mono white), `social/` (avatars 400 and 1024), `preview/`, `head-snippet.html` | No (reference and hand-off only) |

## Integration

1. **index.html**: paste `frontend/brand/head-snippet.html` into `<head>`.
2. **Manifest**: `public/site.webmanifest` is complete. If you use `vite-plugin-pwa`, either set `manifest: false` and keep this file, or copy its fields into the plugin's `manifest` option. Do not do both, or you get two manifests.
3. **Service worker precache**: add the icons so they work offline. With `vite-plugin-pwa`:
   ```ts
   VitePWA({
     manifest: false,
     includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'icons/*.png'],
   })
   ```
   Keep the precache list small: only `icon-192`, `icon-512`, `maskable-192`, `maskable-512` and the favicons are required offline.
4. **In-app logo (React)**:
   ```tsx
   import mark from '@/assets/brand/svg/mark-primary.svg';
   <img src={mark} alt="CheckAm" height={32} />
   ```
   For the lockup use inline SVG (see Rules: the wordmark is live text, so `<img>` would lose the Nunito font). With `vite-plugin-svgr`: `import Lockup from '@/assets/brand/svg/lockup-horizontal.svg?react'`.
   Use `svg/mark-currentcolor.svg` inline when the mark must follow a text colour (tick colour via `--tick`, default white).
5. **Reversed on eggplant**: use `*-reversed.svg` (white mark, eggplant tick).
6. **Check**: Lighthouse PWA audit should show installable, maskable icon present, and `theme-color` set.

## File guide

| Need | File |
|---|---|
| Browser tab | `favicon.svg` (modern), `favicon.ico` (16, 32, 48), `favicon-32x32.png`, `favicon-16x16.png` |
| iOS home screen | `apple-touch-icon.png` (180, opaque; iOS rounds it) |
| Android install (PWA) | `icons/icon-192.png`, `icons/icon-512.png`, `icons/maskable-*.png` |
| Windows tile | `mstile-150x150.png`, `browserconfig.xml` |
| Safari pinned tab | `safari-pinned-tab.svg` (single colour; the `color` attribute sets the tint) |
| Header logo | `src/assets/brand/svg/lockup-horizontal.svg` (inline) |
| Splash or empty state | `src/assets/brand/svg/lockup-stacked.svg` |
| WhatsApp share preview, social avatar | `brand/social/avatar-1024.png`, `avatar-400.png` |

## Rules (short version)

- Minimum sizes: mark 16px, horizontal lockup 96px wide.
- Clear space: the height of the tick on every side.
- The tick is white or eggplant only. Never green, amber or red (those mean registry status).
- Never add NAFDAC's name, colours, or a seal or crest shape.
- **The wordmark in the lockup SVGs is live text (Nunito 900), not outlines.** Loaded through `<img src>`, an SVG cannot use the page's web fonts, so the wordmark would fall back to a system font. In the app, paste the lockup SVG inline (or build it as a React component) so it picks up the self-hosted Nunito. Outline it to curves, from the Nunito source font, before using it anywhere fonts are unavailable: print, store listings, social images. The mark-only SVGs and every PNG are unaffected.

## Not included yet

- A 1200x630 Open Graph image (the avatar is square; WhatsApp previews crop it).
- Splash screens for iOS (`apple-touch-startup-image`); not needed for MVP.
- Final outlined wordmark.

## Stacked logo (transparent PNG), added for the Home hero

`frontend/brand/logo-stacked/` holds the stacked Basket-tick lockup (mark above the "CheckAm" wordmark) on a transparent background, with the wordmark already rendered in Nunito 900, so it needs no font.

| File | Use |
|---|---|
| `checkam-logo-stacked-primary-{1024,512,256,128}.png` | Light grounds: eggplant mark, ink "Check", eggplant "Am" |
| `checkam-logo-stacked-reversed-{1024,512,256,128}.png` | Eggplant or dark grounds: all white, eggplant tick |
| `checkam-logo-stacked-primary.svg`, `...-reversed.svg` | Vector masters (wordmark is live text: inline them in the app) |

Each PNG has 8% transparent padding. On the Home hero use the reversed version at about 185px wide, left-aligned with the headline, vertically centred in the 128px stage.

### Hero variant (on eggplant)

| File | Colours |
|---|---|
| `checkam-logo-stacked-hero-{1024,512,256,128}.png` (transparent) and `checkam-logo-stacked-hero.svg` | White mark with eggplant `#4B2A7B` tick, "Check" `#DCEBD0`, "Am" `#EAF4E1` |

Use only on `#4B2A7B` (the Home hero). On light grounds use the primary files. The SVG wordmark is live text; inline it.
