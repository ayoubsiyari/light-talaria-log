---
name: Talaria-Log Landing
description: Product-truth door for Talaria-Log — official wing mark, chart screenshot, start free.
colors:
  ink: "hsl(0 0% 2%)"
  charcoal: "hsl(0 0% 6%)"
  hairline: "hsl(0 0% 14%)"
  fog: "hsl(0 0% 58%)"
  bone: "hsl(0 0% 96%)"
  brand-blue: "#3090ff"
  brand-blue-deep: "#232cf4"
typography:
  display:
    fontFamily: "Blauer Nue, Exo 2, Helvetica Neue, sans-serif"
    fontSize: "clamp(2.25rem, 8vw, 4.5rem)"
    fontWeight: 600
    lineHeight: 0.95
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Blauer Nue, Exo 2, Helvetica Neue, sans-serif"
    fontSize: "clamp(1.875rem, 4vw, 3rem)"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Blauer Nue, Exo 2, Helvetica Neue, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Helvetica Now, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Helvetica Now, Helvetica Neue, Helvetica, Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.16em"
rounded:
  full: "9999px"
  2xl: "16px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  2xl: "64px"
components:
  button-primary:
    backgroundColor: "{colors.bone}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    padding: "14px 28px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bone}"
    rounded: "{rounded.full}"
    padding: "14px 28px"
    height: "44px"
  button-ghost:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bone}"
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    padding: "14px 28px"
    height: "44px"
  button-outline:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bone}"
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    padding: "10px 20px"
    height: "44px"
  button-cta:
    backgroundColor: "{colors.charcoal}"
    textColor: "{colors.bone}"
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    padding: "14px 32px"
    height: "44px"
  nav-pill:
    backgroundColor: "{colors.charcoal}"
    rounded: "{rounded.full}"
    padding: "8px"
  nav-link:
    textColor: "{colors.fog}"
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "44px"
  nav-link-active:
    backgroundColor: "{colors.hairline}"
    textColor: "{colors.bone}"
    rounded: "{rounded.full}"
    padding: "0 16px"
    height: "44px"
  card-shot:
    backgroundColor: "{colors.charcoal}"
    textColor: "{colors.bone}"
    rounded: "{rounded.2xl}"
  card-work:
    backgroundColor: "{colors.charcoal}"
    textColor: "{colors.bone}"
    typography: "{typography.title}"
    rounded: "{rounded.2xl}"
  card-journal:
    backgroundColor: "{colors.charcoal}"
    textColor: "{colors.bone}"
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    padding: "16px"
  card-surface:
    backgroundColor: "{colors.charcoal}"
    textColor: "{colors.bone}"
    rounded: "{rounded.2xl}"
---

# Design System: Talaria-Log Landing

## Overview

**Creative North Star: "The Chart Is the Door"**

Talaria-Log’s marketing surface is a product-truth editorial shell, not a SaaS feature grid and not the Hero UI chart chrome. The visitor arrives through a near-black load of the official wing mark, then meets the 160px mark and Talaria-Log wordmark beside a framed EUR/USD 1-minute chart screenshot, with Start free and See how it works. Selected work, journal, and product surfaces are real screens — replay, journal, orders, news, indicators, strategy — then a muted chart reprise in the footer.

This file is the landing visual world. Product chrome stays on Hero UI tokens and components recorded in `docs/DESIGN.md`. The two systems share a type pairing with V9 chrome (Helvetica Now / Neue UI + Blauer Nue / Exo 2) and the brand-blue stops, but they do not share radius language, layout, or token format. The product name on this door is **Talaria-Log**. The official mark is `/logo-07.png`. Helvetica Now / Helvetica Neue / Helvetica / Arial (UI and body) and Blauer Nue / Exo 2 (display, self-hosted) are user-pinned for this marketing surface.

