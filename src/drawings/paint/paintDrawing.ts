import { getChartColors, type ChartColors } from '@/chart/chartTheme';
import type { PriceFormatter } from '@/chart/format';
import { priceToY } from '@/chart/scales';
import type { ChartBar } from '@/types/bar';
import type { Timeframe } from '@/types/ui';
import type { Drawing } from '../drawingStore';
import { isDrawingVisibleOnTf } from '../visibility';
import { applyFillStyle, applyStrokeStyle, extendModeToPaint, type DrawingStyle } from '../drawingStyle';
import {
  defaultFibLevelsFor,
  formatFibCoeff,
  resolveFibMeta,
  visibleFibLevels,
  type FibLevel,
} from '../fibLevels';
import {
  channelWidthHandleXY,
  isChannelTool,
} from '../channelHandles';
import { computeMeasureStats, measureStatsLines } from '../measureStats';
import {
  positionGeometry,
  positionPnlAtTarget,
  positionQty,
} from '../positionMath';
import { isRectLikeTool, rectEdgeMidpoints } from '../rectHandles';
import { asBool, asNumber } from '../toolSettings';
import { drawCalloutBubble } from './calloutBubble';
import { paintAxisBadges } from './axisBadges';
import {
  barIndexAtTime,
  clipToPlot,
  extendLine,
  fmtPrice,
  pointToXY,
  pointsToXY,
  type PaintCtx,
} from './coords';
import { pathFreehandCatmullRom } from './freehandPath';
import {
  drawArrowHead,
  drawHandles,
  drawTextLabel,
  fillPoly,
  strokeLine,
  strokePoly,
} from './primitives';

/** Handles drawn/hit for a drawing (sparse for brush; +edge mids for boxes). */
function handleXYForDrawing(
  d: Drawing,
  xy: Array<{ x: number; y: number }>,
  selected: boolean,
): Array<{ x: number; y: number }> {
  if ((d.type === 'brush' || d.type === 'highlighter') && xy.length > 2) {
    return [xy[0]!, xy[xy.length - 1]!];
  }
  // Position RR: handles on the right of each level line (entry / SL / TP).
  if (
    (d.type === 'longPosition' || d.type === 'shortPosition') &&
    xy.length >= 3
  ) {
    const entry = xy[0]!;
    const stop = xy[1]!;
    const target = xy[2]!;
    const right = Math.max(entry.x, stop.x, target.x) + 40;
    return [
      { x: right, y: entry.y },
      { x: right, y: stop.y },
      { x: right, y: target.y },
    ];
  }
  if (selected && isRectLikeTool(d.type) && xy.length >= 2) {
    const edges = rectEdgeMidpoints(xy[0]!.x, xy[0]!.y, xy[1]!.x, xy[1]!.y);
    return [...xy, ...edges.map((e) => ({ x: e.x, y: e.y }))];
  }
  if (selected && isChannelTool(d.type) && xy.length >= 3) {
    const wh = channelWidthHandleXY(
      xy[0]!,
      xy[1]!,
      xy[2]!,
      d.type === 'flatTopBottom',
    );
    return [...xy, wh];
  }
  return xy;
}

/** Multi-line measure stats card (TV-like). */
function drawMeasureStatsBox(
  pc: PaintCtx,
  cx: number,
  cy: number,
  stats: ReturnType<typeof computeMeasureStats>,
  digits: number,
  angleDeg: number | null,
  style: Drawing['style'],
): void {
  const { lines, direction } = measureStatsLines(stats, digits, angleDeg);
  const { ctx, colors } = pc;
  const fontSize = Math.min(style.fontSize, 12);
  const padX = 8;
  const padY = 6;
  const lineH = fontSize + 3;
  ctx.save();
  ctx.font = `600 ${fontSize}px sans-serif`;
  let maxW = 0;
  for (const line of lines) {
    maxW = Math.max(maxW, ctx.measureText(line).width);
  }
  const w = maxW + padX * 2;
  const h = lines.length * lineH + padY * 2 - 3;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const tint =
    direction > 0 ? colors.upColor : direction < 0 ? colors.downColor : colors.accent;
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = colors.labelBg;
  ctx.strokeStyle = tint;
  ctx.lineWidth = 1.25;
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 4);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  }
  ctx.globalAlpha = 1;
  // Accent bar on left
  ctx.fillStyle = tint;
  ctx.fillRect(x, y, 3, h);
  ctx.fillStyle = colors.text;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    ctx.fillStyle = i === 0 ? tint : colors.text;
    ctx.fillText(line, x + padX + 2, y + padY + i * lineH);
  });
  ctx.restore();
}

function yPrice(price: number, pc: PaintCtx): number {
  return priceToY(price, pc.priceScale, pc.plot);
}

