import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChromeIcon } from '@/v9/chromeIcons.jsx';

export type UtilityPanelId = 'objects' | 'news' | null;

interface TopBarUtilityPanelsProps {
  panel: UtilityPanelId;
  onClose: () => void;
}

const OBJECT_STUBS = [
  { id: '1', name: 'Trend Line', layer: 'Drawings' },
  { id: '2', name: 'Fib Retracement', layer: 'Drawings' },
  { id: '3', name: 'EMA 21', layer: 'Indicators' },
  { id: '4', name: 'Volume', layer: 'Indicators' },
];

const NEWS_STUBS = [
  { id: 'n1', title: 'FOMC Rate Decision', impact: 'High', when: 'Upcoming · Tue 19:00' },
  { id: 'n2', title: 'US CPI m/m', impact: 'High', when: 'Upcoming · Wed 13:30' },
  { id: 'n3', title: 'ECB Speaks', impact: 'Med', when: 'Previous · Mon 09:00' },
  { id: 'n4', title: 'Retail Sales', impact: 'Low', when: 'Previous · Fri 13:30' },
];

/**
 * Stub Objects + News right panels (Live grammar) opened from TopBar utils.
 */
export function TopBarUtilityPanels({ panel, onClose }: TopBarUtilityPanelsProps) {
  const [query, setQuery] = useState('');
  const [newsTab, setNewsTab] = useState<'upcoming' | 'previous'>('upcoming');
  const [impact, setImpact] = useState({ High: true, Med: true, Low: true });
  const [chartOnly, setChartOnly] = useState(true);

  useEffect(() => {
    if (!panel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel, onClose]);

  useEffect(() => {
    if (!panel) setQuery('');
  }, [panel]);

  if (!panel || typeof document === 'undefined') return null;

  const shell = (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[80] bg-black/40 sm:bg-transparent"
        aria-label="Close panel"
        onClick={onClose}
      />
      <aside
        data-v9-chrome="1"
        data-sdrop="1"
        {...(panel === 'objects'
          ? { 'data-objects-panel': '1' }
          : { 'data-news-panel': '1', 'data-news-v2': '1' })}
        className="fixed z-[90] right-0 top-12 bottom-0 w-[min(22rem,100vw)] flex flex-col border-l border-[color:var(--line)] bg-[color:var(--surface)] shadow-none"
        role="dialog"
        aria-label={panel === 'objects' ? 'Objects' : 'News'}
      >
        <div data-win-header="">
          <div data-win-icon="">
            <ChromeIcon
              n={panel === 'objects' ? 'layers' : 'news'}
              s={16}
              cl="var(--accent)"
            />
          </div>
          <span data-win-title="">{panel === 'objects' ? 'Objects' : 'Economic news'}</span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            data-brand-icon="1"
            className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 inline-flex items-center justify-center"
            onClick={onClose}
            aria-label="Close"
          >
            <ChromeIcon n="x" s={16} />
          </button>
        </div>

        <div className="px-2 py-1.5 shrink-0">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={panel === 'objects' ? 'Search objects' : 'Search events'}
            aria-label="Search"
            className="w-full h-9 min-h-11 sm:min-h-9 px-2.5 rounded-md text-[13px] outline-none border border-[color:var(--line)] bg-[color:var(--surface-sunken)]"
          />
        </div>

        {panel === 'objects' ? (
          <div className="tlr-scroll flex-1 min-h-0 overflow-y-auto px-1 pb-3">
            {OBJECT_STUBS.filter((o) =>
              !query.trim()
                ? true
                : o.name.toLowerCase().includes(query.trim().toLowerCase()),
            ).map((o) => (
              <div
                key={o.id}
                data-menu-row=""
                className="flex items-center gap-1 px-1.5 min-h-11 rounded-md"
              >
                <button
                  type="button"
                  className="flex-1 text-left text-[12px] min-h-11 sm:min-h-8"
                >
                  <span className="block font-medium">{o.name}</span>
                  <span className="block text-[10px] text-[color:var(--text-faint)]">
                    {o.layer}
                  </span>
                </button>
                <button type="button" data-brand-icon="1" className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8" title="Locate" aria-label="Locate">
                  <ChromeIcon n="crosshair" s={14} />
                </button>
                <button type="button" data-brand-icon="1" className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8" title="Settings" aria-label="Settings">
                  <ChromeIcon n="settings" s={14} />
                </button>
                <button type="button" data-brand-icon="1" className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8" title="Hide" aria-label="Hide">
                  <ChromeIcon n="eye" s={14} />
                </button>
                <button type="button" data-brand-icon="1" className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8" title="Delete" aria-label="Delete">
                  <ChromeIcon n="trash" s={14} />
                </button>
              </div>
            ))}
            <p className="px-2.5 pt-2 text-[10px] text-[color:var(--text-faint)]">
              Stub list — wire to object tree later
            </p>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center gap-1 px-2 pb-1.5 flex-wrap">
              <button
                type="button"
                role="switch"
                aria-checked={chartOnly}
                className="min-h-11 sm:min-h-8 px-2 rounded-md text-[11px] font-semibold border border-[color:var(--line)]"
                data-on={chartOnly ? '1' : undefined}
                onClick={() => setChartOnly((v) => !v)}
              >
                Chart symbol only
              </button>
              {(['High', 'Med', 'Low'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  data-on={impact[k] ? '1' : undefined}
                  className="min-h-11 sm:min-h-8 px-2 rounded-md text-[11px] font-semibold border border-[color:var(--line)]"
                  onClick={() => setImpact((p) => ({ ...p, [k]: !p[k] }))}
                >
                  {k}
                </button>
              ))}
            </div>
            <div className="flex gap-1 px-2 pb-1.5" role="tablist">
              {(['upcoming', 'previous'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={newsTab === t}
                  data-active={newsTab === t ? '1' : undefined}
                  className="min-h-11 sm:min-h-8 px-3 rounded-md text-[12px] font-semibold capitalize"
                  style={{
                    background: newsTab === t ? 'var(--accent-quiet)' : 'transparent',
                    color: newsTab === t ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                  onClick={() => setNewsTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="tlr-scroll flex-1 min-h-0 overflow-y-auto px-1 pb-3">
              {NEWS_STUBS.filter((n) => {
                const tabOk =
                  newsTab === 'upcoming'
                    ? n.when.startsWith('Upcoming')
                    : n.when.startsWith('Previous');
                const impactOk = impact[n.impact as 'High' | 'Med' | 'Low'];
                const q = query.trim().toLowerCase();
                const qOk = !q || n.title.toLowerCase().includes(q);
                return tabOk && impactOk && qOk;
              }).map((n) => (
                <div
                  key={n.id}
                  data-menu-row=""
                  className="px-2.5 py-2 min-h-11 rounded-md"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[9px] font-extrabold uppercase"
                      style={{
                        color:
                          n.impact === 'High'
                            ? 'var(--down)'
                            : n.impact === 'Med'
                              ? '#e0b040'
                              : 'var(--text-faint)',
                      }}
                    >
                      {n.impact}
                    </span>
                    <span className="text-[12px] font-medium flex-1 truncate">
                      {n.title}
                    </span>
                  </div>
                  <div className="text-[10px] text-[color:var(--text-faint)] mt-0.5">
                    {n.when}
                  </div>
                </div>
              ))}
              <p className="px-2.5 pt-2 text-[10px] text-[color:var(--text-faint)]">
                Stub feed — wire calendar later
              </p>
            </div>
          </div>
        )}
      </aside>
    </>
  );

  return createPortal(shell, document.body);
}