**Key Characteristics:**
- Near-black HSL field (`--lp-*`) with bone type and fog secondary
- Brand-blue gradient (`#3090ff` → `#232cf4`) as 2px hover rings only
- Official three-bar wing mark plus Blauer Nue / Exo 2 wordmark
- Framed product screenshots from `/landing/shot-*.png` (16px radius, hairline)
- Floating top-center pill nav with Sign in
- Pill chrome for controls; 16px rectangles for product frames
- Semibold display for the name, section titles, accent verbs, and shot captions

## Colors

Achromatic near-black HSL, with a two-stop brand-blue gradient as the only hue.

### Primary
- **Brand Azure** (`brand-blue`): Light stop of the accent gradient (`--lp-grad-from`). Hover and `:focus-visible` ring around pills.
- **Brand Indigo** (`brand-blue-deep`): Dark stop (`--lp-grad-to`). Always paired with Brand Azure in a 90° (or reversed) linear gradient; never used as a flat fill.

### Neutral
- **Ink** (`ink`): Page field, overlay, inverted button hover fill (`--lp-bg`).
- **Charcoal** (`charcoal`): Frosted nav, journal rows, framed-shot grounds, footer CTA fill (`--lp-surface`).
- **Hairline** (`hairline`): 1px borders, nav dividers, active nav chip (`--lp-stroke`).
- **Fog** (`fog`): Secondary copy, nav rest, captions, footnotes (`--lp-muted`).
- **Bone** (`bone`): Primary type and solid CTA fill (`--lp-text` / `--lp-accent`).

### Named Rules
**The Two Worlds Rule.** Landing color lives in `--lp-*` HSL channels scoped to `.landing-page`. App chrome keeps Hero UI OKLCH tokens in `docs/DESIGN.md`. Do not paint marketing with product `--background` / `--accent`, and do not paint the chart shell with `--lp-*`.

**The Brand Line Rule.** The brand-blue gradient is chrome, not fill. It may outline a pill on hover and focus. It may not fill a hero slab, a card, or a section background.

## Typography

**Display Font:** Blauer Nue, with Exo 2 self-hosted (`@fontsource/exo-2` 400 / 600 / 700) and Helvetica Neue fallback
**Body Font:** Helvetica Now, with Helvetica Neue / Helvetica / Arial fallback — same stack as V9 chrome
**Label/Mono Font:** Helvetica Now (same as body; no distinct mono on this surface)

**Character:** Helvetica Now carries UI, body, nav, and buttons. Blauer Nue / Exo 2 enters as semibold, tight-tracked display: the product name, section titles, the cycling hero verb, work-card titles, and the nav wordmark. Display is never italic and never a serif.

### Hierarchy
- **Display** (600, `clamp(2.25rem, 8vw, 4.5rem)`, line-height 0.95): Hero wordmark “Talaria-Log”.
- **Headline** (600, `clamp(1.875rem, 4vw, 3rem)`, line-height 1.25): Section titles (“Chart, replay, backtest”, “Trades, written down”, “How it works”). Footer CTA heading sits a step smaller (`1.5rem`–`2.25rem`) in the same face.
- **Title** (600, `1.125rem`–`1.25rem`): Product-shot titles on work cards; cycling hero verb (`replay` / `backtest` / `journal` / `chart`); nav wordmark at `0.875rem`.
- **Body** (400 Helvetica Now, `0.875rem`–`1.125rem`, line-height 1.5): Hero supporting copy, section subtext (`max-w-md` / `max-w-xl`), journal notes, button labels (`0.875rem`).
- **Label** (400 Helvetica Now, `0.75rem`): Footnotes, shot captions, journal meta (uppercase, `0.16em` tracking). Nav links are the same family at `0.75rem`–`0.875rem`, sentence case, no tracking.

### Named Rules
**The Pinned Pair Rule.** Helvetica Now / Helvetica Neue (UI, body) and Blauer Nue / Exo 2 (display) are user-pinned and match V9 chrome. Do not restore Inter, Instrument Serif, or a third marketing face.

