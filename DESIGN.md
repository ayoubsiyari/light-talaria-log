---
name: Talaria-Log Landing
description: Dark editorial door for Talaria-Log — replay, backtest, journal, viewport chart.
colors:
  ink: "hsl(0 0% 4%)"
  charcoal: "hsl(0 0% 8%)"
  hairline: "hsl(0 0% 12%)"
  fog: "hsl(0 0% 53%)"
  bone: "hsl(0 0% 96%)"
  steel-mist: "#89aacc"
  steel-deep: "#4e85bf"
typography:
  display:
    fontFamily: "Instrument Serif, ui-serif, Georgia, serif"
    fontSize: "clamp(3rem, 10vw, 8rem)"
    fontWeight: 400
    lineHeight: 0.9
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.875rem, 4vw, 3rem)"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Instrument Serif, ui-serif, Georgia, serif"
    fontSize: "clamp(1.125rem, 2vw, 1.25rem)"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.2em"
rounded:
  full: "9999px"
  3xl: "24px"
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
  button-email:
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
  card-bento:
    backgroundColor: "{colors.charcoal}"
    textColor: "{colors.bone}"
    typography: "{typography.title}"
    rounded: "{rounded.3xl}"
  card-journal:
    backgroundColor: "{colors.charcoal}"
    textColor: "{colors.bone}"
    typography: "{typography.body}"
    rounded: "{rounded.full}"
    padding: "16px"
  card-explore:
    backgroundColor: "{colors.charcoal}"
    rounded: "{rounded.2xl}"
---

# Design System: Talaria-Log Landing

## Overview

**Creative North Star: "The Dark Editorial Door"**

Talaria-Log’s marketing surface is a dark editorial portfolio, not a SaaS feature grid and not the Hero UI chart shell. The visitor arrives through a 000–100 load on near-black, meets the italic serif name over muted full-bleed video, and scrolls selected work, journal, and explorations before a reprise of that atmosphere in the footer. Chrome is floating, pill-shaped, and hairline-framed; the only chromatic voice is a steel-blue gradient used as a halo, never as a filled marketing slab.

This file is the landing visual world. Product chrome stays on Hero UI tokens and components recorded in `docs/DESIGN.md`. The two systems do not share a type pairing, a radius language, or a color format. The product name on this door is **Talaria-Log**. Inter (body, headlines, UI) and italic Instrument Serif (display) are user-pinned for this marketing surface and are not to be swapped for a “more original” pairing.

**Key Characteristics:**
- Near-black HSL field (`--lp-*`) with bone type and fog secondary
- Steel-blue accent gradient as hover rings, TL mark halo, and load bar only
- Floating top-center pill nav with italic TL monogram
- Hairline strokes and frosted charcoal glass
- Rounded-full chrome; 24px bento cards; 16px exploration tiles
- Instrument Serif italic for the name, accent words, project titles, stats, and marquee

## Colors

Achromatic near-black HSL, with a two-stop steel gradient as the only hue.

### Primary
- **Steel Mist** (`#89aacc`): Light stop of the accent gradient (`--lp-grad-from`). Halo around the TL mark, hover ring on pills, and the loading bar fill.
- **Steel Deep** (`#4e85bf`): Dark stop (`--lp-grad-to`). Always paired with Steel Mist in a 90° (or reversed) linear gradient; never used as a flat fill.

### Neutral
- **Ink** (`hsl(0 0% 4%)`): Page field, video fade-out, inverted button hover fill (`--lp-bg`).
- **Charcoal** (`hsl(0 0% 8%)`): Frosted nav, journal rows, card grounds (`--lp-surface`).
- **Hairline** (`hsl(0 0% 12%)`): 1px borders, nav dividers, scroll track, active nav chip (`--lp-stroke`).
- **Fog** (`hsl(0 0% 53%)`): Secondary copy, nav rest, captions (`--lp-muted`).
- **Bone** (`hsl(0 0% 96%)`): Primary type and solid CTA fill (`--lp-text` / `--lp-accent`).

### Named Rules
**The Two Worlds Rule.** Landing color lives in `--lp-*` HSL channels scoped to `.landing-page`. App chrome keeps Hero UI OKLCH tokens in `docs/DESIGN.md`. Do not paint marketing with `--background` / `--accent`, and do not paint the chart shell with `--lp-*`.

