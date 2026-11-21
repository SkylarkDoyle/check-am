# CheckAm Design System: "Basket"

Version 1.0 · Source of truth: Doop canvas `PUQwV-eftz` (pages "Brand and System", "Screens" and "Components")
Theme key in code: `data-doop-theme="basket"`

CheckAm is an offline-first PWA that checks a Nigerian consumer product against the NAFDAC public registry. Basket is the concept that treats that check as a friendly word from a trusted market trader: warm, plain, a little playful, and never the one deciding what is "fake".

---

## 1. Brand point of view

**One line:** A knowledgeable neighbour at the Mile 12 stall who reads you the registry, then tells you what to look at on the pack.

**Who it is for:** Parents and everyday shoppers standing in a shop or market, often on a mid-range Android phone with weak or no signal, deciding whether to buy.

**What the brand believes**

1. The registry speaks; we read it out. CheckAm states what the NAFDAC public registry shows and nothing more.
2. Reassurance is earned. Green appears only for an official registry match.
3. Warmth is not softness about facts. The voice is kind, the verdict wording is fixed.
4. It works where you are. Offline is a normal state, not an error.
5. Your photo stays on your phone.

**Personality sliders:** Friendly 5/5 · Playful 3/5 · Authoritative 2/5 (borrowed from the registry, never claimed) · Technical 1/5.

**Visual idea:** a market stall. Leaf-green ground, eggplant action colour, white "paper bag" surfaces, rounded produce shapes, round category thumbs, a speech bubble that reads the number back to you.

**What it is not:** an official NAFDAC product, a counterfeit detector, a community "fake" report board, or a government-styled site. Do not use NAFDAC's name as a brand mark, logo, or colour source.

---

## 2. Non-negotiable product rules (from the PRD)

| Rule | Design consequence |
| ---------------------------

## 13. Logo and brand assets

**Chosen mark:** Basket tick (canvas frame "04 Logo", Doop canvas `PUQwV-eftz`). A handled basket in eggplant `#4B2A7B` with a white tick. Wordmark: "Check" in `--color-ink`, "Am" in `--color-accent`, Nunito 900.

**Package location (in the repo):** [`frontend/brand/README.md`](frontend/brand/README.md) is the full file guide and integration steps.

