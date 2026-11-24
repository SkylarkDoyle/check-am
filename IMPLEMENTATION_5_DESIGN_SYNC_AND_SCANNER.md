# Implementation 5: Sync the frontend to the Doop design, and fix the OCR scanner

Frontend only. No backend, ETL or database changes.
Design source: Doop canvas https://doop.design/c/PUQwV-eftz (page "Screens", theme `basket`).

## Status

| Item | State |
| --- | --- |
| Part A (design sync), install popup, share image and Open Graph tags | Built; Home checked in a browser at phone width; not yet on a real phone |
| Part B (scanner) | Built; unit tests pass; not yet run with a real camera |
| B5 `eng.traineddata.gz` self-hosting | Open: drop the file in `public/tesseract/` and point `langPath` at it |

## Design references (frames to build from)

| Change | Doop frame | Frame id |
| --- | --- | --- |
| Home: hero photo, subtitle, Care and Meds icons, AI sparkle in the search bar with one-time tip | Home | CsbsuRd3Cp |
| Home loading: hero photo | Home / Loading | S76rIU_YNS |
| Install popup above the tab bar | Home / Install popup | jgT0R9WJzp |
| Search not found: AI strip at the top | Search / No result + AI | AyDE4RpVcA |
| Social posts (marketing, not in the app) | page "Social" | page EGNbH9c2aV |

Components added in Doop: `AiStrip`, `InstallPopup` (`AiPill` and `AiTip` exist but are superseded by the sparkle in the search bar); `Thumb` gained `jar` (cream jar with a plus) and `capsule` (capsule and tablet).

## Part A. Design sync

### A1. Icons: Care and Meds
- `Thumb.tsx`: add kinds `jar` and `capsule` (SVG paths copied from the Doop component, same stroke and accent fill rules as `tin`, `bottle`).
- `Thumb.tsx` `kind` type gains the two values; `ProductCard` and the Home category row use them.
- `HomeScreen.tsx`: Care uses `jar` (was `tube`), Meds uses `capsule` (was `sachet`).
- Product kind mapping (where `kind` is derived from category): cosmetics, skin care and toiletries map to `jar`; medicines map to `capsule`. Keep `tube` for toothpaste and `sachet` for sachets.

