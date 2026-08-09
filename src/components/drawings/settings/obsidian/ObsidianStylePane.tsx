import { useState } from 'react';
import type { Drawing } from '@/drawings/drawingStore';
import {
  applyEndCap,
  defaultChannelLevels,
  defaultPitchforkLevels,
  defaultRegLevels,
  endCapFromStyle,
  HIGHLIGHTER_WIDTHS,
  type DrawingStyle,
  type EndCapStyle,
  type ExtendMode,
  type LineStyleKind,
  type StyleLevelRow,
} from '@/drawings/drawingStyle';
import type { DrawingToolId } from '@/drawings/toolRegistry';
import { getToolSettings } from '@/drawings/toolSettings';
import { SettingsChip } from '@/components/drawings/settings/SettingsChip';
import { SettCheckbox, SettLineGrid, SettRow, SettRule, SettSec } from './SettCheckbox';
import { SettColorSwatch } from './SettColorSwatch';
import { SettEndpointDropdown } from './SettEndpointDropdown';
import { SettInfoMetricsDropdown } from './SettInfoMetricsDropdown';
import {
  SettLineTypeDropdown,
  SettLineWidthDropdown,
} from './SettLineDropdown';
import { SettLevelsGrid } from './SettLevelsGrid';
import { SettSizeDropdown } from './SettSizeDropdown';
import {
  showBackground,
  showDash,
  showEndpoints,
  showExtendChips,
  showInfoRow,
  showMidLineRow,
  showPriceChip,
  showShapeBorder,
  showTimeChip,
  styleFamilyFor,
} from './toolFamily';

interface ObsidianStylePaneProps {
  draft: Drawing;
  patchStyle: (partial: Partial<DrawingStyle>) => void;
  patchMeta: (partial: Record<string, unknown>) => void;
}

function asLevels(raw: unknown, fallback: StyleLevelRow[]): StyleLevelRow[] {
  if (!Array.isArray(raw) || raw.length === 0) return fallback.map((r) => ({ ...r }));
  return raw.map((r) => {
    const o = r as Partial<StyleLevelRow>;
    return {
      on: o.on !== false,
      value: String(o.value ?? '0'),
      color: String(o.color ?? '#2962FF'),
      type: (o.type as LineStyleKind) || 'solid',
      width: Number(o.width) || 1,
      label: o.label,
      middle: o.middle,
    };
  });
}

function LineCluster({
  color,
  opacity,
  lineStyle,
  width,
  hideDash,
  widthPresets,
  textWidth,
  leftCap,
  rightCap,
  showEp,
  disabled,
  openKey,
  onOpenKey,
  onColor,
  onStyle,
  onWidth,
  onLeftCap,
  onRightCap,
}: {
  color: string;
  opacity: number;
  lineStyle: LineStyleKind;
  width: number;
  hideDash?: boolean;
  widthPresets?: readonly number[];
  textWidth?: boolean;
  leftCap?: EndCapStyle;
  rightCap?: EndCapStyle;
  showEp?: boolean;
  disabled?: boolean;
  openKey: string | null;
  onOpenKey: (k: string | null) => void;
  onColor: (p: { color?: string; opacity?: number }) => void;
  onStyle: (s: LineStyleKind) => void;
  onWidth: (w: number) => void;
  onLeftCap?: (c: EndCapStyle) => void;
  onRightCap?: (c: EndCapStyle) => void;
}) {
  return (
    <>
      <SettColorSwatch
        color={color}
        opacity={opacity}
        disabled={disabled}
        onChange={onColor}
      />
      {!hideDash && (
        <SettLineTypeDropdown
          value={lineStyle}
          open={openKey === 'type'}
          onOpenChange={(o) => onOpenKey(o ? 'type' : null)}
          onChange={onStyle}
          disabled={disabled}
        />
      )}
      <SettLineWidthDropdown
        value={width}
        presets={widthPresets}
        textMode={textWidth}
        open={openKey === 'width'}
        onOpenChange={(o) => onOpenKey(o ? 'width' : null)}
        onChange={onWidth}
        disabled={disabled}
      />
      {showEp && onLeftCap && onRightCap && leftCap != null && rightCap != null && (
        <>
          <SettEndpointDropdown
            side="left"
            value={leftCap}
            open={openKey === 'ep1'}
            onOpenChange={(o) => onOpenKey(o ? 'ep1' : null)}
            onChange={onLeftCap}
            disabled={disabled}
          />
          <SettEndpointDropdown
            side="right"
            value={rightCap}
            open={openKey === 'ep2'}
            onOpenChange={(o) => onOpenKey(o ? 'ep2' : null)}
            onChange={onRightCap}
            disabled={disabled}
          />
        </>
      )}
    </>
  );
}

