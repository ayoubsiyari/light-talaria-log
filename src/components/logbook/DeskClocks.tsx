import { useEffect, useMemo, useState } from 'react';
import { readScopedOrLegacy, writeScoped } from '@/sync/storageScope';

const CLOCKS_KEY = 'desk.clocks';
const MAX_CLOCKS = 6;

const DESK_ZONES: readonly { id: string; label: string }[] = [
  { id: 'UTC', label: 'UTC' },
  { id: 'America/New_York', label: 'New York' },
  { id: 'America/Chicago', label: 'Chicago' },
  { id: 'America/Los_Angeles', label: 'Los Angeles' },
  { id: 'Europe/London', label: 'London' },
  { id: 'Europe/Berlin', label: 'Frankfurt' },
  { id: 'Europe/Zurich', label: 'Zurich' },
  { id: 'Asia/Dubai', label: 'Dubai' },
  { id: 'Asia/Kolkata', label: 'Mumbai' },
  { id: 'Asia/Singapore', label: 'Singapore' },
  { id: 'Asia/Hong_Kong', label: 'Hong Kong' },
  { id: 'Asia/Tokyo', label: 'Tokyo' },
  { id: 'Australia/Sydney', label: 'Sydney' },
];

const KNOWN = new Set(DESK_ZONES.map((z) => z.id));

function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function zoneLabel(id: string): string {
  return DESK_ZONES.find((z) => z.id === id)?.label ?? id.split('/').pop()?.replace(/_/g, ' ') ?? id;
}

function loadZones(): string[] {
  const raw = readScopedOrLegacy(CLOCKS_KEY, []);
  if (!raw) return [localZone()];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [localZone()];
    const ids = parsed.filter((z): z is string => typeof z === 'string' && z.length > 0);
    return ids.length > 0 ? ids.slice(0, MAX_CLOCKS) : [localZone()];
  } catch {
    return [localZone()];
  }
}

function saveZones(ids: string[]): void {
  try {
    writeScoped(CLOCKS_KEY, JSON.stringify(ids));
  } catch {
    /* ignore quota */
  }
}

interface ClockParts {
  hour: string;
  minute: string;
  second: string;
  weekday: string;
  day: string;
  month: string;
  offset: string;
}

function clockParts(now: Date, timeZone: string): ClockParts | null {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZoneName: 'shortOffset',
    }).formatToParts(now);
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? '';
    return {
      hour: get('hour'),
      minute: get('minute'),
      second: get('second'),
      weekday: get('weekday'),
      day: get('day'),
      month: get('month'),
      offset: get('timeZoneName'),
    };
  } catch {
    return null;
  }
}

