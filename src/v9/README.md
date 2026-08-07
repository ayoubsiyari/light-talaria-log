# V9 Chrome — design sources

Copied from `Talaria-log/chart v 1.4/talaria-design/src/` (Obsidian V9 chrome).

## Runtime

- CSS + `chromeTheme.js` / `chromeIcons.jsx` power the chart shell chrome.
- **`TalariaV8bLive.jsx` is reference only** — the app does **not** mount it.
- Chart engine stays in `src/chart/` (custom Canvas). Do not wire Live’s `window.chart`.

## Load order (CSS)

Match live entry:

1. `chrome-tokens.css`
2. `chrome-kit.css`
3. `chrome-rebuild.css`
4. `chrome-obsidian-surfaces.css`
5. `chrome-obsidian-shell.css`
6. `chrome-order-ticket.css`
7. `chrome-alert-modal.css`
8. `chrome-goto.css`
9. `chrome-trade-card.css`
10. `chrome-settings.css`

See `docs/V9-CHROME-DESIGN-SYSTEM.md`.