**The Steel Line Rule.** The steel gradient is chrome, not fill. It may outline a pill, halo the TL mark, or draw the 3px load bar. It may not fill a hero slab, a card, or a section background.

## Typography

**Display Font:** Instrument Serif (Georgia fallback) — user-pinned
**Body Font:** Inter (ui-sans-serif, system-ui fallback) — user-pinned
**Label/Mono Font:** Inter (tabular-nums on the load counter only)

**Character:** Inter carries the editorial roman — headlines, body, nav, buttons. Instrument Serif enters as italic display: the name, one accent word inside an Inter headline, project titles, stats, and the footer marquee. The load counter is the same serif, roman and tabular.

### Hierarchy
- **Display** (400 italic, `clamp(3rem, 10vw, 8rem)`, line-height 0.9): Hero name “Talaria-Log”; load counter (roman, tabular-nums) at the same size ramp.
- **Headline** (400 Inter, `clamp(1.875rem, 4vw, 3rem)`, tight tracking): Section titles. One word inside the title switches to Instrument Serif italic.
- **Title** (400 italic serif, 1.125–1.25rem): Project names on bento cards; cycling role word in the hero line.
- **Body** (400 Inter, 0.875–1.125rem, line-height 1.5): Hero supporting copy, section subtext (`max-w-md`), journal titles, buttons (`0.875rem`).
- **Label** (400 Inter, 0.75rem): SCROLL, stats captions, journal meta. Nav links are the same family at 0.75–0.875rem, sentence case, no tracking.

### Named Rules
**The Pinned Pair Rule.** Inter + Instrument Serif are user-pinned on this marketing surface. Do not replace them with a display face, a geometric sans, or the Hero UI product font.

**The Italic Word Rule.** Instrument Serif is italic for names, accent words, project titles, stats, and the marquee. Body paragraphs stay Inter roman. The 000–100 counter is serif roman tabular-nums, not italic.

## Layout

Single-column editorial scroll. Content columns cap at 1200px with padding 24 / 40 / 64px (`px-6`, `md:px-10`, `lg:px-16`). The hero is a full-viewport centered stack (`max-w-4xl`, extra top padding under the floating nav). Selected work is a 12-column bento (7/5 then 5/7) with 20–24px gaps. Journal is a vertical stack of pill rows (12px gaps). Explorations pin on `md+` as a two-column staggered gallery (`max-w-[1400px]`, 96–160px column gap) and collapse to a 2-column grid on small screens. Stats are three centered figures. Section vertical rhythm is 64–96px (`py-16` / `md:py-24`); work sits slightly tighter (`py-12` / `md:py-16`).

Breakpoints that actually change composition: `sm` (640px) for CTA row, journal pill, nav labels; `md` (768px) for bento, pinned explorations, section padding; `lg` (1024px) for type and 64px gutters. Interactive chrome keeps a 44px minimum hit target (`min-h-11`). Horizontal page overflow is clipped.

## Elevation & Depth

Depth is atmosphere first: full-bleed muted HLS, black scrims (hero `20%`, footer `60%`, lightbox `80%`), a 192px ink fade at the video’s bottom, and `backdrop-blur` on the nav and email pill. Surfaces are tonal (ink / charcoal / hairline), not stacked paper. Shadows are rare.