### A2. Home hero photo
- Add the optimised cut-out to `frontend/public/hero-shopper.webp` (467x640, about 27 KB, taken from the user's image 10; already trimmed to its content).
- `HomeScreen.tsx`: replace `<FoodArt />` with `<img src="/hero-shopper.webp" alt="" width=180 height=247>` positioned `absolute right-[-2px] bottom-0 w-[180px] pointer-events-none`; every other hero child gets `relative z-10` so the search bar sits in front of the basket.
- Hero copy: no "Hello, shopper" line. Title "Check it before you buy it", then the subtitle "Look up any food, drink or medicine in the NAFDAC registry, or scan the pack." under it. The subtitle is `max-w` about 190px (14px, weight 500) so it never runs under the figure; the headline stays at 175px.
- Delete `FoodArt.tsx` once nothing imports it. Precache the image in the service worker list (small, shows on first paint).
- Same hero on `Home / Loading` (skeleton state): the skeleton hero shares the component, so no extra code.
- `loading="eager"` and explicit width/height to avoid layout shift. Keep `alt=""` (decorative).

### A3. Install popup (done, verify)
- `InstallBanner.tsx` is now `position: fixed` above the tab bar (`bottom: calc(96px + safe-area)`), `z-40`.
- Slides up and fades in 1.8 s after Home opens; slides down on dismiss (350 ms) before the dismissal is stored. `motion-reduce` disables the transition.
- Removed from the flow under the alert banner; rendered once at the end of `HomeScreen`.
- Only shows when `canInstall` (Chrome `beforeinstallprompt`, or iOS Safari) and not dismissed or installed. iOS still opens the "Add to Home Screen" sheet.

### A4. AI visibility (limits spend, keeps the feature discoverable)
Placement decision: the AI sparkle sits inside the hero search bar, just left of the scan button (Doop `Home`, frame CsbsuRd3Cp). The alert banner now sits directly under the hero; there is no separate "Use AI" pill row any more.
- New `AiSearchButton` in `components/ai/` (the existing `AiSparkle` inside a 26px round `bg-surface-alt` button, `aria-label="Ask AI"`). It is absolutely positioned inside the search bar wrapper at `right: 60px`, vertically centred; the sparkle is scaled to about 0.62 so it stays quiet. Enlarge the real hit area to 44px with transparent padding even though the visible circle is 26px.
- `SearchBar.tsx` gets an optional `trailingAction` slot (or the wrapper in `HomeScreen.tsx` holds the button) so the placeholder text stops before the button: reserve right padding on the input, and keep the placeholder short ("Name or NAFDAC no.").
- Shown only when `ai.enabled` (usage check passed). Tapping it opens Search with the AI explainer state, not a paid lookup.
- One-time tip: small dark bubble, 11px bold text, "Can't find it? Ask AI", above the search bar and right-aligned (`right: 6px`) with its arrow over the sparkle, so it never covers the subtitle or the search text. Appears about 1.5 s after Home opens, closes itself after 5 s, and closes on any tap. Shown once per device (`localStorage` key `checkam_ai_tip_seen`, wrapped in try/catch). Fade and 4px slide, no animation under `prefers-reduced-motion`. Not focusable and `role="status"`, so it never traps focus or blocks taps.
- Search not-found: replace the large `AiEntryCard` with `AiStrip` at the top (under the search bar, above "No match found"): "Not in the registry? Use AI" and "N lookups left today". Its button opens the existing AI sheet. At 0 left it shows the limit text and is disabled.
- Remove the unused `AiPill` and `AiTip` ideas from the build (Doop components stay as design history); the Home pill row is not built.
- No automatic lookups; the user always taps.

### A5. Docs and design sync
- Update the Doop frame list and component list in `README.md` design notes if mentioned.

## Part B. OCR scanner fixes

Goal: stop the "still not working" cases without leaving the device. Root cause is unknown, so Part B starts by making failures visible, then fixes what the diagnostics show.

### B1. Diagnostics overlay (`?scandebug=1`)
- On the Scan screen, when the query flag is set, draw a small panel: engine state (loading, ready, error), camera resolution, frame size sent to OCR, last raw text, candidates found, which candidate matched the registry, time per read, reads in the current session.
- Capture the failure classes we cannot see today: engine/worker failed to load (CDN blocked or offline), camera opened at low resolution, number outside the aiming box, text read but no candidate, candidate but no registry match.
- Also log the same fields with `console.info('[scan]', ...)` so a phone can be debugged with remote devtools.

### B2. Decouple the scanner from the screen
- New `hooks/useScanner.ts` owning camera, loop, session and result events; `ScanScreen.tsx` becomes presentation only.
- `lib/ocr/engine.ts` defines `interface OcrEngine { init(): Promise<void>; read(img: ImageData | Blob): Promise<{ text: string; confidence: number }>; dispose(): void }` with the current Tesseract worker as `TesseractEngine`. A later engine (PaddleOCR via ONNX, still on-device) plugs in without touching the hook or screen.
- Engine startup becomes explicit: `init()` runs when the Scan tab opens (not on first frame), with a visible "Getting the scanner ready" state and a retry on failure.

### B3. Hybrid confirm UX
- Exact registry match seen twice in a row: continue automatically to the result (today's behaviour).
- Anything else (no registry match, one read only, low confidence): show an editable "Got it!" bubble with the best candidate prefilled and a "Check" button. The user can correct a character, then Check searches the registry as a normal lookup.
- No match is never shown as "Registry match" and a typed correction is never auto-submitted.

### B4. Capture quality
- Request `width: { ideal: 1920 }`, `height: { ideal: 1080 }`, `facingMode: environment`, and continuous focus where supported; apply `torch` toggle if the track reports the capability.
- Widen the OCR crop to the full aiming band plus margin and read a second, contrast-enhanced version when the first read has no candidate (curved or glossy packs).
- Pause reads while the frame is blurry (variance-of-Laplacian check) instead of wasting reads on motion blur.
- Keep the look-alike repair rules (O/0, I/1, B/8, S/5) and the two-read confirmation; do not loosen them.

### B5. Offline readiness
- Self-host the Tesseract worker, core and English traineddata under `public/tesseract/` (about 4 MB) and point `workerPath`, `corePath`, `langPath` at them, so the scanner works offline and on first run without the CDN. Keep the service-worker cache rule.
- Camera needs HTTPS or localhost: show a clear message when `getUserMedia` is unavailable (for example plain http on a phone during development).

### B6. Tests
- Unit tests for the confirm logic (exact match plus repeat auto-continues; everything else needs a tap), the engine interface (a fake engine), and the candidate extraction on new fixtures.
- Keep the existing benchmark (aimed crops and whole photos). Add the `?scandebug=1` states to a small component test.
- Manual phone test sheet in `frontend/test-fixtures/README.md`: 10 packs, curved and flat, good and poor light, offline and online; record read time and result.

## Build order

1. A1 icons, A2 hero image (visual, quick to review).
2. A4 AI sparkle in the search bar, one-time tip, and the not-found strip.
3. A3 verification of the install popup on a real phone and iOS sheet.
4. B1 diagnostics (needed before changing the scanner).
5. B2 decouple, then B5 self-hosted engine files, then B3 confirm UX.
6. B4 capture quality, using what the diagnostics show.
7. B6 tests and the phone test sheet.

## Acceptance
- Home matches `Home`, `Home / Loading` and `Home / Install popup` at 390 px wide, in light theme, with no horizontal scroll.
- Not-found Search matches `Search / No result + AI`; the AI card no longer pushes guidance down.
- Install popup slides up and down smoothly, never overlaps the tab bar, and respects reduced motion.
- Scanner: reads a real pack number from a phone camera online and offline, never labels a non-match as a registry match, and `?scandebug=1` explains any failure.
- `npx tsc --noEmit` and `npm test` pass; no backend files changed.

## Out of scope
- Backend, ETL, database, WhatsApp bot, PaddleOCR (only the seam for it), social posts (design only).
- No git add, commit or push as part of this work.