| Path                             | Use                                                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/public/`               | Favicon set, Apple touch icon, Safari pinned tab, `site.webmanifest`, Windows tile. Served from the web root.                    |
| `frontend/public/icons/`         | PWA icons 48 to 512 (`any`) and `maskable-192/512`.                                                                              |
| `frontend/src/assets/brand/svg/` | Master SVGs: marks (primary, reversed, mono ink, mono white, `currentColor`), horizontal and stacked lockups, app-icon variants. |
| `frontend/brand/`                | Android adaptive layers, iOS and App Store icons, mark PNGs 16 to 1024, social avatars, head snippet. Not shipped.               |

**Integration notes**

1. Paste `frontend/brand/head-snippet.html` into `frontend/index.html` `<head>`.
2. One manifest only: with `vite-plugin-pwa`, set `manifest: false` and keep `public/site.webmanifest`, or move its fields into the plugin config.
3. Precache `favicon.svg`, `favicon.ico`, `apple-touch-icon.png` and `icons/*.png` via `includeAssets` so the install icon and tab icon work offline.
4. `theme-color` is `#4B2A7B` (`--color-accent`); manifest `background_color` is `#EAF4E1` (`--color-ground`). Update both if the theme changes.
5. Maskable icons keep the mark inside the central 62% of the canvas; the tile is opaque eggplant.

**Usage rules**

- Minimum sizes: mark 16px, horizontal lockup 96px wide. Clear space equals the tick height on every side.
- Eggplant mark with white tick on light grounds; reversed (white mark, eggplant tick) on eggplant. On a camera view use the reversed mark.
- The tick is white or eggplant only. Never green, amber or red, which mean registry status.
- No NAFDAC name, colours, seal or crest shape, in or beside the logo.
- Do not stretch, outline in another colour, add shadows, or place on a busy photo.

**Known limits**

- Lockup SVGs use live Nunito text. Inline them in the app (a CSS `<img>` loses the web font), and outline the wordmark before print or store use.
- 16px favicon is legible but the tick is small; check on a real device before launch.
- No Open Graph (1200x630) image or iOS splash screens yet.

---

## 14. Added screens, components and Home animation

Canvas: page "Screens".

**New components:** `Logo` (tone default/reversed, layout horizontal/stacked, size sm/md/lg; wordmark is live text), `Toggle` (off/on/disabled; the on state shows a tick), `SettingRow` (title, detail, control slot, min height 64px), `Segmented` (3 options, `active` 1 to 3).

**New screens:** About, Saved, Result match, Result alert, Search results, No result, First sync, Camera blocked, Share dialog, Save feedback. Result match uses `--color-ok-bg`, alert uses `--color-alert-bg`; both show the full-wording StatusBadge, the sync date and the Disclaimer. The alert headline is "Named in a public alert", never advice.

**About screen (PRD-only settings):** the stacked reversed Logo, "Check am now" and the version sit in an eggplant panel at the top. Below, only settings the PRD supports: Offline catalog (products on phone, last synced, "Update automatically" toggle, "Update catalog now"), Privacy and data (fixed "ALWAYS" rows for "Photos stay on this phone" and "No account needed", "Clear saved checks"), and Sources and legal (registry source, public alerts, mandatory Disclaimer). Removed as not in the PRD: sound, torch, Wi-Fi only, text size, reduce motion. The animation follows the phone's reduce-motion setting.

**Added in round 2:** Share on WhatsApp sheet (neutral message preview using the exact verdict wording and sync date, Open WhatsApp, Copy text, Cancel; no photo is shared) and Save feedback (toast "Saved to this phone" with View and Undo, Save button becomes "Saved"). The No result screen spacing was re-laid out. Home hero art is now SVG packaged goods (cereal box, water bottle, tinned tomato, seasoning sachet), and the post-typing state shows the logo with a "Check am now" pill that has a pulsing dot.

**Home hero animation (10s loop, CSS only):**
| Time | Event |
|---|---|
| 0.3 to 2.4s | "What are you buying today?" types one character at a time, with a caret at the latest character |
| 2.4 to 4.2s | Headline holds |
| 4.2 to 4.6s | Headline fades out |
| 4.6 to 5.3s | Reversed horizontal Logo and "Check am now" fade and rise in |
| 5.3 to 8.9s | Logo holds |
| 8.9 to 9.5s | Logo fades out; loop restarts |

Implementation: each character is a span with its own keyframe (`tc0..tc25`, caret `cc0..cc25`); the logo layer uses keyframe `lg`. All use `animation-delay: -3.6s`, so the first paint shows the finished headline and static previews are readable; remove it to start from the first keystroke. Under `prefers-reduced-motion` the headline is shown static and the logo layer is hidden. The stage has a fixed 122px height so nothing below moves, and an `aria-label` carries the full text for screen readers. The setting "Reduce motion" in About should add the same behaviour inside the app.

**Home hero logo (round 3):** after the typing phase the hero shows the reversed stacked Logo (mark above wordmark, about 185px wide, left-aligned with the headline, within the 128px stage), replacing the earlier horizontal logo and the "Check am now" pill. Transparent PNGs of the stacked lockup are in `frontend/brand/logo-stacked/`.

**Home hero logo (current):** the logo phase sits directly on the eggplant hero, left-aligned with the headline inside the fixed 128px stage (nothing below moves). It uses `Logo` tone `onaccent`, `layout="stacked"`, `align="start"`, size md: white mark with eggplant `#4B2A7B` tick, "Check" `#DCEBD0`, "Am" `#EAF4E1` (`--color-ground`). Contrast on `--color-accent`: `#DCEBD0` 8.79:1, `#EAF4E1` 9.67:1, white mark 10.96:1. The default-tone "Check" colour `#1D2A1A` must not be used on the hero (1.37:1).
Hero asset reference: `frontend/brand/logo-stacked/checkam-logo-stacked-hero-{1024,512,256,128}.png` (transparent) and `checkam-logo-stacked-hero.svg`. Use these only on `--color-accent` or similarly dark eggplant grounds. Hero art is a cereal box, tinned tomato and juice carton with straw.

---

## 15. Hero food art (SVG reference)

Exact source: [`frontend/src/assets/brand/hero-food-art.svg`](frontend/src/assets/brand/hero-food-art.svg). Do not redraw it; inline the file or import it as a React component (`?react` with `vite-plugin-svgr`). It is the decorative illustration at the top right of the Home hero, shown with the "What are you buying today?" headline.

**Content:** three packaged edible products in a row: a cereal box (back left), a juice carton with a straw (back right), a tinned tomato (front centre). No hosted images; pure SVG.

### Geometry

| Property                                            | Value                                                                                                                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `viewBox`                                           | `0 0 166 134`                                                                                                                                                  |
| Rendered size                                       | `143 x 116` px (scale 0.8614)                                                                                                                                  |
| Stroke                                              | `#1D2A1A`, width 3 (2.5 on label details, 3.5 on the straw and tin label line, 2 on the leaf and tin rim), `stroke-linejoin="round"`, `stroke-linecap="round"` |
| Stacking order (paint order, first = furthest back) | 1. cereal box, 2. juice carton, 3. tin. The tin must be last so it overlaps the lower right of the box and the lower left of the carton.                       |
| Carton offset                                       | `transform="translate(-14 2)"` on the carton group. This is what pulls it close to the tin. Do not change it.                                                  |

### Placement in the hero

```css
.hero {
  position: relative;
  overflow: hidden;
  padding: 20px;
} /* hero = eggplant panel, radius 28px */
.hero .food-art {
  position: absolute;
  right: 12px;
  top: 12px;
} /* svg, aria-hidden */
.stage h1 {
  max-width: 205px;
} /* headline never runs under the art */
```

The art floats on top of the right of the hero and never changes layout. At the 390px reference width it occupies x 235 to 378 and y 56 to 172 of the screen. It is shown in both animation phases (headline and logo) and is static (no animation). On widths under 360px keep the same offsets and let the headline wrap; do not scale the art.

### Shapes and fills (all fills are fixed hex values, intentionally not theme tokens, because food colours must not change with the theme)

| Part                     | Shape                                          | Fill                        |
| ------------------------ | ---------------------------------------------- | --------------------------- |
| Cereal box body          | rect x12 y12 w68 h104 rx8                      | `#FFE0A3`                   |
| Cereal box top flap line | path `M12 32h68`, no fill                      | stroke only                 |
| Cereal bowl circle       | circle cx46 cy68 r20                           | `#FFF8DC`                   |
| Cereal sun (half disc)   | path `M30 74a17 17 0 0 1 32 0z`                | `#F2A33A`                   |
| Sun rays                 | path `M46 44v-7M30 52l-5-5M62 52l5-5`, no fill | stroke only                 |
| Cereal label bar         | rect x24 y97 w44 h6 rx3                        | `#1D2A1A`, no stroke        |
| Carton roof              | path `M134 54l9-17h26l9 17z`                   | `#F7FBF2`                   |
| Carton body              | rect x134 y54 w44 h64 rx4                      | `#FFF8DC`                   |
| Carton straw             | path `M158 37V19q0-6 6-6h9`, no fill           | stroke `#D6322A`, width 3.5 |
| Carton orange band       | rect x134 y74 w44 h28                          | `#F2A33A`                   |
| Orange fruit             | circle cx156 cy88 r9                           | `#FFF8DC`                   |
| Orange leaf              | path `M156 79c1-5 5-6 8-5-1 4-4 6-8 5z`        | `#4C9A3B`                   |
| Carton text line         | path `M142 110h28`, no fill                    | stroke only                 |
| Tin body                 | path `M68 70v42c0 5 13 9 29 9s29-4 29-9V70`    | `#D6322A`                   |
| Tin label                | rect x68 y86 w58 h22                           | `#FFF8DC`                   |
| Tin label line           | path `M80 97h34`                               | stroke only, width 3.5      |
| Tin lid                  | ellipse cx97 cy70 rx29 ry9                     | `#DCEBD0`                   |
| Tin lid ring             | ellipse cx97 cy70 rx21 ry5.5, no fill          | stroke only, width 2        |

