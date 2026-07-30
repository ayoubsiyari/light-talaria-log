# Design System — Hero UI

All visual design for Talaria-Log follows [Hero UI](https://heroui.com) tokens and components.

---

## Stack

| Package | Purpose |
|---|---|
| `@heroui/react` | UI components (Button, Card, Progress, Alert, etc.) |
| `@heroui/styles` | CSS variables + Tailwind v4 theme |
| Tailwind CSS v4 | Utility classes |

---

## Theme

- **Default:** Dark mode
- **Activation:** `class="dark"` on `<html>` or `data-theme="dark"`
- **Color format:** OKLCH via CSS variables

---

## Semantic Tokens (use these, not hex codes)

### Layout & surfaces

| Token | Usage |
|---|---|
| `--background` | Page background |
| `--foreground` | Primary text |
| `--surface` | Chart panel, cards |
| `--overlay` | Modals, dropdowns |
| `--muted` | Secondary text, axis labels |
| `--border` | Panel borders |
| `--separator` | Dividers |

### Interactive

| Token | Usage |
|---|---|
| `--accent` | Primary buttons, focus rings, links |
| `--accent-foreground` | Text on accent backgrounds |
| `--focus` | Focus indicator |

### Status (chart candles)

| Token | Usage |
|---|---|
| `--success` | Bullish / up candle body & wick |
| `--success-foreground` | Text on success backgrounds |
| `--danger` | Bearish / down candle body & wick |
| `--danger-foreground` | Text on danger backgrounds |
| `--warning` | Warnings in UI |
| `--danger` | Errors in UI |

### Chart-specific (optional Pro-style palette)

Derived from accent for future indicator lines:

```css
--chart-1: oklch(from var(--accent) calc(l - 0.24) c h);
--chart-2: oklch(from var(--accent) calc(l - 0.12) c h);
--chart-3: var(--accent);
--chart-4: oklch(from var(--accent) calc(l + 0.12) c h);
--chart-5: oklch(from var(--accent) calc(l + 0.24) c h);
```

---

## Chart Color Mapping

Defined in `src/chart/chartTheme.ts`. Read CSS variables at runtime:

| Chart element | Hero UI source |
|---|---|
| Background | `--background` |
| Grid lines | `--border` (low opacity) |
| Crosshair | `--muted` |
| Up candle | `--success` |
| Down candle | `--danger` |
| Volume up | `--success` at 40% opacity |
| Volume down | `--danger` at 40% opacity |
| SMA / BB / RSI | `--accent` |
| EMA / MACD hist+ | `--success` |
| MACD signal / hist− | `--danger` / muted as needed |
| Text / scales | `--foreground` |

**Rule:** If you need a new chart color, map it to an existing Hero UI token first. Only add custom CSS variables in `src/index.css` if no token fits.

---

## Components to Use

| UI need | Hero UI component |
|---|---|
| Upload CSV | `Button` + hidden `<input type="file">` |
| Import progress | `Progress` |
| Error message | `Alert` (color="danger") |
| Panel wrapper | `Card` |
| Loading spinner | `Spinner` |
| Tooltip on chart controls | `Tooltip` |

Do **not** use raw HTML buttons styled manually.

---

## Typography & Spacing

- Use Hero UI defaults for font stack and `--radius`
- Chart toolbar spacing: Tailwind `gap-2`, `p-4`
- Minimum touch target: 44px (Hero UI button defaults)

---

## Light / Dark

Trading UI defaults to **dark**. Light mode support is optional for Phase 6+.

When adding light mode:
- Chart theme must re-read CSS variables on theme switch
- Call `chart.applyOptions()` with updated colors from `chartTheme.ts`

---

## Theme Builder

To customize brand colors: [Hero UI Theme Builder](https://heroui.com/themes)

Export CSS and merge into `src/index.css` under `@layer base`.