### Shadow Vocabulary
- **Nav after scroll** (`box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)`): Applied when `scrollY > 100`. Resting nav has no drop shadow.
- **Exploration tile** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.3), 0 4px 6px -4px rgb(0 0 0 / 0.3)`): Ambient dark drop under rotated square images.
- **Load-bar glow** (`box-shadow: 0 0 8px color-mix(in srgb, var(--lp-grad-from) 35%, transparent)`): Steel bloom on the progress fill only.

### Named Rules
**The Atmosphere Rule.** Default depth is video, scrim, and hairline — not offset card shadows. A drop shadow is a response (scrolled nav) or a gallery-tile exception, never a card rest state for work or journal.

## Shapes

Chrome is a pill: nav, buttons, TL mark, journal rows at `sm+`, hover “View” chips. Imagery uses larger radii — bento work cards at 24px (`rounded-3xl`), exploration tiles and lightbox at 16px (`rounded-2xl`). Hairlines are 1px `hairline` (or `white/10` on the frosted nav). The ghost hero CTA uses a 2px hairline stroke, still in the same color. Nav dividers are 1×20px caps. Exploration tiles carry a slight rotation (−6° to 7°); nothing else is skewed.

### Named Rules
**The Pill Chrome Rule.** Interactive chrome is `rounded-full`. Photographs sit in 16–24px rounded rectangles. Do not square off buttons, nav, or the TL mark.

## Components

Pills with a steel halo on hover. Minimum height 44px. Hover scale `1.05` over 300ms; the gradient ring sits 2px outside the inner fill.

### Buttons
- **Shape:** Fully rounded pill (`9999px`), inner fill inset from a 2px steel ring that appears on hover and `:focus-visible`.
- **Primary:** Bone fill, ink text, 14px / 28px padding (“See Works”). Hover inverts to ink fill and bone text; the steel ring lights up.
- **Ghost:** Ink fill, 2px hairline border, bone text (“Reach out…”). Hover drops the border (transparent) as the steel ring takes over.
- **Outline:** 1px hairline, ink fill, 10px / 20px padding (“View all work →”). Same ring behavior; used as a section action on `md+`.
- **Email:** Charcoal fill, backdrop blur, bone text, 14px / 32px padding. Footer contact and nav “Say hi” share this frosted treatment.

### Cards / Containers
- **Bento work:** 24px radius, 1px hairline, charcoal ground, photograph full-bleed. 4px radial ink dot screen at 20% multiply. Title in italic serif over a bottom ink gradient. Hover/focus covers the card in ink at 70% with backdrop blur and a bone “View — *title*” pill.
- **Journal row:** Charcoal at 30% opacity, 1px hairline, 16px padding; 40px radius when stacked, full pill from `sm` up. 64–80px circular thumbnail. Hover raises fill to solid charcoal. Meta is 12px uppercase fog with 0.16em tracking.
- **Exploration tile:** 16px radius, 1px hairline, square aspect, dark ambient shadow, slight rotation. Opens a centered lightbox on ink/80%.

### Navigation
- **Style:** Fixed top-center floating pill — charcoal, `backdrop-blur(12px)`, 1px `white/10` border, 8px padding. TL mark (44×44) on the left: steel disc, 6px ink core, 14px italic serif “TL”; gradient reverses on hover and the core scales to 1.1. 1px hairline dividers hide below `sm`.
- **Links:** Sentence-case Inter, 12–14px, 44px tall pills. Rest is fog; active and hover use hairline at 50% with bone text. Horizontal scroll allowed inside the cluster.
- **Mobile:** Same pill, tighter link padding (`12px`), full-width capped by `max-w-full`, still top-center — not a bottom tab bar.

### Signature: Loading overlay
Full-viewport ink. Cycling italic serif word at center. Tabular serif counter, zero-padded to three digits, bottom-right. 3px hairline track at the bottom with a steel gradient fill that scales on X. Honors `prefers-reduced-motion` (snap to 100 and dismiss).

### Signature: Gradient hover ring
Shared wrapper for landing CTAs. Outer `group` is `rounded-full`; an absolutely positioned steel gradient sits at `inset: -2px` and ramps from 0 to 100% opacity on hover/focus. Inner fill is passed per variant. Do not use Hero UI `Button` on this surface.

## Do's and Don'ts

### Do:
- **Do** scope landing styles to `.landing-page` / `.landing-overlay` and the `--lp-*` tokens.
- **Do** set display type in Instrument Serif italic, and keep body, headlines, and UI in Inter.
- **Do** use the steel gradient only as a 2px hover ring, TL halo, or load bar.
- **Do** keep chrome `rounded-full` and hit targets at least 44px.
- **Do** cap reading copy around `max-w-md` and the page column at 1200px.
- **Do** respect `prefers-reduced-motion` on load, role cycle, gradient shift, and marquee.

### Don't:
- **Don't** mix this world with Hero UI components or OKLCH product tokens on the marketing page.
- **Don't** fill a section, card, or hero with the steel gradient.
- **Don't** set body paragraphs in Instrument Serif, or swap the pinned pairing.
- **Don't** square off nav, buttons, or the TL mark.
- **Don't** load the full dataset, a chart engine, or app chrome into this door — it is a portfolio arrival, not the trading shell.
- **Don't** add a second chromatic accent. Bone, fog, and steel are the voice.
