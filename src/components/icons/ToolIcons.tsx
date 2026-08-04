/**
 * Toolbar / chrome icons — SVG paths copied from TalariaV8b `I` renderer.
 * Color via `currentColor`; size via className (default ~20px).
 */

type IconProps = { className?: string };

/** Display size on the drawing rail. Override in menus. */
const base = 'w-5 h-5 shrink-0';

const MATERIAL = '0 -960 960 960';

function Mat({ className = base, d }: IconProps & { d: string }) {
  return (
    <svg className={className} viewBox={MATERIAL} fill="currentColor" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** Cursor group — V8b `crosshair`. */
export function IconCursor({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <line x1="12" y1="2" x2="12" y2="9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="14.5" x2="12" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="2" y1="12" x2="9.5" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="14.5" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** Lines group — V8b `trendline`. */
export function IconTrendLine({ className = base }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 17 17"
      fill="none"
      aria-hidden
      style={{ flexShrink: 0, display: 'block' }}
    >
      <line x1="2" y1="15" x2="15" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="2" cy="15" r="2" fill="currentColor" />
      <circle cx="15" cy="2" r="2" fill="currentColor" />
    </svg>
  );
}

/** Fibonacci — V8b `fib`. */
export function IconFib({ className = base }: IconProps) {
  return (
    <Mat
      className={className}
      d="M80-180v-60h800v60H80Zm0-175v-60h800v60H80Zm0-160v-60h800v60H80Zm0-205v-60h800v60H80Z"
    />
  );
}

/** Shapes — V8b `rect`. */
export function IconShapes({ className = base }: IconProps) {
  return (
    <Mat
      className={className}
      d="M80-160v-640h800v640H80Zm80-80h640v-480H160v480Zm0 0v-480 480Z"
    />
  );
}

/** Text — V8b `text`. */
export function IconText({ className = base }: IconProps) {
  return (
    <Mat
      className={className}
      d="M280-160v-520H80v-120h520v120H400v520H280Zm360 0v-320H520v-120h360v120H760v320H640Z"
    />
  );
}

/** Patterns — V8b `wave`. */
export function IconPattern({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2,16 L5,8 L8,14 L11,5 L14,12 L17,4 L20,10 L22,8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Measure / range — V8b `measure`. */
export function IconMeasure({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <g transform="rotate(45 12 12)">
        <rect x="2" y="9" width="20" height="6" rx="1" stroke="currentColor" strokeWidth="1.4" />
        <line x1="12" y1="9" x2="12" y2="13.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="7" y1="9" x2="7" y2="12.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <line x1="17" y1="9" x2="17" y2="12.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <line x1="4.5" y1="9" x2="4.5" y2="12" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <line x1="9.5" y1="9" x2="9.5" y2="12" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <line x1="14.5" y1="9" x2="14.5" y2="12" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        <line x1="19.5" y1="9" x2="19.5" y2="12" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** Zoom — V8b `search` (closest magnifier). */
export function IconZoom({ className = base }: IconProps) {
  return (
    <Mat
      className={className}
      d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"
    />
  );
}

/** Magnet — V8b `magnet`. */
export function IconMagnet({ className = base }: IconProps) {
  return (
    <Mat
      className={className}
      d="M480-80q-117 0-198.5-81.5T200-360v-400h160v400q0 50 35 85t85 35q50 0 85-35t35-85v-400h160v400q0 117-81.5 198.5T480-80ZM360-840v240h-80v-240h80Zm160 0v240h-80v-240h80Z"
    />
  );
}

/** Trash — V8b `trash`. */
export function IconTrash({ className = base }: IconProps) {
  return (
    <Mat
      className={className}
      d="M200-120v-600h-40v-80h200v-40h240v40h200v80h-40v600H200Zm80-80h400v-520H280v520Zm80-80h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"
    />
  );
}

/** Eye — V8b `eye`. */
export function IconEye({ className = base }: IconProps) {
  return (
    <Mat
      className={className}
      d="M607.5-372.5Q660-425 660-500t-52.5-127.5Q555-680 480-680t-127.5 52.5Q300-575 300-500t52.5 127.5Q405-320 480-320t127.5-52.5Zm-204-51Q372-455 372-500t31.5-76.5Q435-608 480-608t76.5 31.5Q588-545 588-500t-31.5 76.5Q525-392 480-392t-76.5-31.5ZM480-200q-146 0-266-81.5T40-500q54-137 174-218.5T480-800q146 0 266 81.5T920-500q-54 137-174 218.5T480-200Zm207.5-139.5Q782-399 832-500q-50-101-144.5-160.5T480-720q-113 0-207.5 59.5T128-500q50 101 144.5 160.5T480-280q113 0 207.5-59.5Z"
    />
  );
}

/** Lock — V8b `lock`. */
export function IconLock({ className = base }: IconProps) {
  return (
    <Mat
      className={className}
      d="M160-80v-560h120v-80q0-83 58.5-141.5T480-920q83 0 141.5 58.5T680-720v80h120v560H160Zm80-80h480v-400H240v400Zm296.5-143.5Q560-327 560-360t-23.5-56.5Q513-440 480-440t-56.5 23.5Q400-393 400-360t23.5 56.5Q447-280 480-280t56.5-23.5ZM360-640h240v-80q0-50-35-85t-85-35q-50 0-85 35t-35 85v80ZM240-160v-400 400Z"
    />
  );
}

/** Candles — V8b `candle`. */
export function IconCandles({ className = base }: IconProps) {
  return (
    <Mat
      className={className}
      d="M240-800h80v80h60v400h-60v100h-80v-100h-60v-400h60v-80ZM640-700h80v80h60v400h-60v100h-80v-100h-60v-400h60v-80Z"
    />
  );
}

/** Indicators — V8b `indicator`. */
export function IconIndicators({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox={MATERIAL} aria-hidden>
      <path d="M140-420h120v260h-120ZM390-560h120v400h-120ZM640-760h120v600h-120Z" fill="currentColor" />
      <polyline
        points="200,-420 450,-560 700,-760"
        fill="none"
        stroke="currentColor"
        strokeWidth="58"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="200" cy="-420" r="62" fill="currentColor" />
      <circle cx="450" cy="-560" r="62" fill="currentColor" />
      <circle cx="700" cy="-760" r="62" fill="currentColor" />
    </svg>
  );
}

/** Play — V8b `play`. */
export function IconPlay({ className = base }: IconProps) {
  return <Mat className={className} d="M320-200v-560l440 280-440 280Z" />;
}

/** Pause — V8b `pause`. */
export function IconPause({ className = base }: IconProps) {
  return <Mat className={className} d="M560-200v-560h160v560H560Zm-280 0v-560h160v560H280Z" />;
}

/** Step back — V8b `stepBack` + bar (composed like V8b skipBack feel). */
export function IconStepBack({ className = base }: IconProps) {
  return (
    <Mat
      className={className}
      d="M220-240v-480h80v480h-80Zm520 0L380-480l360-240v480Zm-80-240Zm0 90v-180l-136 90 136 90Z"
    />
  );
}

/** Step forward — V8b `stepFwd`. */
export function IconStepForward({ className = base }: IconProps) {
  return (
    <Mat
      className={className}
      d="M240-200v-560l400 280-400 280ZM700-200v-560h100v560H700Z"
    />
  );
}

/** Brush / draw — V8b `draw`. */
export function IconBrush({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="-20 -630 640 640" fill="currentColor" aria-hidden>
      <path d="M240-120q-45 0-89-22t-71-58q26 0 53-20.5t27-59.5q0-50 35-85t85-35q50 0 85 35t35 85q0 66-47 113t-113 47Zm0-80q33 0 56.5-23.5T320-280q0-17-11.5-28.5T280-320q-17 0-28.5 11.5T240-280q0 23-5.5 42T220-202q5 2 10 2h10Zm230-160L360-470l386-386 110 110-386 386Zm-190 80Z" />
    </svg>
  );
}

/** Pitchfork — V8b `pitchfork`. */
export function IconPitchfork({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="20" cy="4" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="20" cy="20" r="1.2" fill="currentColor" stroke="none" />
      <line x1="4" y1="12" x2="20" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="8" x2="20" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="16" x2="20" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Stay in drawing mode — V8b `edit` (pencil). */
export function IconStayDraw({ className = base }: IconProps) {
  return (
    <Mat
      className={className}
      d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l585-583 167 171-582 582H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z"
    />
  );
}

/** Eye off / hide — V8b `eyeHide`. */
export function IconEyeOff({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2 11 Q7 5 12 5 Q17 5 22 11 Q17 17 12 17 Q7 17 2 11Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="11" r="2.8" stroke="currentColor" strokeWidth="1.4" />
      <line x1="4" y1="19" x2="20" y2="3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** Object tree — V8b `tree` (stroke variant used on topbar). */
export function IconObjectTree({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <line x1="5" y1="3" x2="5" y2="21" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      <line x1="5" y1="6" x2="19" y2="6" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      <line x1="5" y1="12" x2="15" y2="12" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
      <line x1="5" y1="18" x2="11" y2="18" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
}

/** Channel — V8b `channel`. */
export function IconChannel({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <line x1="2" y1="21" x2="22" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="2" y1="11" x2="22" y2="3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/** Gann — V8b `gannBox`. */
export function IconGann({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="0.8" opacity="0.5" strokeLinecap="round" />
      <line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" strokeWidth="0.8" opacity="0.5" strokeLinecap="round" />
      <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="1" opacity="0.4" strokeLinecap="round" />
    </svg>
  );
}

/** Chevron — V8b `chevRight`. */
export function IconChevron({ className = base }: IconProps) {
  return (
    <Mat
      className={className}
      d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z"
    />
  );
}

/** Pencil — V8b `edit`. */
export function IconPencil({ className = base }: IconProps) {
  return (
    <Mat
      className={className}
      d="M200-200h57l391-391-57-57-391 391v57Zm-80 80v-170l585-583 167 171-582 582H120Zm640-584-56-56 56 56Zm-141 85-28-29 57 57-29-28Z"
    />
  );
}

/** Search — V8b `search`. */
export function IconSearch({ className = base }: IconProps) {
  return (
    <Mat
      className={className}
      d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Z"
    />
  );
}

/** Star — V8b `star` / `starFill`. */
export function IconStar({ className = base, filled = false }: IconProps & { filled?: boolean }) {
  const d =
    'm354-287 126-76 126 77-33-144 111-96-146-13-58-136-58 135-146 13 111 97-33 143ZM233-120l65-281L80-590l288-25 112-265 112 265 288 25-218 189 65 281-247-149-247 149Zm247-350Z';
  if (filled) {
    return <Mat className={className} d={d} />;
  }
  return (
    <svg className={className} viewBox={MATERIAL} fill="currentColor" aria-hidden>
      <path fillRule="evenodd" d={d} />
    </svg>
  );
}

/** Settings — V8b `settings`. */
export function IconSettings({ className = base }: IconProps) {
  return (
    <Mat
      className={className}
      d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm70-80h79l14-106q31-8 57.5-23.5T639-327l99 41 39-68-86-65q5-14 7-29.5t2-31.5q0-16-2-31.5t-7-29.5l86-65-39-68-99 42q-22-23-48.5-38.5T533-694l-13-106h-79l-14 106q-31 8-57.5 23.5T321-633l-99-41-39 68 86 64q-5 15-7 30t-2 32q0 16 2 31t7 30l-86 65 39 68 99-42q22 23 48.5 38.5T427-266l13 106Zm42-180q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Zm-2-140Z"
    />
  );
}

/** Emoji — V8b `emoji`. */
export function IconEmoji({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="10" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="1.2" fill="currentColor" stroke="none" />
      <path d="M8,14.5 Q12,18 16,14.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** Highlighter — V8b `brush`. */
export function IconHighlighter({ className = base }: IconProps) {
  return (
    <svg className={className} viewBox="-20 -630 640 640" fill="currentColor" aria-hidden>
      <path d="m544-400-52-52-52-52-200 200 104 104 200-200Zm-47-161 52 52 52 52 199-199-104-104-199 199ZM60-120l126-126-30-30v-56l257-257 216 216-257 257h-56l-30-30-26 26H60Zm353-469 283-283 216 216-283 283-216-216Z" />
    </svg>
  );
}