export function DeskClocks() {
  const [now, setNow] = useState(() => new Date());
  const [zones, setZones] = useState<string[]>(loadZones);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    saveZones(zones);
  }, [zones]);

  const unused = useMemo(() => {
    const taken = new Set(zones);
    const local = localZone();
    const extras = KNOWN.has(local) ? [] : [{ id: local, label: 'Local' }];
    return [...extras, ...DESK_ZONES].filter((z) => !taken.has(z.id));
  }, [zones]);

  const add = (id: string) => {
    if (!id || zones.includes(id) || zones.length >= MAX_CLOCKS) return;
    setZones((cur) => [...cur, id]);
    setPicking(false);
  };

  const remove = (id: string) => {
    setZones((cur) => {
      const next = cur.filter((z) => z !== id);
      return next.length > 0 ? next : [localZone()];
    });
  };

  const promote = (id: string) => {
    setZones((cur) => [id, ...cur.filter((z) => z !== id)]);
  };

  const solo = zones.length === 1;
  const main = zones[0] ?? localZone();
  const rest = zones.slice(1);
  const face = clockParts(now, main);

  return (
    <article className={['jd-card jd-clocks', solo ? 'is-solo' : ''].join(' ')}>
      <div className="jd-card-head">
        <h2>Clocks</h2>
        {unused.length > 0 && zones.length < MAX_CLOCKS ? (
          <button
            type="button"
            className="jd-icon-btn"
            onClick={() => setPicking((v) => !v)}
            aria-label="Add a timezone"
            aria-expanded={picking}
          >
            <PlusIcon />
          </button>
        ) : null}
      </div>

      {picking ? (
        <label className="jd-clocks-pick">
          <span className="sr-only">Timezone</span>
          <select
            className="jd-field"
            defaultValue=""
            onChange={(e) => {
              add(e.target.value);
              e.currentTarget.value = '';
            }}
          >
            <option value="" disabled>
              Add a city
            </option>
            {unused.map((z) => (
              <option key={z.id} value={z.id}>
                {z.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="jd-clocks-face">
        {solo ? (
          <>
            <WallClock parts={face} label={zoneLabel(main)} />
            {face ? (
              <div className="jd-muted jd-clocks-meta">
                {zoneLabel(main)} · {face.weekday} {face.day} {face.month}
                {face.offset ? ` · ${face.offset}` : ''}
              </div>
            ) : (
              <div className="jd-clocks-city">{zoneLabel(main)}</div>
            )}
          </>
        ) : (
          <>
            <div className="jd-clocks-city">{zoneLabel(main)}</div>
            {face ? (
              <div className="jd-clocks-hms">
                <span>{face.hour}</span>
                <span className="jd-clocks-colon">:</span>
                <span>{face.minute}</span>
                <span className="jd-clocks-colon">:</span>
                <span>{face.second}</span>
              </div>
            ) : (
              <div className="jd-clocks-hms jd-muted">—</div>
            )}
            {face ? (
              <div className="jd-muted jd-clocks-meta">
                {face.weekday} {face.day} {face.month}
                {face.offset ? ` · ${face.offset}` : ''}
              </div>
            ) : null}
            <button type="button" className="jd-clocks-drop" onClick={() => remove(main)}>
              Remove
            </button>
          </>
        )}
      </div>

      {rest.length > 0 ? (
        <ul className="jd-clocks-list">
          {rest.map((id) => {
            const p = clockParts(now, id);
            return (
              <li key={id}>
                <button
                  type="button"
                  className="jd-clocks-row"
                  onClick={() => promote(id)}
                  aria-label={`Show ${zoneLabel(id)} as the main clock`}
                >
                  <span>{zoneLabel(id)}</span>
                  <span className="jd-clocks-row-time">
                    {p ? `${p.hour}:${p.minute}:${p.second}` : '—'}
                  </span>
                </button>
                <button
                  type="button"
                  className="jd-icon-btn"
                  onClick={() => remove(id)}
                  aria-label={`Remove ${zoneLabel(id)}`}
                >
                  <CloseIcon />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </article>
  );
}

function WallClock({ parts, label }: { parts: ClockParts | null; label: string }) {
  const hour = parts ? Number(parts.hour) : 0;
  const minute = parts ? Number(parts.minute) : 0;
  const second = parts ? Number(parts.second) : 0;
  const hourA = ((hour % 12) + minute / 60 + second / 3600) * 30;
  const minA = (minute + second / 60) * 6;
  const secA = second * 6;
  const spoken = parts
    ? `${label}, ${parts.hour}:${parts.minute}:${parts.second}`
    : `${label}, time unavailable`;

  return (
    <div className="jd-clocks-wall-wrap">
      <span className="sr-only">{spoken}</span>
      <svg className="jd-clocks-wall" viewBox="0 0 200 200" aria-hidden="true">
        <circle className="jd-clocks-wall-dial" cx="100" cy="100" r="94" />
        {Array.from({ length: 60 }, (_, i) => {
          const major = i % 5 === 0;
          return (
            <line
              key={i}
              className={major ? 'jd-clocks-wall-tick is-hour' : 'jd-clocks-wall-tick'}
              x1="100"
              y1={major ? 16 : 12}
              x2="100"
              y2={major ? 28 : 18}
              transform={`rotate(${i * 6} 100 100)`}
            />
          );
        })}
        <text className="jd-clocks-wall-n" x="100" y="48" textAnchor="middle">
          12
        </text>
        <text className="jd-clocks-wall-n" x="156" y="100" textAnchor="middle" dominantBaseline="middle">
          3
        </text>
        <text className="jd-clocks-wall-n" x="100" y="168" textAnchor="middle">
          6
        </text>
        <text className="jd-clocks-wall-n" x="44" y="100" textAnchor="middle" dominantBaseline="middle">
          9
        </text>
        <g transform={`rotate(${hourA} 100 100)`}>
          <line className="jd-clocks-wall-hour" x1="100" y1="108" x2="100" y2="58" />
        </g>
        <g transform={`rotate(${minA} 100 100)`}>
          <line className="jd-clocks-wall-min" x1="100" y1="112" x2="100" y2="32" />
        </g>
        <g transform={`rotate(${secA} 100 100)`}>
          <line className="jd-clocks-wall-sec" x1="100" y1="118" x2="100" y2="24" />
        </g>
        <circle className="jd-clocks-wall-cap" cx="100" cy="100" r="5" />
      </svg>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M9 4v10M4 9h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M5 5l8 8M13 5l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