function LabelsRow({
  type,
  style,
  patchStyle,
}: {
  type: DrawingToolId;
  style: DrawingStyle;
  patchStyle: (p: Partial<DrawingStyle>) => void;
}) {
  const price = showPriceChip(type);
  const time = showTimeChip(type);
  if (!price && !time) return null;
  return (
    <SettRow label="Labels">
      {price && (
        <SettingsChip
          label="Price"
          on={style.showPriceLabels}
          onClick={() => patchStyle({ showPriceLabels: !style.showPriceLabels })}
        />
      )}
      {time && (
        <SettingsChip
          label="Time"
          on={style.showTimeLabels}
          onClick={() => patchStyle({ showTimeLabels: !style.showTimeLabels })}
        />
      )}
    </SettRow>
  );
}

function ExtendRow({
  style,
  patchStyle,
}: {
  style: DrawingStyle;
  patchStyle: (p: Partial<DrawingStyle>) => void;
}) {
  const left = style.extend === 'left' || style.extend === 'both';
  const right = style.extend === 'right' || style.extend === 'both';
  const set = (side: 'left' | 'right', on: boolean) => {
    const L = side === 'left' ? on : left;
    const R = side === 'right' ? on : right;
    let next: ExtendMode = 'none';
    if (L && R) next = 'both';
    else if (L) next = 'left';
    else if (R) next = 'right';
    patchStyle({ extend: next });
  };
  return (
    <SettRow label="Extend">
      <SettingsChip label="Left" on={left} onClick={() => set('left', !left)} />
      <SettingsChip label="Right" on={right} onClick={() => set('right', !right)} />
    </SettRow>
  );
}