(Carton coordinates are before the `translate(-14 2)`.)

### Accessibility and rules

- Purely decorative on Home: render with `aria-hidden="true"` and no `role`/`<title>` (the file's `<title>` is for standalone use only).
- Never put product claims, brand names or NAFDAC marks on the illustrated packs. They are generic goods.
- The category thumbnails (`Thumb`) are a different, simpler outline set; do not substitute one for the other.

---

## 16. Product image preview, share sheet and All products feed

Canvas frames (page "Screens"): `Home` (about 2,500px tall), `Home / Loading more`, `Home / End of list`, `Result / Not found`, `Image preview`, `Share dialog`, `Result / Match`, `Result / Alert`, `Saved / Feedback`.

### 16.1 Product strip on result screens

- Thumbnail is **72x72px** (`Thumb` md overridden to 72), radius `--radius-md`, on `--color-surface-alt`. A hotlinked manufacturer photo replaces the SVG pack when it loads; keep the 72px box fixed so layout does not shift.
- **Expand badge:** 28px circle, `--color-accent` fill, `--color-on-accent` icon, 2px `--color-surface` ring, overlapping the thumbnail's bottom-right by 6px. Icon is the Tabler "arrows-diagonal" shape (two arrows to opposite corners), 16px, stroke 2.4, round caps:
  `<path d="M16 20h4v-4"/><path d="M14 14l6 6"/><path d="M8 4H4v4"/><path d="M4 4l6 6"/>` on a 24 viewBox.
- The thumbnail plus badge is one button: `role="button"`, `aria-label="View larger image"`, min target 44px (the badge extends it). Tapping opens the image sheet.
- The strip card: `--color-surface`, `--border-w` solid `--color-line`, radius `--radius-lg`, padding 12px, gap 12px. Product name Nunito 900 16px, maker line 13px `--color-ink-muted`.

### 16.2 Image sheet (bottom sheet viewer)

- Opens over the result page. The page behind gets `rgba(29,42,26,.35)` and `backdrop-filter: blur(4px)`.
- Sheet: `--color-surface`, top radius `--radius-lg`, padding 12px 20px 24px, gap 12px. Contents only: grab handle (44x5px, `--color-line`), image container, product name (Nunito 900 20px), then `RegNumber` plus maker (13px muted).
- **Image container:** full sheet width, `aspect-ratio: 4/3`, `--color-surface-alt`, `--border-thin` solid `--color-line`, radius `--radius-lg`, image centred (`object-fit: contain`, SVG fallback at 84% width).
- Deliberately absent: title text, close button, zoom, full-screen mode, image-credit line. Dismiss by dragging the handle down, tapping the blurred area, or the system back gesture; Escape on desktop.

### 16.3 Share sheet

Same sheet and the same 4:3 image container as 16.2. Order: grab handle, "Share on WhatsApp" (Nunito 900 22px), image container, product name (18px) and `RegNumber`, full-wording `StatusBadge`, disclaimer line, primary "Open WhatsApp", then a two-column row with secondary "Copy text" and ghost "Cancel". The sheet is only as tall as its content (no empty space under the buttons). Removed from the message: "CheckAm result" and the registry-synced line (the sync date stays on the result screen). Disclaimer text: "Inspect the pack yourself. CheckAm shows what the NAFDAC registry says. It does not decide whether a product is genuine."

### 16.4 Home: All products feed

- Under "Just checked" a header row: "All products" (Nunito 900, `--text-title`) and the count "4,820 products" (13px bold, muted).
- Grid: 2 columns, 12px gap, the same `ProductCard layout="tile"` as "Just checked". **10 items per page** (5 rows).
- After the first page: "Showing 10 of 4,820" and a ghost "Load more" button (keyboard and screen-reader fallback).
- **Infinite scroll:** an `IntersectionObserver` on a sentinel placed about 400px above the end of the list requests the next 10 from the on-device catalog (Dexie, offline). Stop observing while a page is loading.
- **Loading more frame:** a centred row with a rotating arc (20px, 0.9s linear) and "Loading 10 more", then skeleton tiles with the same size as real tiles (white card, `--color-line` border, image block, three bars) pulsing at 1.4s. Respect `prefers-reduced-motion` (no rotation or pulse).
- **End of list frame:** "You have seen all 4,820 products" (Nunito 900, lead size), "Registry synced 18 Nov 2026" (13px muted) and a secondary "Back to top" button.
- Keep the TabBar reachable at all times; never load a page that pushes the tab bar offscreen.
