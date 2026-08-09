import {
  asBool,
  asNumber,
  type ToolPanelId,
} from '@/drawings/toolSettings';
import { getTool, type DrawingToolId } from '@/drawings/toolRegistry';
import { FibLevelsEditor } from './FibLevelsEditor';
import { fieldClass, Row, SectionTitle } from './SettingsForm';
import {
  SettCheckbox,
  SettRow,
  SettSec,
} from './obsidian/SettCheckbox';

interface ToolInputsPanelProps {
  type: DrawingToolId;
  panel: ToolPanelId;
  meta: Record<string, unknown>;
  onMetaChange: (partial: Record<string, unknown>) => void;
}

function NumField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  width = 80,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  width?: number;
}) {
  return (
    <SettRow label={label}>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || value)}
        className={`${fieldClass} tabular-nums`}
        style={{ width, minHeight: 32, height: 32 }}
      />
    </SettRow>
  );
}

/**
 * Per-tool Inputs body — V9-like fields with defaults for all major panels.
 */
export function ToolInputsPanel({
  type,
  panel,
  meta,
  onMetaChange,
}: ToolInputsPanelProps) {
  const tool = getTool(type);
  const set = (partial: Record<string, unknown>) => onMetaChange(partial);

  switch (panel) {
    case 'fibLevels':
      return (
        <>
          <FibLevelsEditor type={type} meta={meta} onMetaChange={onMetaChange} />
          <SettSec>Options</SettSec>
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.showLabels, true)}
                onChange={(showLabels) => set({ showLabels })}
                label="Show labels"
              />
            }
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.showPrices, false)}
                onChange={(showPrices) => set({ showPrices })}
                label="Show prices"
              />
            }
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.reverse, false)}
                onChange={(reverse) => set({ reverse })}
                label="Reverse"
              />
            }
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.showZones, false)}
                onChange={(showZones) => set({ showZones })}
                label="Background zones"
              />
            }
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.extendLeft, false)}
                onChange={(extendLeft) => set({ extendLeft })}
                label="Extend left"
              />
            }
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.extendRight, false)}
                onChange={(extendRight) => set({ extendRight })}
                label="Extend right"
              />
            }
          />
          <NumField
            label="Trend line width"
            value={asNumber(meta.trendWidth, 1)}
            min={1}
            max={4}
            onChange={(trendWidth) => set({ trendWidth })}
          />
        </>
      );

    case 'line':
      return (
        <>
          <SettSec>{tool.label}</SettSec>
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.showAngle, type === 'trendAngle' || type === 'infoLine')}
                onChange={(showAngle) => set({ showAngle })}
                label="Show angle"
              />
            }
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.alwaysShowStats, false)}
                onChange={(alwaysShowStats) => set({ alwaysShowStats })}
                label="Always show stats"
              />
            }
          />
          <p className="text-xs text-muted px-1">
            Extend, midpoint, and end caps are under Style.
          </p>
        </>
      );

    case 'channel':
      return (
        <>
          <SettSec>Channel</SettSec>
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.showMidline, true)}
                onChange={(showMidline) => set({ showMidline })}
                label="Show midline"
              />
            }
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.extendLeft, false)}
                onChange={(extendLeft) => set({ extendLeft })}
                label="Extend left"
              />
            }
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.extendRight, true)}
                onChange={(extendRight) => set({ extendRight })}
                label="Extend right"
              />
            }
          />
          <NumField
            label="Upper deviation"
            value={asNumber(meta.upperDev, 2)}
            min={0}
            max={10}
            step={0.1}
            onChange={(upperDev) => set({ upperDev })}
          />
          <NumField
            label="Lower deviation"
            value={asNumber(meta.lowerDev, 2)}
            min={0}
            max={10}
            step={0.1}
            onChange={(lowerDev) => set({ lowerDev })}
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.showPearsonR, false)}
                onChange={(showPearsonR) => set({ showPearsonR })}
                label="Pearson R"
              />
            }
          />
          <Row label="Source">
            <select
              value={String(meta.source ?? 'Close')}
              onChange={(e) => set({ source: e.target.value })}
              className={fieldClass}
            >
              {['Open', 'High', 'Low', 'Close', 'HL2', 'HLC3', 'OHLC4'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Row>
        </>
      );

    case 'pitchfork':
      return (
        <>
          <SettSec>Pitchfork</SettSec>
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.showMedian, true)}
                onChange={(showMedian) => set({ showMedian })}
                label="Show median"
              />
            }
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.extendLeft, false)}
                onChange={(extendLeft) => set({ extendLeft })}
                label="Extend left"
              />
            }
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.extendRight, true)}
                onChange={(extendRight) => set({ extendRight })}
                label="Extend right"
              />
            }
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.fillBackground, false)}
                onChange={(fillBackground) => set({ fillBackground })}
                label="Fill background"
              />
            }
          />
          <NumField
            label="Fill opacity"
            value={asNumber(meta.fillOpacity, 0.15)}
            min={0.05}
            max={1}
            step={0.05}
            onChange={(fillOpacity) => set({ fillOpacity })}
          />
        </>
      );

    case 'gann':
      return (
        <>
          <SettSec>Gann</SettSec>
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.showFan, true)}
                onChange={(showFan) => set({ showFan })}
                label="Show fan"
              />
            }
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.showLabels, true)}
                onChange={(showLabels) => set({ showLabels })}
                label="Show labels"
              />
            }
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.showAngles, false)}
                onChange={(showAngles) => set({ showAngles })}
                label="Show angles"
              />
            }
          />
          <NumField
            label="Subdivisions"
            value={asNumber(meta.subdivisions, 4)}
            min={2}
            max={16}
            onChange={(subdivisions) => set({ subdivisions })}
          />
          <NumField
            label="Price/Bar ratio"
            value={asNumber(meta.priceBarRatio, 1)}
            min={0.01}
            max={100}
            step={0.01}
            onChange={(priceBarRatio) => set({ priceBarRatio })}
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.reverse, false)}
                onChange={(reverse) => set({ reverse })}
                label="Reverse"
              />
            }
          />
        </>
      );

    case 'brush':
      return (
        <>
          <SettSec>Brush</SettSec>
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.softEdge, type === 'highlighter')}
                onChange={(softEdge) => set({ softEdge })}
                label="Soft edge"
              />
            }
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.smooth, true)}
                onChange={(smooth) => set({ smooth })}
                label="Smooth path"
              />
            }
          />
          <NumField
            label="Smoothing"
            value={asNumber(meta.smoothing, 0.5)}
            min={0}
            max={1}
            step={0.05}
            onChange={(smoothing) => set({ smoothing })}
          />
          <p className="text-xs text-muted px-1">
            Stroke width and color are under Style.
          </p>
        </>
      );

    case 'arrow':
      return (
        <>
          <SettSec>Arrow</SettSec>
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.showLabel, false)}
                onChange={(showLabel) => set({ showLabel })}
                label="Show label"
              />
            }
          />
        </>
      );

    case 'shape':
      return (
        <>
          <SettSec>Shape</SettSec>
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.showCenter, false)}
                onChange={(showCenter) => set({ showCenter })}
                label="Show center"
              />
            }
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.lockAspect, false)}
                onChange={(lockAspect) => set({ lockAspect })}
                label="Lock aspect"
              />
            }
          />
        </>
      );

    case 'text':
      return (
        <>
          <SettSec>Text tool</SettSec>
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.bold, false)}
                onChange={(bold) => set({ bold })}
                label="Bold"
              />
            }
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.wrap, true)}
                onChange={(wrap) => set({ wrap })}
                label="Word wrap"
              />
            }
          />
          <p className="text-xs text-muted px-1">
            Edit the label content under the Text tab.
          </p>
        </>
      );

    case 'pattern':
      return (
        <>
          <SettSec>Pattern</SettSec>
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.showRatios, true)}
                onChange={(showRatios) => set({ showRatios })}
                label="Show ratios"
              />
            }
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.showLabels, true)}
                onChange={(showLabels) => set({ showLabels })}
                label="Show labels"
              />
            }
          />
        </>
      );

    case 'elliott':
      return (
        <>
          <SettSec>Elliott</SettSec>
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.showLabels, true)}
                onChange={(showLabels) => set({ showLabels })}
                label="Show wave labels"
              />
            }
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.showDegree, false)}
                onChange={(showDegree) => set({ showDegree })}
                label="Show degree"
              />
            }
          />
        </>
      );

    case 'cycles':
      return (
        <>
          <SettSec>Cycles</SettSec>
          <NumField
            label="Periods"
            value={asNumber(meta.periods, 8)}
            min={2}
            max={64}
            onChange={(periods) => set({ periods })}
          />
        </>
      );

    case 'position':
      return (
        <>
          <SettSec>{tool.label}</SettSec>
          <NumField
            label="Risk / reward"
            value={asNumber(meta.riskReward, 2)}
            min={0.1}
            max={20}
            step={0.1}
            width={96}
            onChange={(riskReward) => set({ riskReward })}
          />
          <NumField
            label="Account"
            value={asNumber(meta.accountSize, 10_000)}
            min={100}
            step={100}
            width={112}
            onChange={(accountSize) => set({ accountSize })}
          />
          <NumField
            label="Risk %"
            value={asNumber(meta.riskPercent, 1)}
            min={0.1}
            max={100}
            step={0.1}
            width={96}
            onChange={(riskPercent) => set({ riskPercent })}
          />
          <NumField
            label="Lots (0=auto)"
            value={asNumber(meta.lots, 0)}
            min={0}
            step={0.01}
            width={96}
            onChange={(lots) => set({ lots })}
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.showPrices, true)}
                onChange={(showPrices) => set({ showPrices })}
                label="Show prices"
              />
            }
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.showQty, true)}
                onChange={(showQty) => set({ showQty })}
                label="Show quantity"
              />
            }
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.showPnl, true)}
                onChange={(showPnl) => set({ showPnl })}
                label="Show P&L at target"
              />
            }
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.showTicks, false)}
                onChange={(showTicks) => set({ showTicks })}
                label="Show ticks"
              />
            }
          />
        </>
      );

    case 'volumeProfile':
      return (
        <>
          <SettSec>Volume profile</SettSec>
          <NumField
            label="Row size"
            value={asNumber(meta.rows, 24)}
            min={8}
            max={64}
            onChange={(rows) => set({ rows })}
          />
          <NumField
            label="Value area %"
            value={asNumber(meta.valueAreaPct, 70)}
            min={50}
            max={100}
            onChange={(valueAreaPct) => set({ valueAreaPct })}
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.developRight, true)}
                onChange={(developRight) => set({ developRight })}
                label="Develop right"
              />
            }
          />
        </>
      );

    case 'vwap':
      return (
        <>
          <SettSec>Anchored VWAP</SettSec>
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.showBands, false)}
                onChange={(showBands) => set({ showBands })}
                label="Show bands"
              />
            }
          />
          <NumField
            label="Band mult"
            value={asNumber(meta.bandMult, 1)}
            min={0.5}
            max={4}
            step={0.1}
            onChange={(bandMult) => set({ bandMult })}
          />
        </>
      );

    case 'measure':
      return (
        <>
          <SettSec>Measure</SettSec>
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.showStats, true)}
                onChange={(showStats) => set({ showStats })}
                label="Show stats"
              />
            }
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.showAngle, false)}
                onChange={(showAngle) => set({ showAngle })}
                label="Show angle"
              />
            }
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.showDistance, true)}
                onChange={(showDistance) => set({ showDistance })}
                label="Show distance"
              />
            }
          />
          <SettRow
            label={
              <SettCheckbox
                checked={asBool(meta.showVolume, false)}
                onChange={(showVolume) => set({ showVolume })}
                label="Show volume"
              />
            }
          />
        </>
      );

    default:
      return (
        <div className="space-y-2">
          <SectionTitle>{tool.label}</SectionTitle>
          <p className="text-sm text-muted">
            No extra inputs for this tool. Adjust Style, Text, Coordinates, and Visibility
            tabs.
          </p>
        </div>
      );
  }
}