**The Semibold Display Rule.** Display type is roman 600 with tight tracking. One accent word inside a Helvetica line may switch to Blauer Nue / Exo 2 semibold. Body paragraphs stay Helvetica roman. Do not italicize the name, titles, or verbs.

## Layout

Single-column editorial scroll. Content columns cap at 1200px with padding 24 / 40 / 64px (`px-6`, `md:px-10`, `lg:px-16`). The first viewport is a two-column split on `lg` (`0.85fr` copy / `1.15fr` chart shot, 40–48px gap), stacked and centered below that; extra top padding clears the floating nav (`pt-24` / `md:pt-28`). Selected work is a 12-column bento (7/5 then 5/7) with 20–24px gaps. Journal is a framed screenshot then a vertical stack of pill rows (12px gaps). Product surfaces pin on `md+` as a two-column staggered gallery (`max-w-[1400px]`, 96–160px column gap) and collapse to a 2-column grid on small screens. Section vertical rhythm is 64–96px (`py-16` / `md:py-24`); work sits slightly tighter (`py-12` / `md:py-16`).

Breakpoints that actually change composition: `sm` (640px) for CTA row, journal pill, nav wordmark; `md` (768px) for bento, pinned surfaces, section padding; `lg` (1024px) for the hero split and 64px gutters. Interactive chrome keeps a 44px minimum hit target (`min-h-11`). Horizontal page overflow is clipped.

## Elevation & Depth

Depth is product atmosphere: framed screenshots on charcoal, a 25% chart image under a 70% ink scrim in the footer, and `backdrop-blur` on the nav. Surfaces are tonal (ink / charcoal / hairline), not stacked paper. Shadows are rare and dark.

### Shadow Vocabulary
- **Nav after scroll** (`box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`): Applied when `scrollY > 100`. Resting nav has no drop shadow.
- **Hero shot** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.4), 0 4px 6px -4px rgb(0 0 0 / 0.4)`): Ambient dark drop under the first-viewport chart frame.
- **Surface tile** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.3), 0 4px 6px -4px rgb(0 0 0 / 0.3)`): Ambient dark drop under rotated product-surface frames.

### Named Rules
**The Atmosphere Rule.** Default depth is framed shots, scrim, and hairline — not offset card shadows. A drop shadow is a response (scrolled nav) or a shot-frame exception, never a rest state for journal rows.

## Shapes

Chrome is a pill: nav, buttons, Sign in, journal rows at `sm+`. Product imagery uses 16px rectangles (`rounded-2xl`) — hero chart, work bento, journal screenshot, surface tiles, lightbox-adjacent frames. Hairlines are 1px `hairline` (or `white/10` on the frosted nav). The ghost hero CTA uses a 2px hairline stroke, still in the same color. Nav dividers are 1×20px caps. Surface tiles carry a slight rotation (−5° to 6°); nothing else is skewed. The wing mark is the official PNG, not a letterform disc.

### Named Rules
**The Pill Chrome Rule.** Interactive chrome is `rounded-full`. Product photographs sit in 16px rounded rectangles. Do not square off buttons or nav, and do not invent a monogram disc in place of `/logo-07.png`.

**The Product Shot Rule.** Imagery is real Talaria-Log screens from `/landing/shot-*.png` (chart, journal, order, news, indicators, strategy). Do not restore HLS video, stock photography, or illustration as the hero or work tiles.

## Components

Pills with a brand-blue halo on hover. Minimum height 44px. Hover scale `1.05` over 300ms; the gradient ring sits 2px outside the inner fill.

### Buttons
- **Shape:** Fully rounded pill (`9999px`), inner fill inset from a 2px brand-blue ring that appears on hover and `:focus-visible`.
- **Primary:** Bone fill, ink text, 14px / 28px padding (“Start free”). Hover inverts to ink fill and bone text; the brand ring lights up.
- **Ghost:** Ink fill, 2px hairline border, bone text (“See how it works”). Hover drops the border (transparent) as the brand ring takes over.
- **Outline:** 1px hairline, ink fill, 10px / 20px padding (“Open a session”, “Open journal”). Same ring behavior; used as a section action.
- **CTA:** Charcoal fill, bone text, 14px / 32px padding. Footer “Start free” uses this quieter fill over the chart scrim.

