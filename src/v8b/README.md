# TalariaV8b — reference only

`TalariaV8b.jsx` is **not imported** by the running app.

Product UI is Hero AppShell pages:
- `#/app/dashboard` → `DashboardPage` + real `AnalyticsDashboard`
- `#/app/backtest` → `CreateSessionPage` (server datasets)
- `#/app/journal` → `JournalPage`
- `#/app/strategy` → `StrategyPage`
- `#/app/profile` → `ProfilePage`

Do not re-host this monolith from `App.tsx`. Extract features into those modules when needed.