/** Midpoint / price labels / end caps / optional angle — shared by line family. */
function paintLineDecorations(
  pc: PaintCtx,
  d: Drawing,
  xy: Array<{ x: number; y: number }>,
  style: DrawingStyle,
  opts: { showAngle?: boolean } = {},
): void {
  if (xy.length < 2 || !xy[0] || !xy[1]) return;
  const a = xy[0];
  const b = xy[1];
  if (style.showMidpoint) {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const { ctx } = pc;
    ctx.save();
    ctx.fillStyle = pc.colors.handleFill;
    ctx.strokeStyle = style.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(mx, my, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  if (style.showPriceLabels && d.points[0] && d.points[1]) {
    drawTextLabel(pc, a.x + 6, a.y - 10, d.points[0].price.toFixed(2), style);
    drawTextLabel(pc, b.x + 6, b.y - 10, d.points[1].price.toFixed(2), style);
  }
  if (style.leftEnd) {
    const { ctx } = pc;
    ctx.save();
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.arc(a.x, a.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (style.rightEnd) {
    const { ctx } = pc;
    ctx.save();
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (opts.showAngle && d.points[0] && d.points[1]) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const ang = ((Math.atan2(-dy, dx) * 180) / Math.PI).toFixed(1);
    drawTextLabel(pc, (a.x + b.x) / 2, (a.y + b.y) / 2 - 12, `${ang}°`, style);
  }
}

function paintShapeCenter(
  pc: PaintCtx,
  cx: number,
  cy: number,
  style: DrawingStyle,
): void {
  const { ctx } = pc;
  ctx.save();
  ctx.strokeStyle = style.color;
  ctx.fillStyle = pc.colors.handleFill;
  ctx.lineWidth = 1.25;
  ctx.globalAlpha = style.opacity;
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy);
  ctx.lineTo(cx + 5, cy);
  ctx.moveTo(cx, cy - 5);
  ctx.lineTo(cx, cy + 5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function levelStroke(
  base: DrawingStyle,
  lv: FibLevel,
): DrawingStyle {
  return {
    ...base,
    color: lv.color || base.color,
    lineStyle: lv.lineStyle || base.lineStyle,
  };
}

function paintFibLevels(
  pc: PaintCtx,
  x0: number,
  x1: number,
  price0: number,
  price1: number,
  style: Drawing['style'],
  opts: {
    levels: FibLevel[];
    extendLeft?: boolean;
    extendRight?: boolean;
    reverse?: boolean;
    showLabels?: boolean;
    showPrices?: boolean;
    showZones?: boolean;
    /** values | percent | both */
    labelMode?: 'values' | 'percent' | 'both';
  },
): void {
  const levels = visibleFibLevels(opts.levels);
  const reverse = opts.reverse ?? false;
  const labelMode = opts.labelMode ?? 'both';
  const showLabels =
    opts.showLabels !== false &&
    (labelMode === 'percent' || labelMode === 'both');
  const showPrices =
    (!!opts.showPrices || labelMode === 'values' || labelMode === 'both') &&
    labelMode !== 'percent';
  const showZones = opts.showZones !== false;
  const { ctx, plot } = pc;
  // Anchor order: coeff 0 @ price0, coeff 1 @ price1 (Reverse swaps).
  const base = reverse ? price1 : price0;
  const tip = reverse ? price0 : price1;
  const segL = Math.min(x0, x1);
  const segR = Math.max(x0, x1);
  const left = opts.extendLeft ? plot.left : segL;
  const right = opts.extendRight ? plot.left + plot.width : segR;
  const labelX = opts.extendRight && !opts.extendLeft ? right - 4 : left + 4;
  const labelAlign = opts.extendRight && !opts.extendLeft ? 'right' as const : 'left' as const;

  const priceAt = (coeff: number) => base + (tip - base) * coeff;

  // Zone fills between consecutive levels (Talaria/TV background).
  if (showZones && (style.fill || opts.showZones) && levels.length >= 2) {
    const sorted = [...levels].sort((a, b) => a.coeff - b.coeff);
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i]!;
      const b = sorted[i + 1]!;
      const y0 = yPrice(priceAt(a.coeff), pc);
      const y1 = yPrice(priceAt(b.coeff), pc);
      ctx.save();
      ctx.globalAlpha = (style.fillOpacity ?? 0.2) * style.opacity * 0.55;
      ctx.fillStyle = a.color || style.fillColor || style.color;
      ctx.fillRect(left, Math.min(y0, y1), Math.max(1, right - left), Math.abs(y1 - y0));
      ctx.restore();
    }
  }

  // Collision-aware Y stagger for labels on the same side.
  const labelSlots: Array<{ y: number; text: string; color: string }> = [];
  for (const lv of levels) {
    const price = priceAt(lv.coeff);
    const y = yPrice(price, pc);
    const ls = levelStroke(style, lv);
    applyStrokeStyle(ctx, ls);
    ctx.beginPath();
    ctx.moveTo(left, y + 0.5);
    ctx.lineTo(right, y + 0.5);
    ctx.stroke();
    if (showLabels || showPrices) {
      const parts: string[] = [];
      if (showLabels) parts.push(formatFibCoeff(lv.coeff));
      if (showPrices) parts.push(fmtPrice(pc, price));
      labelSlots.push({ y, text: parts.join('  '), color: ls.color });
    }
  }

  const fontSize = Math.max(10, style.fontSize || 11);
  const row = fontSize + 2;
  labelSlots.sort((a, b) => a.y - b.y);
  for (let i = 1; i < labelSlots.length; i++) {
    const prev = labelSlots[i - 1]!;
    const cur = labelSlots[i]!;
    if (cur.y - prev.y < row) cur.y = prev.y + row;
  }
  for (const slot of labelSlots) {
    drawTextLabel(
      pc,
      labelX,
      slot.y,
      slot.text,
      {
        ...style,
        color: slot.color,
        textColor: slot.color,
        textAlignH: labelAlign,
        fontSize,
      },
      false,
    );
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function paintPitchfork(
  pc: PaintCtx,
  pts: Array<{ x: number; y: number }>,
  style: Drawing['style'],
  kind: 'standard' | 'schiff' | 'modified' | 'inside',
  showMedian = true,
): void {
  if (pts.length < 3) return;
  let [a, b, c] = pts as [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
  ];
  if (kind === 'schiff') {
    a = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  } else if (kind === 'modified') {
    a = { x: (a.x + b.x) / 2, y: a.y };
  } else if (kind === 'inside') {
    a = { x: (a.x + b.x) / 2, y: (a.y + c.y) / 2 };
  }
  const mid = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
  const dx = mid.x - a.x;
  const dy = mid.y - a.y;
  if (showMedian) strokeLine(pc, a.x, a.y, mid.x, mid.y, style, 'ray');
  strokeLine(pc, b.x, b.y, b.x + dx, b.y + dy, style, 'ray');
  strokeLine(pc, c.x, c.y, c.x + dx, c.y + dy, style, 'ray');
}

function paintVolumeProfile(
  pc: PaintCtx,
  fromIdx: number,
  toIdx: number,
  style: Drawing['style'],
  anchorLeft: number,
  opts: { rows?: number; valueAreaPct?: number; developRight?: boolean } = {},
): void {
  const { bars, ctx, plot } = pc;
  const lo = Math.max(0, Math.min(fromIdx, toIdx));
  const hi = Math.min(bars.length - 1, Math.max(fromIdx, toIdx));
  if (hi <= lo) return;
  const bins = Math.max(8, Math.min(64, Math.round(opts.rows ?? 24)));
  const valueAreaPct = Math.max(50, Math.min(100, opts.valueAreaPct ?? 70));
  const developRight = opts.developRight !== false;
  let pMin = Infinity;
  let pMax = -Infinity;
  let maxVol = 0;
  let totalVol = 0;
  const vols = new Array<number>(bins).fill(0);
  for (let i = lo; i <= hi; i++) {
    const b = bars[i]!;
    pMin = Math.min(pMin, b.low);
    pMax = Math.max(pMax, b.high);
  }
  if (!(pMax > pMin)) return;
  for (let i = lo; i <= hi; i++) {
    const b = bars[i]!;
    const mid = (b.high + b.low) / 2;
    const bin = Math.min(bins - 1, Math.floor(((mid - pMin) / (pMax - pMin)) * bins));
    vols[bin]! += b.volume || 1;
    maxVol = Math.max(maxVol, vols[bin]!);
    totalVol += b.volume || 1;
  }
  // Value area: expand from POC until covering valueAreaPct of volume.
  let poc = 0;
  for (let i = 1; i < bins; i++) if (vols[i]! > vols[poc]!) poc = i;
  const target = totalVol * (valueAreaPct / 100);
  let covered = vols[poc]!;
  let vaLo = poc;
  let vaHi = poc;
  while (covered < target && (vaLo > 0 || vaHi < bins - 1)) {
    const up = vaHi < bins - 1 ? vols[vaHi + 1]! : -1;
    const down = vaLo > 0 ? vols[vaLo - 1]! : -1;
    if (up >= down) {
      vaHi++;
      covered += vols[vaHi]!;
    } else {
      vaLo--;
      covered += vols[vaLo]!;
    }
  }
  const maxW = plot.width * 0.25;
  const rightEdge = plot.left + plot.width;
  for (let i = 0; i < bins; i++) {
    const v = vols[i]! / maxVol;
    const price0 = pMin + ((pMax - pMin) * i) / bins;
    const price1 = pMin + ((pMax - pMin) * (i + 1)) / bins;
    const y0 = yPrice(price1, pc);
    const y1 = yPrice(price0, pc);
    const w = maxW * v;
    const inVA = i >= vaLo && i <= vaHi;
    ctx.globalAlpha = (inVA ? 0.55 : 0.28) * style.opacity;
    ctx.fillStyle = style.color;
    if (developRight) {
      ctx.fillRect(rightEdge - w, y0, w, Math.max(1, y1 - y0));
    } else {
      ctx.fillRect(anchorLeft, y0, w, Math.max(1, y1 - y0));
    }
  }
  ctx.globalAlpha = 1;
}

function paintAnchoredVwap(
  pc: PaintCtx,
  fromIdx: number,
  style: Drawing['style'],
  opts: { showBands?: boolean; bandMult?: number } = {},
): void {
  const { bars, ctx } = pc;
  if (fromIdx >= bars.length - 1) return;
  let cumPV = 0;
  let cumV = 0;
  let cumPV2 = 0;
  const path: Array<{ x: number; y: number; vwap: number; std: number }> = [];
  for (let i = fromIdx; i < bars.length; i++) {
    const b = bars[i]!;
    const typical = (b.high + b.low + b.close) / 3;
    const vol = b.volume || 1;
    cumPV += typical * vol;
    cumPV2 += typical * typical * vol;
    cumV += vol;
    const vwap = cumPV / cumV;
    const variance = Math.max(0, cumPV2 / cumV - vwap * vwap);
    const std = Math.sqrt(variance);
    const xy = pointToXY({ time: b.time, price: vwap }, pc);
    if (!xy) continue;
    path.push({ x: xy.x, y: xy.y, vwap, std });
  }
  if (path.length < 2) return;

  if (opts.showBands) {
    const mult = asNumber(opts.bandMult, 1);
    const strokeBand = (sign: 1 | -1) => {
      applyStrokeStyle(ctx, { ...style, opacity: style.opacity * 0.55, lineStyle: 'dashed' });
      ctx.beginPath();
      let started = false;
      for (const p of path) {
        const price = p.vwap + sign * mult * p.std;
        const y = yPrice(price, pc);
        if (!started) {
          ctx.moveTo(p.x, y);
          started = true;
        } else ctx.lineTo(p.x, y);
      }
      ctx.stroke();
    };
    strokeBand(1);
    strokeBand(-1);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  applyStrokeStyle(ctx, style);
  ctx.beginPath();
  ctx.moveTo(path[0]!.x, path[0]!.y);
  for (let i = 1; i < path.length; i++) ctx.lineTo(path[i]!.x, path[i]!.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

/** Paint a single drawing (committed or draft). */
export function paintDrawing(
  pc: PaintCtx,
  d: Drawing,
  opts: { selected?: boolean; showHandles?: boolean } = {},
): void {
  const style = d.style;
  const xy = pointsToXY(d.points, pc);
  const selected = !!opts.selected;
  const showHandles = opts.showHandles !== false;

  pc.ctx.save();
  clipToPlot(pc);

  switch (d.type) {
    case 'hline':
      if (xy[0]) {
        strokeLine(pc, pc.plot.left, xy[0].y, pc.plot.left + pc.plot.width, xy[0].y, style);
        if (style.showPriceLabels && d.points[0]) {
          drawTextLabel(
            pc,
            pc.plot.left + 6,
            xy[0].y - 10,
            d.points[0].price.toFixed(2),
            style,
          );
        }
      }
      break;
    case 'vline':
      if (xy[0]) {
        strokeLine(pc, xy[0].x, pc.plot.top, xy[0].x, pc.plot.top + pc.plot.height, style);
      }
      break;
    case 'crossLine':
      if (xy[0]) {
        strokeLine(pc, pc.plot.left, xy[0].y, pc.plot.left + pc.plot.width, xy[0].y, {
          ...style,
          lineStyle: 'dashed',
        });
        strokeLine(pc, xy[0].x, pc.plot.top, xy[0].x, pc.plot.top + pc.plot.height, {
          ...style,
          lineStyle: 'dashed',
        });
      }
      break;
    case 'trendLine':
    case 'infoLine':
    case 'trendAngle':
      if (xy.length >= 2) {
        const ext = extendModeToPaint(style.extend ?? 'none');
        strokeLine(pc, xy[0]!.x, xy[0]!.y, xy[1]!.x, xy[1]!.y, style, ext);
        const showAngle =
          asBool(d.meta?.showAngle, d.type === 'trendAngle' || d.type === 'infoLine') ||
          d.type === 'trendAngle';
        paintLineDecorations(pc, d, xy, style, { showAngle });
        if (d.type === 'infoLine' && d.points[0] && d.points[1] && !showAngle) {
          const dp = d.points[1].price - d.points[0].price;
          drawTextLabel(
            pc,
            (xy[0]!.x + xy[1]!.x) / 2,
            (xy[0]!.y + xy[1]!.y) / 2 - 12,
            `${dp >= 0 ? '+' : ''}${dp.toFixed(2)}`,
            style,
          );
        }
      }
      break;
    case 'ray':
    case 'horizontalRay':
      if (xy.length >= 2) {
        const ext = extendModeToPaint(style.extend ?? 'right');
        const mode = d.type === 'horizontalRay' ? 'ray' : ext === 'segment' ? 'ray' : ext;
        if (d.type === 'horizontalRay') {
          strokeLine(pc, xy[0]!.x, xy[0]!.y, xy[1]!.x, xy[0]!.y, style, 'ray');
        } else {
          strokeLine(pc, xy[0]!.x, xy[0]!.y, xy[1]!.x, xy[1]!.y, style, mode);
        }
        paintLineDecorations(pc, d, xy, style, {
          showAngle: asBool(d.meta?.showAngle, false),
        });
      }
      break;
    case 'extendedLine':
      if (xy.length >= 2) {
        const ext = extendModeToPaint(style.extend ?? 'both');
        strokeLine(
          pc,
          xy[0]!.x,
          xy[0]!.y,
          xy[1]!.x,
          xy[1]!.y,
          style,
          ext === 'segment' ? 'extended' : ext,
        );
        paintLineDecorations(pc, d, xy, style, {
          showAngle: asBool(d.meta?.showAngle, false),
        });
      }
      break;

    case 'parallelChannel':
    case 'flatTopBottom':
      if (xy.length >= 3) {
        const [a, b, c] = xy;
        const dx = b!.x - a!.x;
        const dy = d.type === 'flatTopBottom' ? 0 : b!.y - a!.y;
        const e1 = extendLine(a!.x, a!.y, b!.x, b!.y, pc.plot, 'extended');
        const e2 = extendLine(c!.x, c!.y, c!.x + dx, c!.y + dy, pc.plot, 'extended');
        // Fill the infinite band between rails (visible across the plot).
        fillPoly(
          pc,
          [
            { x: e1.x0, y: e1.y0 },
            { x: e1.x1, y: e1.y1 },
            { x: e2.x1, y: e2.y1 },
            { x: e2.x0, y: e2.y0 },
          ],
          style,
        );
        strokeLine(pc, a!.x, a!.y, b!.x, b!.y, style, 'extended');
        strokeLine(pc, c!.x, c!.y, c!.x + dx, c!.y + dy, style, 'extended');
        if (asBool(d.meta?.showMidline, true)) {
          const mx0 = (a!.x + c!.x) / 2;
          const my0 = (a!.y + c!.y) / 2;
          strokeLine(
            pc,
            mx0,
            my0,
            mx0 + dx,
            my0 + dy,
            { ...style, lineStyle: 'dashed', opacity: style.opacity * 0.85 },
            'extended',
          );
        }
      }
      break;
    case 'disjointChannel':
      if (xy.length >= 4) {
        strokeLine(pc, xy[0]!.x, xy[0]!.y, xy[1]!.x, xy[1]!.y, style, 'extended');
        strokeLine(pc, xy[2]!.x, xy[2]!.y, xy[3]!.x, xy[3]!.y, style, 'extended');
        if (asBool(d.meta?.showMidline, true)) {
          const m0 = {
            x: (xy[0]!.x + xy[2]!.x) / 2,
            y: (xy[0]!.y + xy[2]!.y) / 2,
          };
          const m1 = {
            x: (xy[1]!.x + xy[3]!.x) / 2,
            y: (xy[1]!.y + xy[3]!.y) / 2,
          };
          strokeLine(pc, m0.x, m0.y, m1.x, m1.y, {
            ...style,
            lineStyle: 'dashed',
            opacity: style.opacity * 0.85,
          }, 'extended');
        }
      }
      break;
    case 'regressionTrend':
      if (xy.length >= 2) {
        if (asBool(d.meta?.showMidline, true)) {
          strokeLine(pc, xy[0]!.x, xy[0]!.y, xy[1]!.x, xy[1]!.y, style, 'extended');
        }
        const midY = (xy[0]!.y + xy[1]!.y) / 2;
        const offset = Math.abs(xy[1]!.y - xy[0]!.y) * 0.25 + 20;
        strokeLine(pc, xy[0]!.x, midY - offset, xy[1]!.x, midY - offset, {
          ...style,
          lineStyle: 'dashed',
        }, 'extended');
        strokeLine(pc, xy[0]!.x, midY + offset, xy[1]!.x, midY + offset, {
          ...style,
          lineStyle: 'dashed',
        }, 'extended');
      }
      break;

    case 'pitchfork':
      paintPitchfork(pc, xy, style, 'standard', asBool(d.meta?.showMedian, true));
      break;
    case 'schiffPitchfork':
      paintPitchfork(pc, xy, style, 'schiff', asBool(d.meta?.showMedian, true));
      break;
    case 'modifiedSchiffPitchfork':
      paintPitchfork(pc, xy, style, 'modified', asBool(d.meta?.showMedian, true));
      break;
    case 'insidePitchfork':
      paintPitchfork(pc, xy, style, 'inside', asBool(d.meta?.showMedian, true));
      break;

    case 'fibRetracement':
    case 'fibExtension':
      if (xy.length >= 2 && d.points[0] && d.points[1]) {
        const p2 = d.points[2];
        const priceA = d.points[0].price;
        const priceB = p2 && d.type === 'fibExtension' ? p2.price : d.points[1].price;
        const fib = resolveFibMeta(d.type, d.meta);
        paintFibLevels(pc, xy[0]!.x, xy[1]!.x, priceA, priceB, style, {
          levels: fib.levels,
          extendLeft: fib.extendLeft,
          extendRight: fib.extendRight,
          reverse: fib.reverse,
          showLabels: fib.showLabels,
          showPrices: fib.showPrices,
          showZones: fib.showZones,
          labelMode: fib.labelMode,
        });
        strokeLine(pc, xy[0]!.x, xy[0]!.y, xy[1]!.x, xy[1]!.y, {
          ...style,
          lineStyle: 'dotted',
        });
      }
      break;
    case 'fibChannel':
      if (xy.length >= 3) {
        const fib = resolveFibMeta(d.type, d.meta);
        const mode =
          fib.extendLeft || fib.extendRight
            ? fib.extendLeft && fib.extendRight
              ? 'extended'
              : fib.extendRight
                ? 'ray'
                : 'rayLeft'
            : 'segment';
        strokeLine(pc, xy[0]!.x, xy[0]!.y, xy[1]!.x, xy[1]!.y, style, mode);
        const dx = xy[1]!.x - xy[0]!.x;
        const dy = xy[1]!.y - xy[0]!.y;
        for (const lv of visibleFibLevels(fib.levels)) {
          const ox = (xy[2]!.x - xy[0]!.x) * lv.coeff;
          const oy = (xy[2]!.y - xy[0]!.y) * lv.coeff;
          const ls = levelStroke(style, lv);
          strokeLine(
            pc,
            xy[0]!.x + ox,
            xy[0]!.y + oy,
            xy[0]!.x + ox + dx,
            xy[0]!.y + oy + dy,
            ls,
            mode,
          );
          if (fib.showLabels || fib.showPrices) {
            const parts: string[] = [];
            if (fib.showLabels) parts.push(formatFibCoeff(lv.coeff));
            drawTextLabel(
              pc,
              xy[0]!.x + ox + 4,
              xy[0]!.y + oy,
              parts.join('  ') || formatFibCoeff(lv.coeff),
              { ...ls, textColor: ls.color },
              false,
            );
          }
        }
      }
      break;
    case 'fibTimezone':
    case 'fibTrendTime':
    case 'cyclicLines':
      if (xy.length >= 2) {
        const fib = resolveFibMeta(d.type, d.meta);
        const x0 = xy[0]!.x;
        const span = Math.abs(xy[1]!.x - xy[0]!.x) || 40;
        const dir = Math.sign(xy[1]!.x - xy[0]!.x || 1);
        for (const lv of visibleFibLevels(fib.levels)) {
          const x = x0 + dir * span * lv.coeff;
          const ls = levelStroke(style, lv);
          strokeLine(pc, x, pc.plot.top, x, pc.plot.top + pc.plot.height, ls);
          if (fib.showLabels) {
            drawTextLabel(
              pc,
              x + 4,
              pc.plot.top + 14,
              formatFibCoeff(lv.coeff),
              { ...ls, textColor: ls.color },
              false,
            );
          }
        }
      }
      break;
    case 'fibSpeedFan':
    case 'fibFan':
    case 'gannFan':
      if (xy.length >= 2) {
        const fib = resolveFibMeta(d.type, d.meta);
        let levels = visibleFibLevels(fib.levels);
        if (levels.length === 0) {
          levels = defaultFibLevelsFor(d.type).filter((l) => l.visible);
        }
        for (const lv of levels) {
          const x1 = xy[0]!.x + (xy[1]!.x - xy[0]!.x);
          const y1 = xy[0]!.y + (xy[1]!.y - xy[0]!.y) * lv.coeff;
          const ls = levelStroke(style, lv);
          strokeLine(pc, xy[0]!.x, xy[0]!.y, x1, y1, ls, 'ray');
          if (fib.showLabels) {
            drawTextLabel(
              pc,
              x1,
              y1,
              formatFibCoeff(lv.coeff),
              { ...ls, textColor: ls.color },
              false,
            );
          }
        }
      }
      break;
    case 'fibCircles':
    case 'fibSpeedArcs':
    case 'fibSpiral':
    case 'fibWedge':
      if (xy.length >= 2) {
        const { ctx } = pc;
        const r0 = Math.hypot(xy[1]!.x - xy[0]!.x, xy[1]!.y - xy[0]!.y);
        const fib = resolveFibMeta(d.type, d.meta);
        for (const lv of visibleFibLevels(fib.levels)) {
          if (lv.coeff <= 0) continue;
          const ls = levelStroke(style, lv);
          applyStrokeStyle(ctx, ls);
          ctx.beginPath();
          if (d.type === 'fibSpeedArcs' || d.type === 'fibWedge') {
            ctx.arc(xy[0]!.x, xy[0]!.y, r0 * lv.coeff, Math.PI, Math.PI * 2);
          } else if (d.type === 'fibSpiral') {
            let px = xy[0]!.x;
            let py = xy[0]!.y;
            ctx.moveTo(px, py);
            const turns = Math.max(2, lv.coeff * 4);
            for (let t = 0; t < turns; t += 0.1) {
              const rad = (r0 * t) / turns;
              const ang = t * 0.7;
              px = xy[0]!.x + Math.cos(ang) * rad * lv.coeff;
              py = xy[0]!.y + Math.sin(ang) * rad * lv.coeff;
              ctx.lineTo(px, py);
            }
          } else {
            ctx.arc(xy[0]!.x, xy[0]!.y, r0 * lv.coeff, 0, Math.PI * 2);
          }
          ctx.stroke();
          if (fib.showLabels && d.type !== 'fibSpiral') {
            drawTextLabel(
              pc,
              xy[0]!.x + r0 * lv.coeff + 4,
              xy[0]!.y,
              formatFibCoeff(lv.coeff),
              { ...ls, textColor: ls.color },
              false,
            );
          }
        }
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      break;

    case 'gannBox':
    case 'gannSquare':
    case 'gannSquareFixed':
    case 'rectangle':
    case 'datePriceRange':
      if (xy.length >= 2) {
        const x = Math.min(xy[0]!.x, xy[1]!.x);
        const y = Math.min(xy[0]!.y, xy[1]!.y);
        const w = Math.abs(xy[1]!.x - xy[0]!.x);
        const h = Math.abs(xy[1]!.y - xy[0]!.y);
        fillPoly(
          pc,
          [
            { x, y },
            { x: x + w, y },
            { x: x + w, y: y + h },
            { x, y: y + h },
          ],
          style,
        );
        strokePoly(
          pc,
          [
            { x, y },
            { x: x + w, y },
            { x: x + w, y: y + h },
            { x, y: y + h },
          ],
          style,
          true,
        );
        if (d.type.startsWith('gann') && asBool(d.meta?.showFan, true)) {
          const { ctx } = pc;
          const subs = Math.max(2, Math.min(16, asNumber(d.meta?.subdivisions, 4)));
          applyStrokeStyle(ctx, { ...style, opacity: style.opacity * 0.5 });
          for (let i = 1; i < subs; i++) {
            ctx.beginPath();
            ctx.moveTo(x + (w * i) / subs, y);
            ctx.lineTo(x + (w * i) / subs, y + h);
            ctx.moveTo(x, y + (h * i) / subs);
            ctx.lineTo(x + w, y + (h * i) / subs);
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.moveTo(x, y + h);
          ctx.lineTo(x + w, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
        if (d.type === 'datePriceRange' && asBool(d.meta?.showStats, true) && d.points[0] && d.points[1]) {
          const stats = computeMeasureStats(
            d.points[0].time,
            d.points[0].price,
            d.points[1].time,
            d.points[1].price,
            pc.bars,
          );
          const digits = Math.abs(stats.deltaPrice) < 1 ? 5 : 2;
          let angle: number | null = null;
          if (asBool(d.meta?.showAngle, false)) {
            const adx = xy[1]!.x - xy[0]!.x;
            const ady = xy[1]!.y - xy[0]!.y;
            angle = (Math.atan2(-ady, adx) * 180) / Math.PI;
          }
          drawMeasureStatsBox(pc, x + w / 2, y + h / 2, stats, digits, angle, style);
        } else if (asBool(d.meta?.showCenter, false)) {
          paintShapeCenter(pc, x + w / 2, y + h / 2, style);
        }
      }
      break;
    case 'rotatedRectangle':
      if (xy.length >= 3) {
        const [a, b, c] = xy;
        const dx = b!.x - a!.x;
        const dy = b!.y - a!.y;
        const d4 = { x: c!.x - dx, y: c!.y - dy };
        fillPoly(pc, [a!, b!, c!, d4], style);
        strokePoly(pc, [a!, b!, c!, d4], style, true);
        if (asBool(d.meta?.showCenter, false)) {
          paintShapeCenter(
            pc,
            (a!.x + b!.x + c!.x + d4.x) / 4,
            (a!.y + b!.y + c!.y + d4.y) / 4,
            style,
          );
        }
      }
      break;
    case 'circle':
    case 'ellipse':
      if (xy.length >= 2) {
        const { ctx } = pc;
        const cx = (xy[0]!.x + xy[1]!.x) / 2;
        const cy = (xy[0]!.y + xy[1]!.y) / 2;
        const rx = Math.abs(xy[1]!.x - xy[0]!.x) / 2;
        const ry =
          d.type === 'circle'
            ? rx
            : Math.abs(xy[1]!.y - xy[0]!.y) / 2;
        if (style.fill) {
          ctx.beginPath();
          ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
          applyFillStyle(ctx, style);
          ctx.fill();
        }
        applyStrokeStyle(ctx, style);
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        if (asBool(d.meta?.showCenter, false)) paintShapeCenter(pc, cx, cy, style);
      }
      break;
    case 'triangle':
      if (xy.length >= 3) {
        fillPoly(pc, xy.slice(0, 3), style);
        strokePoly(pc, xy.slice(0, 3), style, true);
        if (asBool(d.meta?.showCenter, false)) {
          paintShapeCenter(
            pc,
            (xy[0]!.x + xy[1]!.x + xy[2]!.x) / 3,
            (xy[0]!.y + xy[1]!.y + xy[2]!.y) / 3,
            style,
          );
        }
      }
      break;
    case 'path':
    case 'polyline':
      strokePoly(pc, xy, style, false);
      break;
    case 'brush':
    case 'highlighter': {
      // Talaria: Catmull-Rom α=0.5, round caps, always solid.
      // Highlighter look = wide stroke + opacity (not a soft-edge halo).
      if (xy.length >= 2) {
        const { ctx } = pc;
        applyStrokeStyle(ctx, { ...style, lineStyle: 'solid' });
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        pathFreehandCatmullRom(ctx, xy, {
          skipStartPad: style.leftEnd,
          skipEndPad: style.rightEnd,
        });
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        if (style.leftEnd && xy[0] && xy[1] && style.leftEndStyle === 'arrow') {
          drawArrowHead(pc, xy[1].x, xy[1].y, xy[0].x, xy[0].y, style);
        }
        if (
          style.rightEnd &&
          xy.length >= 2 &&
          style.rightEndStyle === 'arrow'
        ) {
          const a = xy[xy.length - 2]!;
          const b = xy[xy.length - 1]!;
          drawArrowHead(pc, a.x, a.y, b.x, b.y, style);
        }
      }
      break;
    }
    case 'arc':
    case 'curve':
      if (xy.length >= 3) {
        const { ctx } = pc;
        applyStrokeStyle(ctx, style);
        ctx.beginPath();
        ctx.moveTo(xy[0]!.x, xy[0]!.y);
        ctx.quadraticCurveTo(xy[1]!.x, xy[1]!.y, xy[2]!.x, xy[2]!.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      break;
    case 'doubleCurve':
      if (xy.length >= 4) {
        const { ctx } = pc;
        applyStrokeStyle(ctx, style);
        ctx.beginPath();
        ctx.moveTo(xy[0]!.x, xy[0]!.y);
        ctx.bezierCurveTo(xy[1]!.x, xy[1]!.y, xy[2]!.x, xy[2]!.y, xy[3]!.x, xy[3]!.y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      break;

    case 'arrowMarker':
    case 'arrow':
      if (xy.length >= 2) {
        strokeLine(pc, xy[0]!.x, xy[0]!.y, xy[1]!.x, xy[1]!.y, style);
        drawArrowHead(pc, xy[0]!.x, xy[0]!.y, xy[1]!.x, xy[1]!.y, style);
        if (asBool(d.meta?.showLabel, false) && d.points[0] && d.points[1]) {
          const dp = d.points[1].price - d.points[0].price;
          drawTextLabel(
            pc,
            (xy[0]!.x + xy[1]!.x) / 2 + 8,
            (xy[0]!.y + xy[1]!.y) / 2,
            `${dp >= 0 ? '+' : ''}${dp.toFixed(2)}`,
            style,
          );
        }
      }
      break;
    case 'arrowUp':
    case 'arrowDown':
      if (xy[0]) {
        const dir = d.type === 'arrowUp' ? -1 : 1;
        const y2 = xy[0].y + dir * 28;
        strokeLine(pc, xy[0].x, xy[0].y, xy[0].x, y2, style);
        drawArrowHead(pc, xy[0].x, xy[0].y, xy[0].x, y2, style, 12);
        if (asBool(d.meta?.showLabel, false) && d.points[0]) {
          drawTextLabel(
            pc,
            xy[0].x + 10,
            (xy[0].y + y2) / 2,
            d.points[0].price.toFixed(2),
            style,
          );
        }
      }
      break;

    case 'callout':
      if (xy[0] && xy[1]) {
        const textStyle = {
          ...style,
          textBold: style.textBold || asBool(d.meta?.bold, false),
          fill: true,
          fillOpacity: style.fill ? style.fillOpacity : 0.92,
        };
        const label = d.text || 'Callout';
        drawCalloutBubble(
          pc,
          xy[0].x,
          xy[0].y,
          xy[1].x,
          xy[1].y,
          label,
          textStyle,
        );
      }
      break;

    case 'priceLabel':
      if (xy[0] && d.points[0]) {
        const { ctx, plot, colors } = pc;
        const y = xy[0].y;
        const price = d.points[0].price;
        const label = fmtPrice(pc, price);
        const right = plot.left + plot.width;
        // Leader to plot edge — chip sits on the price axis (outside plot).
        applyStrokeStyle(ctx, { ...style, width: 1, lineStyle: 'dashed' });
        ctx.beginPath();
        ctx.moveTo(xy[0].x, y + 0.5);
        ctx.lineTo(right, y + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
        const labelH = 18;
        const chipW = Math.max(48, ctx.measureText(label).width + 14);
        const labelY = Math.min(
          Math.max(y - labelH / 2, plot.top),
          plot.top + plot.height - labelH,
        );
        const axisX = right;
        const notch = 4;
        ctx.fillStyle = style.color || colors.accent;
        ctx.beginPath();
        ctx.moveTo(axisX - notch, labelY + labelH / 2);
        ctx.lineTo(axisX, labelY);
        ctx.lineTo(axisX, labelY + labelH);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(axisX, labelY, chipW, labelH);
        ctx.fillStyle = colors.onSolid;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, axisX + 6, labelY + labelH / 2);
      }
      break;

    case 'text':
    case 'note':
    case 'priceNote':
    case 'pin':
    case 'comment':
    case 'flagMark':
      if (xy[0]) {
        const textStyle = {
          ...style,
          textBold: style.textBold || asBool(d.meta?.bold, false),
        };
        const label =
          d.text ||
          (d.type === 'priceNote' ? d.points[0]!.price.toFixed(2) : d.type);
        if (d.type === 'flagMark') {
          const { ctx } = pc;
          applyStrokeStyle(ctx, style);
          ctx.beginPath();
          ctx.moveTo(xy[0].x, xy[0].y);
          ctx.lineTo(xy[0].x, xy[0].y - 24);
          ctx.lineTo(xy[0].x + 16, xy[0].y - 18);
          ctx.lineTo(xy[0].x, xy[0].y - 12);
          ctx.stroke();
          ctx.setLineDash([]);
        } else if (d.type === 'pin') {
          const { ctx } = pc;
          applyStrokeStyle(ctx, style);
          ctx.beginPath();
          ctx.moveTo(xy[0].x, xy[0].y);
          ctx.lineTo(xy[0].x, xy[0].y - 16);
          ctx.arc(xy[0].x, xy[0].y - 22, 6, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          drawTextLabel(pc, xy[0].x + 6, xy[0].y, label, textStyle);
        }
      }
      break;

    case 'xabcd':
    case 'cypher':
    case 'abcd':
    case 'trianglePattern':
    case 'threeDrives':
    case 'headShoulders':
    case 'elliottImpulse':
    case 'elliottCorrection':
    case 'elliottTriangle':
    case 'elliottDoubleCombo':
    case 'elliottTripleCombo': {
      strokePoly(pc, xy, style, false);
      const isElliott = d.type.startsWith('elliott');
      const showLabels = isElliott
        ? asBool(d.meta?.showLabels, true)
        : asBool(d.meta?.showRatios, true);
      if (xy.length >= 3 && showLabels) {
        for (let i = 0; i < xy.length; i++) {
          drawTextLabel(
            pc,
            xy[i]!.x + 4,
            xy[i]!.y - 10,
            String.fromCharCode(65 + i),
            style,
            false,
          );
        }
        if (!isElliott && asBool(d.meta?.showRatios, true) && xy.length >= 4 && d.points.length >= 4) {
          const len = (i: number, j: number) =>
            Math.hypot(xy[j]!.x - xy[i]!.x, xy[j]!.y - xy[i]!.y) || 1;
          const ab = len(0, 1);
          const bc = len(1, 2);
          const ratio = (bc / ab).toFixed(2);
          drawTextLabel(
            pc,
            (xy[1]!.x + xy[2]!.x) / 2,
            (xy[1]!.y + xy[2]!.y) / 2 - 12,
            ratio,
            style,
          );
        }
      }
      break;
    }

    case 'timeCycles':
    case 'sineLine':
      if (xy.length >= 2) {
        const { ctx } = pc;
        const amp = Math.abs(xy[1]!.y - xy[0]!.y) || 40;
        const period = Math.abs(xy[1]!.x - xy[0]!.x) || 80;
        const periods = asNumber(d.meta?.periods, 8);
        applyStrokeStyle(ctx, style);
        ctx.beginPath();
        const steps = Math.max(32, periods * 16);
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const x =
            xy[0]!.x +
            t * period * periods * Math.sign(xy[1]!.x - xy[0]!.x || 1);
          const y =
            d.type === 'timeCycles'
              ? xy[0]!.y + Math.abs(Math.sin(t * Math.PI * periods)) * -amp
              : xy[0]!.y + Math.sin(t * Math.PI * periods) * amp;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      break;

    case 'longPosition':
    case 'shortPosition':
      if (xy.length >= 3 && d.points[0] && d.points[1] && d.points[2]) {
        const entry = xy[0]!;
        const stop = xy[1]!;
        const target = xy[2]!;
        const left = Math.min(entry.x, stop.x, target.x);
        const right = Math.max(entry.x, stop.x, target.x) + 40;
        const riskStyle = {
          ...style,
          color: pc.colors.downColor,
          fillOpacity: 0.2,
          fill: true,
        };
        const rewardStyle = {
          ...style,
          color: pc.colors.upColor,
          fillOpacity: 0.2,
          fill: true,
        };
        fillPoly(
          pc,
          [
            { x: left, y: entry.y },
            { x: right, y: entry.y },
            { x: right, y: stop.y },
            { x: left, y: stop.y },
          ],
          riskStyle,
        );
        fillPoly(
          pc,
          [
            { x: left, y: entry.y },
            { x: right, y: entry.y },
            { x: right, y: target.y },
            { x: left, y: target.y },
          ],
          rewardStyle,
        );
        strokeLine(pc, left, entry.y, right, entry.y, style);
        const geo = positionGeometry(d.points, d.type);
        const rr = geo?.riskReward ?? asNumber(d.meta?.riskReward, 2);
        drawTextLabel(pc, right + 4, entry.y, `1:${rr.toFixed(2)}`, style, false);
        if (asBool(d.meta?.showPrices, true)) {
          drawTextLabel(pc, left + 4, entry.y - 12, d.points[0].price.toFixed(2), style, false);
          drawTextLabel(pc, left + 4, stop.y, d.points[1].price.toFixed(2), style, false);
          drawTextLabel(pc, left + 4, target.y, d.points[2].price.toFixed(2), style, false);
        }
        if (geo) {
          const qty = positionQty(geo.risk, d.meta);
          let labelY = (entry.y + target.y) / 2;
          if (asBool(d.meta?.showQty, true) && qty > 0) {
            const qtyStr =
              qty >= 100 ? qty.toFixed(0) : qty >= 1 ? qty.toFixed(2) : qty.toFixed(4);
            drawTextLabel(pc, right + 4, labelY, `Qty ${qtyStr}`, style, false);
            labelY += 14;
          }
          if (asBool(d.meta?.showPnl, true) && qty > 0) {
            const pnl = positionPnlAtTarget(geo, qty);
            const sign = pnl >= 0 ? '+' : '';
            drawTextLabel(
              pc,
              right + 4,
              labelY,
              `P&L ${sign}${pnl.toFixed(2)}`,
              style,
              false,
            );
          }
        }
      }
      break;
    case 'forecast':
    case 'barsPattern':
      if (xy.length >= 2) {
        strokeLine(pc, xy[0]!.x, xy[0]!.y, xy[1]!.x, xy[1]!.y, {
          ...style,
          lineStyle: 'dashed',
        });
        drawArrowHead(pc, xy[0]!.x, xy[0]!.y, xy[1]!.x, xy[1]!.y, style);
      }
      break;

    case 'priceRange':
      if (xy.length >= 2 && d.points[0] && d.points[1]) {
        const x = (xy[0]!.x + xy[1]!.x) / 2;
        strokeLine(pc, x, xy[0]!.y, x, xy[1]!.y, style);
        if (asBool(d.meta?.showStats, true)) {
          const dp = Math.abs(d.points[1].price - d.points[0].price);
          drawTextLabel(pc, x + 8, (xy[0]!.y + xy[1]!.y) / 2, dp.toFixed(2), style);
        }
        if (asBool(d.meta?.showAngle, false)) {
          const dx = xy[1]!.x - xy[0]!.x;
          const dy = xy[1]!.y - xy[0]!.y;
          const ang = ((Math.atan2(-dy, dx) * 180) / Math.PI).toFixed(1);
          drawTextLabel(
            pc,
            x + 8,
            (xy[0]!.y + xy[1]!.y) / 2 + (asBool(d.meta?.showStats, true) ? 16 : 0),
            `${ang}°`,
            style,
          );
        }
      }
      break;
    case 'dateRange':
      if (xy.length >= 2 && d.points[0] && d.points[1]) {
        const y = (xy[0]!.y + xy[1]!.y) / 2;
        strokeLine(pc, xy[0]!.x, y, xy[1]!.x, y, style);
        if (asBool(d.meta?.showStats, true)) {
          const dt = Math.abs(d.points[1].time - d.points[0].time);
          drawTextLabel(
            pc,
            (xy[0]!.x + xy[1]!.x) / 2,
            y - 14,
            `${Math.round(dt / 60)}m`,
            style,
          );
        }
        if (asBool(d.meta?.showAngle, false)) {
          drawTextLabel(
            pc,
            (xy[0]!.x + xy[1]!.x) / 2,
            y + 14,
            '0.0°',
            style,
          );
        }
      }
      break;

    case 'anchoredVwap':
      if (d.points[0]) {
        const idx = barIndexAtTime(pc.bars, d.points[0].time);
        paintAnchoredVwap(pc, idx, style, {
          showBands: asBool(d.meta?.showBands, false),
          bandMult: asNumber(d.meta?.bandMult, 1),
        });
      }
      break;
    case 'fixedRangeVolumeProfile':
      if (d.points[0] && d.points[1]) {
        const a = barIndexAtTime(pc.bars, d.points[0].time);
        const b = barIndexAtTime(pc.bars, d.points[1].time);
        const left = Math.min(xy[0]?.x ?? pc.plot.left, xy[1]?.x ?? pc.plot.left);
        paintVolumeProfile(pc, a, b, style, left, {
          rows: asNumber(d.meta?.rows, 24),
          valueAreaPct: asNumber(d.meta?.valueAreaPct, 70),
          developRight: asBool(d.meta?.developRight, true),
        });
      }
      break;
    case 'anchoredVolumeProfile':
      if (d.points[0]) {
        const a = barIndexAtTime(pc.bars, d.points[0].time);
        paintVolumeProfile(pc, a, pc.bars.length - 1, style, xy[0]?.x ?? pc.plot.left, {
          rows: asNumber(d.meta?.rows, 24),
          valueAreaPct: asNumber(d.meta?.valueAreaPct, 70),
          developRight: asBool(d.meta?.developRight, true),
        });
      }
      break;

    default:
      strokePoly(pc, xy, style, false);
  }

  pc.ctx.restore();
  if (showHandles) {
    drawHandles(pc, handleXYForDrawing(d, xy, selected), selected ? 'selected' : false);
  }
}

export type DrawingPaintLayer = 'bodies' | 'chrome' | 'all';

/** Handles + axis badges for selected / hovered drawings (overlay-cheap). */
export function paintDrawingEditChrome(
  ctx: CanvasRenderingContext2D,
  drawings: readonly Drawing[],
  bars: readonly ChartBar[],
  range: import('@/types/bar').VisibleRange,
  plot: import('@/chart/scales').PlotRect,
  priceScale: import('@/chart/scales').PriceScale,
  selectedIds: readonly string[] | string | null,
  hoveredId: string | null,
  colors?: ChartColors,
  paneTf?: Timeframe | null,
  axisLayout?: {
    width: number;
    height: number;
    priceAxisWidth: number;
    timeAxisHeight: number;
  } | null,
  formatPriceFn?: PriceFormatter,
): void {
  if (bars.length === 0 || drawings.length === 0) return;
  const selectedSet = new Set(
    typeof selectedIds === 'string'
      ? [selectedIds]
      : selectedIds ?? [],
  );
  if (selectedSet.size === 0 && !hoveredId) return;

  const pc: PaintCtx = {
    ctx,
    bars,
    range,
    plot,
    priceScale,
    colors: colors ?? getChartColors(),
    formatPrice: formatPriceFn,
  };

  for (const d of drawings) {
    if (d.visible === false) continue;
    if (!isDrawingVisibleOnTf(d, paneTf)) continue;
    const isSelected = selectedSet.has(d.id);
    const isHovered = d.id === hoveredId;
    if (!isSelected && !isHovered) continue;
    const xy = pointsToXY(d.points, pc);
    drawHandles(
      pc,
      handleXYForDrawing(d, xy, isSelected),
      isSelected ? 'selected' : 'hover',
    );
  }

  if (selectedSet.size > 0 && axisLayout) {
    paintAxisBadges(
      ctx,
      drawings,
      selectedSet,
      bars,
      range,
      plot,
      priceScale,
      pc.colors,
      axisLayout,
      formatPriceFn,
    );
  }
}

export function paintAllDrawings(
  ctx: CanvasRenderingContext2D,
  drawings: readonly Drawing[],
  bars: readonly ChartBar[],
  range: import('@/types/bar').VisibleRange,
  plot: import('@/chart/scales').PlotRect,
  priceScale: import('@/chart/scales').PriceScale,
  draft: Drawing | null,
  selectedIds: readonly string[] | string | null,
  hidden: boolean,
  hoveredId: string | null = null,
  colors?: ChartColors,
  paneTf?: Timeframe | null,
  axisLayout?: {
    width: number;
    height: number;
    priceAxisWidth: number;
    timeAxisHeight: number;
  } | null,
  layer: DrawingPaintLayer = 'all',
  formatPriceFn?: PriceFormatter,
): void {
  if (hidden || bars.length === 0) return;
  const selectedSet = new Set(
    typeof selectedIds === 'string'
      ? [selectedIds]
      : selectedIds ?? [],
  );
  const pc: PaintCtx = {
    ctx,
    bars,
    range,
    plot,
    priceScale,
    colors: colors ?? getChartColors(),
    formatPrice: formatPriceFn,
  };

  if (layer === 'chrome') {
    paintDrawingEditChrome(
      ctx,
      drawings,
      bars,
      range,
      plot,
      priceScale,
      selectedIds,
      hoveredId,
      colors,
      paneTf,
      axisLayout,
      formatPriceFn,
    );
    if (draft) {
      paintDrawing(pc, draft, { selected: true, showHandles: true });
    }
    return;
  }

  const showHandles = layer === 'all';
  for (const d of drawings) {
    if (d.visible === false) continue;
    if (!isDrawingVisibleOnTf(d, paneTf)) continue;
    const isSelected = selectedSet.has(d.id);
    const isHovered = d.id === hoveredId;
    paintDrawing(pc, d, { selected: isSelected, showHandles: showHandles && isSelected });
    // Hover handles when near (TV); selected already drew handles above
    if (showHandles && !isSelected && isHovered) {
      const xy = pointsToXY(d.points, pc);
      drawHandles(pc, handleXYForDrawing(d, xy, false), 'hover');
    }
  }
  if (draft && layer === 'all') {
    // Always show anchors while placing
    paintDrawing(pc, draft, { selected: true });
  }
  if (showHandles && selectedSet.size > 0 && axisLayout) {
    paintAxisBadges(
      ctx,
      drawings,
      selectedSet,
      bars,
      range,
      plot,
      priceScale,
      pc.colors,
      axisLayout,
      formatPriceFn,
    );
  }
}