export function ObsidianStylePane({
  draft,
  patchStyle,
  patchMeta,
}: ObsidianStylePaneProps) {
  const type = draft.type;
  const style = draft.style;
  const meta = draft.meta ?? {};
  const family = styleFamilyFor(type);
  const settings = getToolSettings(type);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const leftCap = endCapFromStyle(style.leftEnd, style.leftEndStyle);
  const rightCap = endCapFromStyle(style.rightEnd, style.rightEndStyle);

  const setCap = (side: 'left' | 'right', cap: EndCapStyle) => {
    const applied = applyEndCap(cap);
    if (side === 'left') {
      patchStyle({ leftEnd: applied.enabled, leftEndStyle: applied.style });
    } else {
      patchStyle({ rightEnd: applied.enabled, rightEndStyle: applied.style });
    }
  };

  /* ── Position RR ── */
  if (family === 'position') {
    const profit = String(meta.profitColor ?? '#089981');
    const loss = String(meta.lossColor ?? '#F23645');
    const entry = String(meta.entryColor ?? '#2962FF');
    const labelColor = String(meta.labelColor ?? style.labelColor);
    const labelSize = Number(meta.labelFontSize ?? style.fontSize) || 12;
    return (
      <>
        <SettSec>Zone colors</SettSec>
        {(
          [
            ['Profit Zone', 'profitColor', profit],
            ['Loss Zone', 'lossColor', loss],
            ['Entry Line', 'entryColor', entry],
          ] as const
        ).map(([label, key, color]) => (
          <SettRow key={key} label={label}>
            <SettColorSwatch
              color={color}
              showOpacity={false}
              onChange={({ color: c }) => {
                if (c) patchMeta({ [key]: c });
              }}
            />
          </SettRow>
        ))}
        <SettRule />
        <SettRow label="Label">
          <SettColorSwatch
            color={labelColor}
            showOpacity={false}
            onChange={({ color: c }) => {
              if (c) {
                patchMeta({ labelColor: c });
                patchStyle({ labelColor: c });
              }
            }}
          />
          <SettSizeDropdown
            value={labelSize}
            sizes={[8, 9, 10, 11, 12, 13, 14, 16, 18]}
            open={openKey === 'rrFsz'}
            onOpenChange={(o) => setOpenKey(o ? 'rrFsz' : null)}
            onChange={(n) => {
              patchMeta({ labelFontSize: n });
              patchStyle({ fontSize: n });
            }}
          />
        </SettRow>
        <LabelsRow type={type} style={style} patchStyle={patchStyle} />
      </>
    );
  }

  /* ── Measure / Range ── */
  if (family === 'measure') {
    return (
      <>
        <SettLineGrid label="Line">
          <LineCluster
            color={style.color}
            opacity={style.opacity}
            lineStyle={style.lineStyle}
            width={style.width}
            openKey={openKey}
            onOpenKey={setOpenKey}
            onColor={(p) => {
              const next: Partial<DrawingStyle> = {};
              if (p.color) {
                next.color = p.color;
                if (style.fillColor === style.color) next.fillColor = p.color;
              }
              if (p.opacity != null) next.opacity = p.opacity;
              patchStyle(next);
            }}
            onStyle={(lineStyle) => patchStyle({ lineStyle })}
            onWidth={(width) => patchStyle({ width })}
          />
        </SettLineGrid>
        <SettRow
          label={
            <SettCheckbox
              checked={style.showBorder}
              onChange={(showBorder) => patchStyle({ showBorder })}
              label="Border"
            />
          }
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              opacity: style.showBorder ? 1 : 0.38,
              pointerEvents: style.showBorder ? 'auto' : 'none',
            }}
          >
            <SettColorSwatch
              color={style.borderColor}
              showOpacity={false}
              onChange={({ color }) => {
                if (color) patchStyle({ borderColor: color });
              }}
            />
            <SettLineTypeDropdown
              value={style.borderLineStyle}
              open={openKey === 'borderType'}
              onOpenChange={(o) => setOpenKey(o ? 'borderType' : null)}
              onChange={(borderLineStyle) => patchStyle({ borderLineStyle })}
            />
            <SettLineWidthDropdown
              value={style.borderWidth}
              open={openKey === 'borderWidth'}
              onOpenChange={(o) => setOpenKey(o ? 'borderWidth' : null)}
              onChange={(borderWidth) => patchStyle({ borderWidth })}
            />
          </div>
        </SettRow>
        <SettRow
          label={
            <SettCheckbox
              checked={style.fill}
              onChange={(fill) => patchStyle({ fill })}
              label="Background"
            />
          }
        >
          <div
            style={{
              opacity: style.fill ? 1 : 0.38,
              pointerEvents: style.fill ? 'auto' : 'none',
            }}
          >
            <SettColorSwatch
              color={style.fillColor || style.color}
              opacity={style.fillOpacity}
              onChange={(p) => {
                const next: Partial<DrawingStyle> = {};
                if (p.color) next.fillColor = p.color;
                if (p.opacity != null) next.fillOpacity = p.opacity;
                patchStyle(next);
              }}
            />
          </div>
        </SettRow>
        <SettRule />
        <SettRow
          label={
            <SettCheckbox
              checked={style.showInfo}
              onChange={(showInfo) => patchStyle({ showInfo })}
              label="Stats"
            />
          }
        >
          <div
            style={{
              opacity: style.showInfo ? 1 : 0.38,
              pointerEvents: style.showInfo ? 'auto' : 'none',
            }}
          >
            <SettInfoMetricsDropdown
              selected={style.infoMetrics ?? []}
              open={openKey === 'info'}
              onOpenChange={(o) => setOpenKey(o ? 'info' : null)}
              onChange={(infoMetrics) => patchStyle({ infoMetrics })}
              disabled={!style.showInfo}
            />
          </div>
        </SettRow>
        <SettRow label="Label" dimmed={!style.showInfo}>
          <SettColorSwatch
            color={style.labelColor}
            showOpacity={false}
            disabled={!style.showInfo}
            onChange={({ color }) => {
              if (color) patchStyle({ labelColor: color });
            }}
          />
          <SettSizeDropdown
            value={style.fontSize}
            open={openKey === 'labelSize'}
            onOpenChange={(o) => setOpenKey(o ? 'labelSize' : null)}
            onChange={(fontSize) => patchStyle({ fontSize })}
            disabled={!style.showInfo}
            sizes={[8, 10, 11, 12, 13, 14, 16, 18, 20, 24]}
          />
        </SettRow>
        <SettRow
          label={
            <SettCheckbox
              checked={style.labelBg}
              onChange={(labelBg) => patchStyle({ labelBg })}
              label="Label BG"
              disabled={!style.showInfo}
            />
          }
          dimmed={!style.showInfo}
        >
          <div
            style={{
              opacity: style.showInfo && style.labelBg ? 1 : 0.38,
              pointerEvents: style.showInfo && style.labelBg ? 'auto' : 'none',
            }}
          >
            <SettColorSwatch
              color={style.labelBgColor}
              showOpacity={false}
              onChange={({ color }) => {
                if (color) patchStyle({ labelBgColor: color });
              }}
            />
          </div>
        </SettRow>
      </>
    );
  }

  /* ── Channel / Fib / Pitchfork / Gann level grids ── */
  if (
    family === 'channel' ||
    family === 'fib' ||
    family === 'pitchfork' ||
    family === 'gann'
  ) {
    const stroke = style.color;
    let levelsKey = 'levels';
    let defaults: StyleLevelRow[] = defaultChannelLevels(stroke);
    if (family === 'channel') {
      levelsKey = type === 'regressionTrend' ? 'regLines' : 'chLines';
      defaults =
        type === 'regressionTrend'
          ? defaultRegLevels(stroke)
          : defaultChannelLevels(stroke);
    } else if (family === 'pitchfork') {
      levelsKey = 'pfLevels';
      defaults = defaultPitchforkLevels(stroke);
    } else if (family === 'gann') {
      levelsKey = 'gannLevels';
      defaults = defaultPitchforkLevels(stroke);
    } else {
      // fib — convert meta.levels (FibLevel) into StyleLevelRow for UI
      const fibLevels = Array.isArray(meta.levels) ? meta.levels : [];
      if (fibLevels.length > 0) {
        defaults = fibLevels.map((l) => {
          const o = l as {
            coeff?: number;
            visible?: boolean;
            color?: string;
            lineStyle?: LineStyleKind;
            width?: number;
          };
          return {
            on: o.visible !== false,
            value: String(o.coeff ?? 0),
            color: o.color ?? stroke,
            type: o.lineStyle ?? 'solid',
            width: o.width ?? 1,
          };
        });
      }
    }
    const levels = asLevels(meta[levelsKey], defaults);

    return (
      <>
        {family !== 'fib' && family !== 'channel' && (
          <SettLineGrid label="Line">
            <LineCluster
              color={style.color}
              opacity={style.opacity}
              lineStyle={style.lineStyle}
              width={style.width}
              hideDash={!showDash(type)}
              openKey={openKey}
              onOpenKey={setOpenKey}
              onColor={(p) => {
                const next: Partial<DrawingStyle> = {};
                if (p.color) next.color = p.color;
                if (p.opacity != null) next.opacity = p.opacity;
                patchStyle(next);
              }}
              onStyle={(lineStyle) => patchStyle({ lineStyle })}
              onWidth={(width) => patchStyle({ width })}
            />
          </SettLineGrid>
        )}
        <SettLevelsGrid
          levels={levels}
          openKey={openKey}
          onOpenKey={setOpenKey}
          preferLabel={family === 'channel' && type === 'regressionTrend'}
          showValue={family !== 'channel' || type !== 'regressionTrend'}
          onChange={(next) => {
            if (family === 'fib') {
              patchMeta({
                [levelsKey]: next,
                levels: next.map((r) => ({
                  coeff: Number(r.value) || 0,
                  visible: r.on,
                  color: r.color,
                  lineStyle: r.type,
                  width: r.width,
                })),
              });
            } else {
              patchMeta({ [levelsKey]: next });
            }
          }}
        />
        {showMidLineRow(type) && (
          <SettRow
            label={
              <SettCheckbox
                checked={style.midLine}
                onChange={(midLine) => patchStyle({ midLine })}
                label="Middle Line"
              />
            }
          >
            <div
              style={{
                display: 'flex',
                gap: 6,
                opacity: style.midLine ? 1 : 0.38,
                pointerEvents: style.midLine ? 'auto' : 'none',
              }}
            >
              <SettColorSwatch
                color={style.midLineColor}
                showOpacity={false}
                onChange={({ color }) => {
                  if (color) patchStyle({ midLineColor: color });
                }}
              />
              <SettLineTypeDropdown
                value={style.midLineStyle}
                open={openKey === 'midType'}
                onOpenChange={(o) => setOpenKey(o ? 'midType' : null)}
                onChange={(midLineStyle) => patchStyle({ midLineStyle })}
              />
              <SettLineWidthDropdown
                value={style.midLineWidth}
                open={openKey === 'midWidth'}
                onOpenChange={(o) => setOpenKey(o ? 'midWidth' : null)}
                onChange={(midLineWidth) => patchStyle({ midLineWidth })}
              />
            </div>
          </SettRow>
        )}
        {showBackground(type) && (
          <SettRow
            label={
              <SettCheckbox
                checked={style.fill}
                onChange={(fill) => patchStyle({ fill })}
                label="Background"
              />
            }
          >
            <div
              style={{
                opacity: style.fill ? 1 : 0.38,
                pointerEvents: style.fill ? 'auto' : 'none',
              }}
            >
              <SettColorSwatch
                color={style.fillColor || style.color}
                opacity={style.fillOpacity}
                onChange={(p) => {
                  const next: Partial<DrawingStyle> = {};
                  if (p.color) next.fillColor = p.color;
                  if (p.opacity != null) next.fillOpacity = p.opacity;
                  patchStyle(next);
                }}
              />
            </div>
          </SettRow>
        )}
        {showExtendChips(type) && (
          <ExtendRow style={style} patchStyle={patchStyle} />
        )}
        <LabelsRow type={type} style={style} patchStyle={patchStyle} />
      </>
    );
  }

  /* ── Brush / Highlighter ── */
  if (family === 'brush' || family === 'highlighter') {
    const isHl = family === 'highlighter';
    return (
      <>
        <SettLineGrid label="Line">
          <LineCluster
            color={style.color}
            opacity={style.opacity}
            lineStyle="solid"
            width={style.width}
            hideDash
            textWidth={isHl}
            widthPresets={
              isHl ? HIGHLIGHTER_WIDTHS : settings.widthPresets ?? [1, 2, 3, 4]
            }
            showEp={!isHl}
            leftCap={leftCap}
            rightCap={rightCap}
            openKey={openKey}
            onOpenKey={setOpenKey}
            onColor={(p) => {
              const next: Partial<DrawingStyle> = { lineStyle: 'solid' };
              if (p.color) next.color = p.color;
              if (p.opacity != null) next.opacity = p.opacity;
              patchStyle(next);
            }}
            onStyle={() => patchStyle({ lineStyle: 'solid' })}
            onWidth={(width) => patchStyle({ width, lineStyle: 'solid' })}
            onLeftCap={(c) => setCap('left', c)}
            onRightCap={(c) => setCap('right', c)}
          />
        </SettLineGrid>
        <LabelsRow type={type} style={style} patchStyle={patchStyle} />
      </>
    );
  }

  /* ── Shapes ── */
  if (family === 'shape' || family === 'pattern') {
    const borderUi = showShapeBorder(type);
    const edgeDisabled = borderUi && !style.showBorder;
    const edgeColor = borderUi ? style.borderColor || style.color : style.color;
    const edgeStyle = borderUi ? style.borderLineStyle : style.lineStyle;
    const edgeWidth = borderUi ? style.borderWidth : style.width;

    return (
      <>
        <SettLineGrid
          label={
            borderUi ? (
              <SettCheckbox
                checked={style.showBorder}
                onChange={(showBorder) => patchStyle({ showBorder })}
                label="Borders"
              />
            ) : (
              'Line'
            )
          }
          dimmed={edgeDisabled}
        >
          <LineCluster
            color={edgeColor}
            opacity={style.opacity}
            lineStyle={edgeStyle}
            width={edgeWidth}
            hideDash={!showDash(type)}
            showEp={showEndpoints(type)}
            leftCap={leftCap}
            rightCap={rightCap}
            openKey={openKey}
            onOpenKey={setOpenKey}
            onColor={(p) => {
              if (borderUi) {
                if (p.color) patchStyle({ borderColor: p.color });
              } else {
                const next: Partial<DrawingStyle> = {};
                if (p.color) {
                  next.color = p.color;
                  if (style.fillColor === style.color) next.fillColor = p.color;
                }
                if (p.opacity != null) next.opacity = p.opacity;
                patchStyle(next);
              }
            }}
            onStyle={(s) =>
              borderUi
                ? patchStyle({ borderLineStyle: s })
                : patchStyle({ lineStyle: s })
            }
            onWidth={(w) =>
              borderUi ? patchStyle({ borderWidth: w }) : patchStyle({ width: w })
            }
            onLeftCap={(c) => setCap('left', c)}
            onRightCap={(c) => setCap('right', c)}
          />
        </SettLineGrid>

        {showMidLineRow(type) && (
          <SettRow
            label={
              <SettCheckbox
                checked={style.midLine}
                onChange={(midLine) => patchStyle({ midLine })}
                label="Middle"
              />
            }
          >
            <div
              style={{
                display: 'flex',
                gap: 6,
                opacity: style.midLine ? 1 : 0.38,
                pointerEvents: style.midLine ? 'auto' : 'none',
              }}
            >
              <SettColorSwatch
                color={style.midLineColor}
                showOpacity={false}
                onChange={({ color }) => {
                  if (color) patchStyle({ midLineColor: color });
                }}
              />
              <SettLineTypeDropdown
                value={style.midLineStyle}
                open={openKey === 'midType'}
                onOpenChange={(o) => setOpenKey(o ? 'midType' : null)}
                onChange={(midLineStyle) => patchStyle({ midLineStyle })}
              />
              <SettLineWidthDropdown
                value={style.midLineWidth}
                open={openKey === 'midWidth'}
                onOpenChange={(o) => setOpenKey(o ? 'midWidth' : null)}
                onChange={(midLineWidth) => patchStyle({ midLineWidth })}
              />
            </div>
          </SettRow>
        )}

        {showBackground(type) && (
          <SettRow
            label={
              <SettCheckbox
                checked={style.fill}
                onChange={(fill) => patchStyle({ fill })}
                label="Background"
              />
            }
          >
            <div
              style={{
                opacity: style.fill ? 1 : 0.38,
                pointerEvents: style.fill ? 'auto' : 'none',
              }}
            >
              <SettColorSwatch
                color={style.fillColor || style.color}
                opacity={style.fillOpacity}
                onChange={(p) => {
                  const next: Partial<DrawingStyle> = {};
                  if (p.color) next.fillColor = p.color;
                  if (p.opacity != null) next.fillOpacity = p.opacity;
                  patchStyle(next);
                }}
              />
            </div>
          </SettRow>
        )}

        {family === 'pattern' && (
          <SettRow label="Label">
            <SettColorSwatch
              color={style.textColor}
              showOpacity={false}
              onChange={({ color }) => {
                if (color) patchStyle({ textColor: color });
              }}
            />
            <SettSizeDropdown
              value={style.fontSize}
              open={openKey === 'labSize'}
              onOpenChange={(o) => setOpenKey(o ? 'labSize' : null)}
              onChange={(fontSize) => patchStyle({ fontSize })}
            />
          </SettRow>
        )}

        <LabelsRow type={type} style={style} patchStyle={patchStyle} />
      </>
    );
  }

  /* ── Generic line (default) ── */
  return (
    <>
      <SettLineGrid label="Line">
        <LineCluster
          color={style.color}
          opacity={style.opacity}
          lineStyle={style.lineStyle}
          width={style.width}
          hideDash={!showDash(type)}
          widthPresets={settings.widthPresets}
          showEp={showEndpoints(type)}
          leftCap={leftCap}
          rightCap={rightCap}
          openKey={openKey}
          onOpenKey={setOpenKey}
          onColor={(p) => {
            const next: Partial<DrawingStyle> = {};
            if (p.color) {
              next.color = p.color;
              if (style.fillColor === style.color) next.fillColor = p.color;
            }
            if (p.opacity != null) next.opacity = p.opacity;
            patchStyle(next);
          }}
          onStyle={(lineStyle) => patchStyle({ lineStyle })}
          onWidth={(width) => patchStyle({ width })}
          onLeftCap={(c) => setCap('left', c)}
          onRightCap={(c) => setCap('right', c)}
        />
      </SettLineGrid>

      {showExtendChips(type) && (
        <ExtendRow style={style} patchStyle={patchStyle} />
      )}

      <LabelsRow type={type} style={style} patchStyle={patchStyle} />

      {showInfoRow(type) && (
        <SettRow
          label={
            <SettCheckbox
              checked={style.showInfo}
              onChange={(showInfo) => patchStyle({ showInfo })}
              label="Show Info"
            />
          }
        >
          <div
            style={{
              opacity: style.showInfo ? 1 : 0.38,
              pointerEvents: style.showInfo ? 'auto' : 'none',
            }}
          >
            <SettInfoMetricsDropdown
              selected={style.infoMetrics ?? []}
              open={openKey === 'info'}
              onOpenChange={(o) => setOpenKey(o ? 'info' : null)}
              onChange={(infoMetrics) => patchStyle({ infoMetrics })}
              disabled={!style.showInfo}
            />
          </div>
        </SettRow>
      )}

      {settings.styleSections.includes('lineExtras') &&
        type !== 'brush' &&
        type !== 'highlighter' && (
          <SettRow
            label={
              <SettCheckbox
                checked={style.showMidpoint}
                onChange={(showMidpoint) => patchStyle({ showMidpoint })}
                label="Midpoint"
              />
            }
          />
        )}

      {showBackground(type) && (
        <SettRow
          label={
            <SettCheckbox
              checked={style.fill}
              onChange={(fill) => patchStyle({ fill })}
              label="Background"
            />
          }
        >
          <div
            style={{
              opacity: style.fill ? 1 : 0.38,
              pointerEvents: style.fill ? 'auto' : 'none',
            }}
          >
            <SettColorSwatch
              color={style.fillColor || style.color}
              opacity={style.fillOpacity}
              onChange={(p) => {
                const next: Partial<DrawingStyle> = {};
                if (p.color) next.fillColor = p.color;
                if (p.opacity != null) next.fillOpacity = p.opacity;
                patchStyle(next);
              }}
            />
          </div>
        </SettRow>
      )}
    </>
  );
}
