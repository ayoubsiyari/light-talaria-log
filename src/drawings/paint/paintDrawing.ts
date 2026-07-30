import { getChartColors, type ChartColors } from '@/chart/chartTheme';
import { priceToY } from '@/chart/scales';
import type { ChartBar } from '@/types/bar';
import type { Drawing } from '../drawingStore';
import { applyStrokeStyle, extendModeToPaint } from '../drawingStyle';
import {
  asBool,
  asNumber,
  asNumberArray,
  DEFAULT_FIB_LEVELS,
} from '../toolSettings';
import { barIndexAtTime, clipToPlot, pointToXY, pointsToXY, type PaintCtx } from './coords';
import {
  drawArrowHead,
  drawHandles,
  drawTextLabel,
  fillPoly,
  strokeLine,
  strokePoly,
} from './primitives';

const FIB_TIME = [0, 1, 2, 3, 5, 8, 13, 21];

function yPrice(price: number, pc: PaintCtx): number {
  return priceToY(price, pc.priceScale, pc.plot);
}

function paintFibLevels(
  pc: PaintCtx,
  x0: number,
  x1: number,
  price0: number,
  price1: number,
  style: Drawing['style'],
  opts: {
    levels?: number[];
    extend?: boolean;
    reverse?: boolean;
    showLabels?: boolean;
  } = {},
): void {
  const levels = opts.levels?.length ? opts.levels : [...DEFAULT_FIB_LEVELS];
  const extend = opts.extend ?? false;
  const reverse = opts.reverse ?? false;
  const showLabels = opts.showLabels !== false;
  const { ctx, plot } = pc;
  const lo = Math.min(price0, price1);
  const hi = Math.max(price0, price1);
  const left = extend ? plot.left : Math.min(x0, x1);
  const right = extend ? plot.left + plot.width : Math.max(x0, x1);
  for (const lv of levels) {
    if (lv > 1 && !extend) continue;
    const t = reverse ? 1 - lv : lv;
    const price = hi - (hi - lo) * t;
    const y = yPrice(price, pc);
    applyStrokeStyle(ctx, style);
    ctx.globalAlpha = style.opacity * (lv === 0.5 || lv === 0.618 ? 1 : 0.75);
    ctx.beginPath();
    ctx.setLineDash(lv === 0 || lv === 1 ? [] : [4, 3]);
    ctx.moveTo(left, y + 0.5);
    ctx.lineTo(right, y + 0.5);
    ctx.stroke();
    if (showLabels) drawTextLabel(pc, left + 4, y, lv.toFixed(3), style, false);
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function paintPitchfork(
  pc: PaintCtx,
  pts: Array<{ x: number; y: number }>,
  style: Drawing['style'],
  kind: 'standard' | 'schiff' | 'modified' | 'inside',
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
  strokeLine(pc, a.x, a.y, mid.x, mid.y, style, 'ray');
  const dx = mid.x - a.x;
  const dy = mid.y - a.y;
  strokeLine(pc, b.x, b.y, b.x + dx, b.y + dy, style, 'ray');
  strokeLine(pc, c.x, c.y, c.x + dx, c.y + dy, style, 'ray');
}

function paintVolumeProfile(
  pc: PaintCtx,
  fromIdx: number,
  toIdx: number,
  style: Drawing['style'],
  anchorLeft: number,
  rows = 24,
): void {
  const { bars, ctx, plot } = pc;
  const lo = Math.max(0, Math.min(fromIdx, toIdx));
  const hi = Math.min(bars.length - 1, Math.max(fromIdx, toIdx));
  if (hi <= lo) return;
  const bins = Math.max(8, Math.min(64, Math.round(rows)));
  let pMin = Infinity;
  let pMax = -Infinity;
  let maxVol = 0;
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
  }
  const maxW = plot.width * 0.25;
  applyStrokeStyle(ctx, style);
  for (let i = 0; i < bins; i++) {
    const v = vols[i]! / maxVol;
    const price0 = pMin + ((pMax - pMin) * i) / bins;
    const price1 = pMin + ((pMax - pMin) * (i + 1)) / bins;
    const y0 = yPrice(price1, pc);
    const y1 = yPrice(price0, pc);
    const w = maxW * v;
    ctx.globalAlpha = 0.35 * style.opacity;
    ctx.fillStyle = style.color;
    ctx.fillRect(anchorLeft, y0, w, Math.max(1, y1 - y0));
  }
  ctx.globalAlpha = 1;
}

function paintAnchoredVwap(pc: PaintCtx, fromIdx: number, style: Drawing['style']): void {
  const { bars, ctx } = pc;
  if (fromIdx >= bars.length - 1) return;
  let cumPV = 0;
  let cumV = 0;
  applyStrokeStyle(ctx, style);
  ctx.beginPath();
  let started = false;
  for (let i = fromIdx; i < bars.length; i++) {
    const b = bars[i]!;
    const typical = (b.high + b.low + b.close) / 3;
    const vol = b.volume || 1;
    cumPV += typical * vol;
    cumV += vol;
    const vwap = cumPV / cumV;
    const xy = pointToXY({ time: b.time, price: vwap }, pc);
    if (!xy) continue;
    if (!started) {
      ctx.moveTo(xy.x, xy.y);
      started = true;
    } else ctx.lineTo(xy.x, xy.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

/** Paint a single drawing (committed or draft). */
export function paintDrawing(
  pc: PaintCtx,
  d: Drawing,
  opts: { selected?: boolean } = {},
): void {
  const style = d.style;
  const xy = pointsToXY(d.points, pc);
  const selected = !!opts.selected;

  pc.ctx.save();
  clipToPlot(pc);

  switch (d.type) {
    case 'hline':
      if (xy[0]) {
        strokeLine(pc, pc.plot.left, xy[0].y, pc.plot.left + pc.plot.width, xy[0].y, {
          ...style,
          lineStyle: style.lineStyle === 'solid' ? 'dashed' : style.lineStyle,
        });
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
        if (style.showMidpoint) {
          const mx = (xy[0]!.x + xy[1]!.x) / 2;
          const my = (xy[0]!.y + xy[1]!.y) / 2;
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
          drawTextLabel(pc, xy[0]!.x + 6, xy[0]!.y - 10, d.points[0].price.toFixed(2), style);
          drawTextLabel(pc, xy[1]!.x + 6, xy[1]!.y - 10, d.points[1].price.toFixed(2), style);
        }
        if (style.leftEnd) {
          const { ctx } = pc;
          ctx.save();
          ctx.fillStyle = style.color;
          ctx.beginPath();
          ctx.arc(xy[0]!.x, xy[0]!.y, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        if (style.rightEnd) {
          const { ctx } = pc;
          ctx.save();
          ctx.fillStyle = style.color;
          ctx.beginPath();
          ctx.arc(xy[1]!.x, xy[1]!.y, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        if (d.type === 'infoLine' || d.type === 'trendAngle') {
          const dx = xy[1]!.x - xy[0]!.x;
          const dy = xy[1]!.y - xy[0]!.y;
          const ang = ((Math.atan2(-dy, dx) * 180) / Math.PI).toFixed(1);
          const dp = d.points[1]!.price - d.points[0]!.price;
          drawTextLabel(
            pc,
            (xy[0]!.x + xy[1]!.x) / 2,
            (xy[0]!.y + xy[1]!.y) / 2 - 12,
            d.type === 'trendAngle' ? `${ang}°` : `${dp >= 0 ? '+' : ''}${dp.toFixed(2)}`,
            style,
          );
        }
      }
      break;
    case 'ray':
    case 'horizontalRay':
      if (xy.length >= 2) {
        if (d.type === 'horizontalRay') {
          strokeLine(pc, xy[0]!.x, xy[0]!.y, xy[1]!.x, xy[0]!.y, style, 'ray');
        } else {
          strokeLine(pc, xy[0]!.x, xy[0]!.y, xy[1]!.x, xy[1]!.y, style, 'ray');
        }
      }
      break;
    case 'extendedLine':
      if (xy.length >= 2) {
        strokeLine(pc, xy[0]!.x, xy[0]!.y, xy[1]!.x, xy[1]!.y, style, 'extended');
      }
      break;

    case 'parallelChannel':
    case 'flatTopBottom':
      if (xy.length >= 3) {
        const [a, b, c] = xy;
        strokeLine(pc, a!.x, a!.y, b!.x, b!.y, style, 'extended');
        const dx = b!.x - a!.x;
        const dy = d.type === 'flatTopBottom' ? 0 : b!.y - a!.y;
        strokeLine(pc, c!.x, c!.y, c!.x + dx, c!.y + dy, style, 'extended');
        fillPoly(pc, [a!, b!, { x: c!.x + dx, y: c!.y + dy }, c!], style);
      }
      break;
    case 'disjointChannel':
      if (xy.length >= 4) {
        strokeLine(pc, xy[0]!.x, xy[0]!.y, xy[1]!.x, xy[1]!.y, style, 'extended');
        strokeLine(pc, xy[2]!.x, xy[2]!.y, xy[3]!.x, xy[3]!.y, style, 'extended');
      }
      break;
    case 'regressionTrend':
      if (xy.length >= 2) {
        strokeLine(pc, xy[0]!.x, xy[0]!.y, xy[1]!.x, xy[1]!.y, style, 'extended');
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
      paintPitchfork(pc, xy, style, 'standard');
      break;
    case 'schiffPitchfork':
      paintPitchfork(pc, xy, style, 'schiff');
      break;
    case 'modifiedSchiffPitchfork':
      paintPitchfork(pc, xy, style, 'modified');
      break;
    case 'insidePitchfork':
      paintPitchfork(pc, xy, style, 'inside');
      break;

    case 'fibRetracement':
    case 'fibExtension':
      if (xy.length >= 2 && d.points[0] && d.points[1]) {
        const p2 = d.points[2];
        const priceA = d.points[0].price;
        const priceB = p2 && d.type === 'fibExtension' ? p2.price : d.points[1].price;
        const meta = d.meta ?? {};
        paintFibLevels(pc, xy[0]!.x, xy[1]!.x, priceA, priceB, style, {
          levels: asNumberArray(meta.levels, [...DEFAULT_FIB_LEVELS]),
          extend:
            asBool(meta.extendLines, d.type === 'fibExtension') ||
            d.type === 'fibExtension',
          reverse: asBool(meta.reverse, false),
          showLabels: asBool(meta.showLabels, true),
        });
        strokeLine(pc, xy[0]!.x, xy[0]!.y, xy[1]!.x, xy[1]!.y, {
          ...style,
          lineStyle: 'dotted',
        });
      }
      break;
    case 'fibChannel':
      if (xy.length >= 3) {
        strokeLine(pc, xy[0]!.x, xy[0]!.y, xy[1]!.x, xy[1]!.y, style, 'extended');
        const dx = xy[1]!.x - xy[0]!.x;
        const dy = xy[1]!.y - xy[0]!.y;
        for (const lv of [0.382, 0.5, 0.618, 1]) {
          const ox = (xy[2]!.x - xy[0]!.x) * lv;
          const oy = (xy[2]!.y - xy[0]!.y) * lv;
          strokeLine(
            pc,
            xy[0]!.x + ox,
            xy[0]!.y + oy,
            xy[0]!.x + ox + dx,
            xy[0]!.y + oy + dy,
            { ...style, opacity: style.opacity * 0.8 },
            'extended',
          );
        }
      }
      break;
    case 'fibTimezone':
    case 'fibTrendTime':
    case 'cyclicLines':
      if (xy.length >= 2) {
        const x0 = xy[0]!.x;
        const span = Math.abs(xy[1]!.x - xy[0]!.x) || 40;
        const levels = d.type === 'cyclicLines' ? [0, 1, 2, 3, 4, 5, 6, 7, 8] : FIB_TIME;
        for (const lv of levels) {
          const x = x0 + Math.sign(xy[1]!.x - xy[0]!.x || 1) * span * lv;
          strokeLine(pc, x, pc.plot.top, x, pc.plot.top + pc.plot.height, {
            ...style,
            lineStyle: lv === 0 ? 'solid' : 'dashed',
          });
        }
      }
      break;
    case 'fibSpeedFan':
    case 'fibFan':
    case 'gannFan':
      if (xy.length >= 2) {
        const ratios =
          d.type === 'gannFan'
            ? [1 / 8, 1 / 4, 1 / 3, 1 / 2, 1, 2, 3, 4, 8]
            : [0.25, 0.382, 0.5, 0.618, 0.75, 1];
        for (const r of ratios) {
          const x1 = xy[0]!.x + (xy[1]!.x - xy[0]!.x);
          const y1 = xy[0]!.y + (xy[1]!.y - xy[0]!.y) * r;
          strokeLine(pc, xy[0]!.x, xy[0]!.y, x1, y1, style, 'ray');
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
        applyStrokeStyle(ctx, style);
        for (const lv of [0.382, 0.5, 0.618, 1, 1.618]) {
          ctx.beginPath();
          if (d.type === 'fibSpeedArcs' || d.type === 'fibWedge') {
            ctx.arc(xy[0]!.x, xy[0]!.y, r0 * lv, Math.PI, Math.PI * 2);
          } else if (d.type === 'fibSpiral') {
            let px = xy[0]!.x;
            let py = xy[0]!.y;
            ctx.moveTo(px, py);
            for (let t = 0; t < 8; t += 0.1) {
              const rad = (r0 * t) / 8;
              const ang = t * 0.7;
              px = xy[0]!.x + Math.cos(ang) * rad;
              py = xy[0]!.y + Math.sin(ang) * rad;
              ctx.lineTo(px, py);
            }
          } else {
            ctx.arc(xy[0]!.x, xy[0]!.y, r0 * lv, 0, Math.PI * 2);
          }
          ctx.stroke();
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
        if (d.type.startsWith('gann')) {
          const { ctx } = pc;
          applyStrokeStyle(ctx, { ...style, opacity: style.opacity * 0.5 });
          for (let i = 1; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(x + (w * i) / 4, y);
            ctx.lineTo(x + (w * i) / 4, y + h);
            ctx.moveTo(x, y + (h * i) / 4);
            ctx.lineTo(x + w, y + (h * i) / 4);
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.moveTo(x, y + h);
          ctx.lineTo(x + w, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
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
          ctx.globalAlpha = style.fillOpacity * style.opacity;
          ctx.fillStyle = style.color;
          ctx.fill();
        }
        applyStrokeStyle(ctx, style);
        ctx.beginPath();
        ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      break;
    case 'triangle':
      if (xy.length >= 3) {
        fillPoly(pc, xy.slice(0, 3), style);
        strokePoly(pc, xy.slice(0, 3), style, true);
      }
      break;
    case 'path':
    case 'polyline':
    case 'brush':
    case 'highlighter':
      strokePoly(pc, xy, style, false);
      break;
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
      }
      break;
    case 'arrowUp':
    case 'arrowDown':
      if (xy[0]) {
        const dir = d.type === 'arrowUp' ? -1 : 1;
        const y2 = xy[0].y + dir * 28;
        strokeLine(pc, xy[0].x, xy[0].y, xy[0].x, y2, style);
        drawArrowHead(pc, xy[0].x, xy[0].y, xy[0].x, y2, style, 12);
      }
      break;

    case 'text':
    case 'note':
    case 'priceNote':
    case 'pin':
    case 'comment':
    case 'callout':
    case 'priceLabel':
    case 'flagMark':
      if (xy[0]) {
        const label =
          d.text ||
          (d.type === 'priceLabel' || d.type === 'priceNote'
            ? d.points[0]!.price.toFixed(2)
            : d.type);
        if (d.type === 'callout' && xy[1]) {
          strokeLine(pc, xy[0].x, xy[0].y, xy[1].x, xy[1].y, style);
          drawTextLabel(pc, xy[1].x + 6, xy[1].y, label, style);
        } else if (d.type === 'flagMark') {
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
          drawTextLabel(pc, xy[0].x + 6, xy[0].y, label, style);
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
    case 'elliottTripleCombo':
      strokePoly(pc, xy, style, false);
      if (xy.length >= 3) {
        for (let i = 0; i < xy.length; i++) {
          drawTextLabel(pc, xy[i]!.x + 4, xy[i]!.y - 10, String.fromCharCode(65 + i), style, false);
        }
      }
      break;

    case 'timeCycles':
    case 'sineLine':
      if (xy.length >= 2) {
        const { ctx } = pc;
        const amp = Math.abs(xy[1]!.y - xy[0]!.y) || 40;
        const period = Math.abs(xy[1]!.x - xy[0]!.x) || 80;
        applyStrokeStyle(ctx, style);
        ctx.beginPath();
        const steps = 64;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const x = xy[0]!.x + t * period * 4 * Math.sign(xy[1]!.x - xy[0]!.x || 1);
          const y =
            d.type === 'timeCycles'
              ? xy[0]!.y + Math.abs(Math.sin(t * Math.PI * 4)) * -amp
              : xy[0]!.y + Math.sin(t * Math.PI * 4) * amp;
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
        const riskStyle = { ...style, color: '#F44336', fillOpacity: 0.2 };
        const rewardStyle = { ...style, color: '#4CAF50', fillOpacity: 0.2 };
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
        const dp = Math.abs(d.points[1].price - d.points[0].price);
        drawTextLabel(pc, x + 8, (xy[0]!.y + xy[1]!.y) / 2, dp.toFixed(2), style);
      }
      break;
    case 'dateRange':
      if (xy.length >= 2 && d.points[0] && d.points[1]) {
        const y = (xy[0]!.y + xy[1]!.y) / 2;
        strokeLine(pc, xy[0]!.x, y, xy[1]!.x, y, style);
        const dt = Math.abs(d.points[1].time - d.points[0].time);
        drawTextLabel(
          pc,
          (xy[0]!.x + xy[1]!.x) / 2,
          y - 14,
          `${Math.round(dt / 60)}m`,
          style,
        );
      }
      break;

    case 'anchoredVwap':
      if (d.points[0]) {
        const idx = barIndexAtTime(pc.bars, d.points[0].time);
        paintAnchoredVwap(pc, idx, style);
      }
      break;
    case 'fixedRangeVolumeProfile':
      if (d.points[0] && d.points[1]) {
        const a = barIndexAtTime(pc.bars, d.points[0].time);
        const b = barIndexAtTime(pc.bars, d.points[1].time);
        const left = Math.min(xy[0]?.x ?? pc.plot.left, xy[1]?.x ?? pc.plot.left);
        paintVolumeProfile(
          pc,
          a,
          b,
          style,
          left,
          asNumber(d.meta?.rows, 24),
        );
      }
      break;
    case 'anchoredVolumeProfile':
      if (d.points[0]) {
        const a = barIndexAtTime(pc.bars, d.points[0].time);
        paintVolumeProfile(
          pc,
          a,
          pc.bars.length - 1,
          style,
          xy[0]?.x ?? pc.plot.left,
          asNumber(d.meta?.rows, 24),
        );
      }
      break;

    default:
      strokePoly(pc, xy, style, false);
  }

  pc.ctx.restore();
  drawHandles(pc, xy, selected ? 'selected' : false);
}

export function paintAllDrawings(
  ctx: CanvasRenderingContext2D,
  drawings: readonly Drawing[],
  bars: readonly ChartBar[],
  range: import('@/types/bar').VisibleRange,
  plot: import('@/chart/scales').PlotRect,
  priceScale: import('@/chart/scales').PriceScale,
  draft: Drawing | null,
  selectedId: string | null,
  hidden: boolean,
  hoveredId: string | null = null,
  colors?: ChartColors,
): void {
  if (hidden || bars.length === 0) return;
  const pc: PaintCtx = {
    ctx,
    bars,
    range,
    plot,
    priceScale,
    colors: colors ?? getChartColors(),
  };
  for (const d of drawings) {
    if (d.visible === false) continue;
    const isSelected = d.id === selectedId;
    const isHovered = d.id === hoveredId;
    paintDrawing(pc, d, { selected: isSelected });
    // Hover handles when near (TV); selected already drew handles above
    if (!isSelected && isHovered) {
      const xy = pointsToXY(d.points, pc);
      drawHandles(pc, xy, 'hover');
    }
  }
  if (draft) {
    // Always show anchors while placing
    paintDrawing(pc, draft, { selected: true });
  }
}
