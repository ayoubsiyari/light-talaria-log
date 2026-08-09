export const GOTO_STORAGE_KEY: string;
export const GOTO_STORAGE_VERSION: number;

export interface GotoItem {
  id: string | number;
  type?: 'datetime' | 'session' | 'price' | string;
  label?: string;
  time?: string;
  dateIso?: string;
  repeat?: string;
  pinned?: boolean;
  color?: string;
  price?: string | number;
  engineAction?: string;
}

export const GOTO_ENGINE_PRESETS: ReadonlyArray<GotoItem>;
export const DEFAULT_GOTO_PINNED: GotoItem[];
export const DEFAULT_GOTO_PRESETS: GotoItem[];

export function loadGotoState(): { pinned: GotoItem[]; presets: GotoItem[] };
export function saveGotoState(
  pinned: GotoItem[],
  presets: GotoItem[],
): void;
export function parseGotoTimeParts(timeStr: string | undefined): [number, number];
export function buildGotoTimestampMs(
  dateIso: string,
  timeStr: string | undefined,
): number | null;
export function defaultGotoDateIsoFromChart(): string;
export function isGotoDeadWeekendWallClock(
  y: number,
  mo: number,
  d: number,
  hh?: number,
  mm?: number,
): boolean;
export function resolveGotoTimestampMs(
  item: GotoItem,
  opts?: { fallbackDateIso?: string; playheadMs?: number },
): number | null;
export function getGotoDateBounds(): { min: string; max: string };
export function isGotoCalendarDayDisabled(dateIso: string): boolean;
export function executeGotoItem(
  item: GotoItem,
  opts?: { fallbackDateIso?: string },
): unknown;
export function presetToGotoItem(
  preset: GotoItem,
  fallbackDateIso?: string,
): GotoItem;
