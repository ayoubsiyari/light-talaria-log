import {
  asBool,
  asNumber,
  type ToolPanelId,
} from '@/drawings/toolSettings';
import { getTool, type DrawingToolId } from '@/drawings/toolRegistry';
import { FibLevelsEditor } from './FibLevelsEditor';
import { fieldClass, Row, SectionTitle, ToggleRow } from './SettingsForm';

interface ToolInputsPanelProps {
  type: DrawingToolId;
  panel: ToolPanelId;
  meta: Record<string, unknown>;
  onMetaChange: (partial: Record<string, unknown>) => void;
}

/**
 * Per-tool Inputs body — same field chrome, different controls by panel.
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
        <FibLevelsEditor type={type} meta={meta} onMetaChange={onMetaChange} />
      );

    case 'line':
      return (
        <div className="space-y-3">
          <SectionTitle>{tool.label} inputs</SectionTitle>
          <ToggleRow
            label="Show angle"
            checked={asBool(meta.showAngle, false)}
            onChange={(v) => set({ showAngle: v })}
          />
          <p className="text-xs text-muted">
            Extend, midpoint, and end caps are under Style.
          </p>
        </div>
      );

    case 'channel':
      return (
        <div className="space-y-3">
          <SectionTitle>Channel</SectionTitle>
          <ToggleRow
            label="Show midline"
            checked={asBool(meta.showMidline, true)}
            onChange={(v) => set({ showMidline: v })}
          />
        </div>
      );

    case 'pitchfork':
      return (
        <div className="space-y-3">
          <SectionTitle>Pitchfork</SectionTitle>
          <ToggleRow
            label="Show median"
            checked={asBool(meta.showMedian, true)}
            onChange={(v) => set({ showMedian: v })}
          />
        </div>
      );

    case 'gann':
      return (
        <div className="space-y-3">
          <SectionTitle>Gann</SectionTitle>
          <ToggleRow
            label="Show fan"
            checked={asBool(meta.showFan, true)}
            onChange={(v) => set({ showFan: v })}
          />
          <Row label="Subdivisions">
            <input
              type="number"
              min={2}
              max={16}
              value={asNumber(meta.subdivisions, 4)}
              onChange={(e) => set({ subdivisions: Number(e.target.value) || 4 })}
              className={`${fieldClass} w-20`}
            />
          </Row>
        </div>
      );

    case 'brush':
      return (
        <div className="space-y-3">
          <SectionTitle>Brush</SectionTitle>
          <ToggleRow
            label="Soft edge"
            checked={asBool(meta.softEdge, type === 'highlighter')}
            onChange={(v) => set({ softEdge: v })}
          />
          <p className="text-xs text-muted">Stroke width and color are under Style.</p>
        </div>
      );

    case 'arrow':
      return (
        <div className="space-y-3">
          <SectionTitle>Arrow</SectionTitle>
          <ToggleRow
            label="Show label"
            checked={asBool(meta.showLabel, false)}
            onChange={(v) => set({ showLabel: v })}
          />
        </div>
      );

    case 'shape':
      return (
        <div className="space-y-3">
          <SectionTitle>Shape</SectionTitle>
          <ToggleRow
            label="Show center"
            checked={asBool(meta.showCenter, false)}
            onChange={(v) => set({ showCenter: v })}
          />
          <p className="text-xs text-muted">Fill options are under Style when available.</p>
        </div>
      );

    case 'text':
      return (
        <div className="space-y-3">
          <SectionTitle>Text tool</SectionTitle>
          <ToggleRow
            label="Bold"
            checked={asBool(meta.bold, false)}
            onChange={(v) => set({ bold: v })}
          />
          <p className="text-xs text-muted">Edit the label content under the Text tab.</p>
        </div>
      );

    case 'pattern':
      return (
        <div className="space-y-3">
          <SectionTitle>Pattern</SectionTitle>
          <ToggleRow
            label="Show ratios"
            checked={asBool(meta.showRatios, true)}
            onChange={(v) => set({ showRatios: v })}
          />
        </div>
      );

    case 'elliott':
      return (
        <div className="space-y-3">
          <SectionTitle>Elliott</SectionTitle>
          <ToggleRow
            label="Show wave labels"
            checked={asBool(meta.showLabels, true)}
            onChange={(v) => set({ showLabels: v })}
          />
        </div>
      );

    case 'cycles':
      return (
        <div className="space-y-3">
          <SectionTitle>Cycles</SectionTitle>
          <Row label="Periods">
            <input
              type="number"
              min={2}
              max={64}
              value={asNumber(meta.periods, 8)}
              onChange={(e) => set({ periods: Number(e.target.value) || 8 })}
              className={`${fieldClass} w-20`}
            />
          </Row>
        </div>
      );

    case 'position':
      return (
        <div className="space-y-3">
          <SectionTitle>{tool.label}</SectionTitle>
          <Row label="Risk / reward">
            <input
              type="number"
              min={0.1}
              max={20}
              step={0.1}
              value={asNumber(meta.riskReward, 2)}
              onChange={(e) => set({ riskReward: Number(e.target.value) || 2 })}
              className={`${fieldClass} w-24`}
            />
          </Row>
          <Row label="Account">
            <input
              type="number"
              min={100}
              step={100}
              value={asNumber(meta.accountSize, 10_000)}
              onChange={(e) => set({ accountSize: Number(e.target.value) || 10_000 })}
              className={`${fieldClass} w-28`}
            />
          </Row>
          <Row label="Risk %">
            <input
              type="number"
              min={0.1}
              max={100}
              step={0.1}
              value={asNumber(meta.riskPercent, 1)}
              onChange={(e) => set({ riskPercent: Number(e.target.value) || 1 })}
              className={`${fieldClass} w-24`}
            />
          </Row>
          <Row label="Lots (0=auto)">
            <input
              type="number"
              min={0}
              step={0.01}
              value={asNumber(meta.lots, 0)}
              onChange={(e) => set({ lots: Number(e.target.value) || 0 })}
              className={`${fieldClass} w-24`}
            />
          </Row>
          <ToggleRow
            label="Show prices"
            checked={asBool(meta.showPrices, true)}
            onChange={(v) => set({ showPrices: v })}
          />
          <ToggleRow
            label="Show quantity"
            checked={asBool(meta.showQty, true)}
            onChange={(v) => set({ showQty: v })}
          />
          <ToggleRow
            label="Show P&L at target"
            checked={asBool(meta.showPnl, true)}
            onChange={(v) => set({ showPnl: v })}
          />
        </div>
      );

    case 'volumeProfile':
      return (
        <div className="space-y-3">
          <SectionTitle>Volume profile</SectionTitle>
          <Row label="Row size">
            <input
              type="number"
              min={8}
              max={64}
              value={asNumber(meta.rows, 24)}
              onChange={(e) => set({ rows: Number(e.target.value) || 24 })}
              className={`${fieldClass} w-20`}
            />
          </Row>
          <Row label="Value area %">
            <input
              type="number"
              min={50}
              max={100}
              value={asNumber(meta.valueAreaPct, 70)}
              onChange={(e) => set({ valueAreaPct: Number(e.target.value) || 70 })}
              className={`${fieldClass} w-20`}
            />
          </Row>
          <ToggleRow
            label="Develop right"
            checked={asBool(meta.developRight, true)}
            onChange={(v) => set({ developRight: v })}
          />
        </div>
      );

    case 'vwap':
      return (
        <div className="space-y-3">
          <SectionTitle>Anchored VWAP</SectionTitle>
          <ToggleRow
            label="Show bands"
            checked={asBool(meta.showBands, false)}
            onChange={(v) => set({ showBands: v })}
          />
          <Row label="Band mult">
            <input
              type="number"
              min={0.5}
              max={4}
              step={0.1}
              value={asNumber(meta.bandMult, 1)}
              onChange={(e) => set({ bandMult: Number(e.target.value) || 1 })}
              className={`${fieldClass} w-20`}
            />
          </Row>
        </div>
      );

    case 'measure':
      return (
        <div className="space-y-3">
          <SectionTitle>Measure</SectionTitle>
          <ToggleRow
            label="Show stats"
            checked={asBool(meta.showStats, true)}
            onChange={(v) => set({ showStats: v })}
          />
          <ToggleRow
            label="Show angle"
            checked={asBool(meta.showAngle, false)}
            onChange={(v) => set({ showAngle: v })}
          />
        </div>
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