### Cards / Containers
- **Product shot:** 16px radius, 1px hairline, charcoal ground, screenshot full-bleed (`object-cover` / `object-top` or `object-left` on the hero chart). Hero shot carries the heavier dark drop.
- **Work bento:** Same 16px frame. Title in semibold display over a bottom ink gradient (`from-black/85`). Body in 12–14px fog. Whole tile is the hit target.
- **Journal row:** Charcoal at 30% opacity, 1px hairline, 16px padding; 40px radius when stacked, full pill from `sm` up. 64–80px circular instrument chip. Hover raises fill to solid charcoal. Meta is 12px uppercase fog with 0.16em tracking.
- **Surface tile:** 16px radius, 1px hairline, 4:3 screenshot, caption in 12–14px bone, dark ambient shadow, slight rotation. Desktop max width 280–320px.

### Navigation
- **Style:** Fixed top-center floating pill — charcoal, `backdrop-blur(12px)`, 1px `white/10` border, 8px padding. Official wing mark (32×32) plus “Talaria-Log” in 14px semibold display (wordmark hidden below `sm`). 1px hairline dividers hide below `sm`.
- **Links:** Sentence-case Helvetica Now, 12–14px, 44px tall pills. Rest is fog; active and hover use hairline at 50% with bone text. Horizontal scroll allowed inside the cluster.
- **Sign in:** Frosted charcoal pill with the same brand-blue hover ring as CTAs.
- **Mobile:** Same pill, tighter link padding (`12px`), full-width capped by `max-w-full`, still top-center — not a bottom tab bar.

### Signature: Loading overlay
Full-viewport ink. Centered official wing mark (112–160px). Fades out in 400ms (`cubic-bezier(0.25, 0.1, 0.25, 1)`). Honors `prefers-reduced-motion` (200ms dismiss, no entrance motion).

### Signature: Gradient hover ring
Shared wrapper for landing CTAs. Outer `group` is `rounded-full`; an absolutely positioned brand-blue gradient sits at `inset: -2px` and ramps from 0 to 100% opacity on hover/focus. Inner fill is passed per variant. Do not use Hero UI `Button` on this surface.

### Signature: Brand mark
Official three-bar wing at `/logo-07.png`. Hero 160px (112 / 144 / 160px across breakpoints); nav 32px; footer 80–96px; load 112–160px. Raster is the default. Do not draw the mark onto the chart canvas.

## Do's and Don'ts

### Do:
- **Do** scope landing styles to `.landing-page` / `.landing-overlay` and the `--lp-*` tokens.
- **Do** set display type in Blauer Nue / Exo 2 semibold, and keep body, UI, and buttons in Helvetica Now / Helvetica Neue.
- **Do** use the brand-blue gradient only as a 2px hover/focus ring.
- **Do** lead with `/logo-07.png` and a framed `/landing/shot-*.png` product screenshot.
- **Do** keep chrome `rounded-full`, product frames at 16px, and hit targets at least 44px.
- **Do** cap reading copy around `max-w-md` / `max-w-xl` and the page column at 1200px.
- **Do** respect `prefers-reduced-motion` on load, role cycle, hero reveal, and surface parallax.

### Don't:
- **Don't** mix this world with Hero UI components or OKLCH product tokens on the marketing page.
- **Don't** fill a section, card, or hero with the brand-blue gradient.
- **Don't** restore Inter, Instrument Serif, a TL monogram, or HLS video.
- **Don't** set body paragraphs in the display face, or italicize display type.
- **Don't** square off nav or buttons, or replace the official PNG with a letterform disc.
- **Don't** load the full dataset or live chart engine into this door — screenshots are the product truth here.
- **Don't** add a second chromatic accent. Bone, fog, and brand-blue are the voice.
