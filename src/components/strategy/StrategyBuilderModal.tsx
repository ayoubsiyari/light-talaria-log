import { useCallback, useMemo, useState } from 'react';
import { Button, Card, Label, toast } from '@heroui/react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { compileGraph } from '@/strategy/compileGraph';
import {
  createPieceData,
  getPieceDef,
  isLogicKind,
  PIECE_CATEGORIES,
  PIECE_REGISTRY,
  type PieceDefinition,
} from '@/strategy/pieceRegistry';
import {
  isPieceData,
  type PieceNodeData,
  type PieceKind,
} from '@/strategy/graphTypes';
import { STARTER_PUZZLES } from '@/strategy/starterPuzzles';
import {
  emptyCanvas,
  saveStrategy,
  type StrategyRecord,
} from '@/strategy/strategyStore';
import type { Timeframe } from '@/types/ui';

const MARKETS = ['Forex', 'Futures', 'Crypto', 'Stocks'] as const;
const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1D'] as const;

function SectionNode({ data }: NodeProps<{ label: string; kind?: string }>) {
  return (
    <div className="min-w-[120px] rounded-md border border-border bg-surface px-3 py-2 shadow-sm">
      <Handle type="target" position={Position.Left} className="!bg-accent !w-2 !h-2" />
      <p className="text-[10px] uppercase tracking-wide text-muted">
        {data.kind ?? 'section'}
      </p>
      <p className="text-sm font-semibold text-foreground">{data.label}</p>
      <Handle type="source" position={Position.Right} className="!bg-accent !w-2 !h-2" />
    </div>
  );
}

function PieceNode({ data }: NodeProps<PieceNodeData>) {
  const logic = isLogicKind(data.pieceKind);
  const tf = data.requiredTimeframe;
  return (
    <div
      className={[
        'min-w-[128px] max-w-[180px] rounded-md border px-3 py-2 shadow-sm',
        logic
          ? 'border-border bg-surface'
          : 'border-accent/40 bg-accent/10',
      ].join(' ')}
    >
      <Handle type="target" position={Position.Left} className="!bg-accent !w-2 !h-2" />
      <div className="flex items-start justify-between gap-1">
        <p className="text-xs font-semibold text-foreground leading-snug">{data.label}</p>
        {tf && (
          <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-accent/20 text-accent">
            {tf}
          </span>
        )}
      </div>
      <p className="text-[10px] text-muted mt-0.5 capitalize">{data.pieceKind.replace(/_/g, ' ')}</p>
      <Handle type="source" position={Position.Right} className="!bg-accent !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { section: SectionNode, piece: PieceNode };

interface StrategyBuilderModalProps {
  edit?: StrategyRecord | null;
  onClose: () => void;
  onSaved: (s: StrategyRecord) => void;
  /** Run compiled puzzle on the open chart (optional). */
  onRunOnChart?: (strategyId: string) => void;
  chartTimeframe?: Timeframe | null;
  chartReady?: boolean;
}

function BuilderInner({
  edit,
  onClose,
  onSaved,
  onRunOnChart,
  chartTimeframe,
  chartReady,
}: StrategyBuilderModalProps) {
  const initial = edit ?? null;
  const blank = emptyCanvas();
  const [step, setStep] = useState(1);
  const [name, setName] = useState(initial?.name ?? '');
  const [desc, setDesc] = useState(initial?.desc ?? '');
  const [markets, setMarkets] = useState<string[]>(initial?.markets ?? ['Forex']);
  const [timeframes, setTimeframes] = useState<string[]>(
    initial?.timeframes ?? ['5m', '15m'],
  );
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagDraft, setTagDraft] = useState('');
  const [variables, setVariables] = useState(initial?.variables ?? []);
  const [nodes, setNodes, onNodesChange] = useNodesState(
    initial?.nodes?.length ? initial.nodes : blank.nodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    initial?.edges?.length ? initial.edges : blank.edges,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paletteFilter, setPaletteFilter] = useState('');
  const [paletteCat, setPaletteCat] = useState<string>('all');

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, type: 'default' }, eds)),
    [setEdges],
  );

  const step1Ok = name.trim().length > 0 && markets.length > 0 && timeframes.length > 0;

  const toggle = (list: string[], v: string, set: (n: string[]) => void) => {
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  };

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId],
  );
  const selectedPiece = selectedNode && isPieceData(selectedNode.data)
    ? selectedNode.data
    : null;

  const compile = useMemo(() => compileGraph(nodes, edges), [nodes, edges]);

  const addPiece = (kind: PieceKind) => {
    const id = `piece-${kind}-${Date.now()}`;
    const data = createPieceData(kind);
    setNodes((ns) => [
      ...ns,
      {
        id,
        type: 'piece',
        position: { x: 200 + (ns.length % 4) * 24, y: 40 + ns.length * 28 },
        data,
      },
    ]);
    setSelectedId(id);
  };

  const updateSelectedPiece = (patch: Partial<PieceNodeData>) => {
    if (!selectedId || !selectedPiece) return;
    setNodes((ns) =>
      ns.map((n) =>
        n.id === selectedId && isPieceData(n.data)
          ? { ...n, data: { ...n.data, ...patch, params: patch.params ?? n.data.params } }
          : n,
      ),
    );
  };

  const updateParam = (key: string, value: number | string | boolean) => {
    if (!selectedId || !selectedPiece) return;
    setNodes((ns) =>
      ns.map((n) =>
        n.id === selectedId && isPieceData(n.data)
          ? {
              ...n,
              data: {
                ...n.data,
                params: { ...n.data.params, [key]: value },
              },
            }
          : n,
      ),
    );
  };

  const loadStarter = (starterId: string) => {
    const s = STARTER_PUZZLES.find((p) => p.id === starterId);
    if (!s) return;
    setNodes(s.nodes);
    setEdges(s.edges);
    if (!name.trim()) setName(s.name);
    if (!desc.trim()) setDesc(s.description);
    setTimeframes(s.timeframes);
    setTags((t) => [...new Set([...t, ...s.tags])]);
    setSelectedId(null);
    toast.info('Starter puzzle loaded', {
      description: 'Edit pieces freely — nothing is locked.',
      timeout: 3500,
    });
  };

  const persist = (): StrategyRecord | null => {
    if (!step1Ok) {
      setError('Name, markets, and timeframes are required.');
      setStep(1);
      return null;
    }
    if (!compile.ok) {
      const msg =
        compile.issues.find((i) => i.level === 'error')?.message ??
        'Puzzle is incomplete.';
      setError(msg);
      setStep(2);
      return null;
    }
    return saveStrategy({
      id: initial?.id,
      name: name.trim(),
      desc: desc.trim(),
      markets,
      timeframes,
      tags,
      variables,
      nodes,
      edges,
    });
  };

  const handleSave = () => {
    setSaving(true);
    try {
      const saved = persist();
      if (!saved) return;
      onSaved(saved);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleRun = () => {
    const saved = persist();
    if (!saved) return;
    onSaved(saved);
    if (!chartReady || !onRunOnChart) {
      toast.info('Open a chart session to run', {
        description: 'Save works anytime. Run needs an active chart.',
        timeout: 4500,
      });
      return;
    }
    onRunOnChart(saved.id);
  };

  const filteredPieces = useMemo(() => {
    const q = paletteFilter.trim().toLowerCase();
    return PIECE_REGISTRY.filter((p) => {
      if (paletteCat !== 'all' && p.category !== paletteCat) return false;
      if (!q) return true;
      return (
        p.label.toLowerCase().includes(q) ||
        p.kind.includes(q) ||
        p.description.toLowerCase().includes(q)
      );
    });
  }, [paletteFilter, paletteCat]);

  const steps = useMemo(
    () => [
      { id: 1, label: 'General Info' },
      { id: 2, label: 'Puzzle' },
      { id: 3, label: 'Trade Tags' },
      { id: 4, label: 'Review' },
    ],
    [],
  );

  return (
    <div className="fixed inset-0 z-[100010] flex items-center justify-center bg-background/80 p-2 sm:p-4">
      <div className="w-full max-w-[1400px] h-[min(92vh,900px)] flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
        <header className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[color:var(--tv-panel-line)]">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">
              Strategy Builder
            </p>
            <h2 className="text-lg font-semibold truncate">
              {initial ? 'Edit puzzle' : 'New puzzle'}
            </h2>
          </div>
          <nav className="flex flex-wrap gap-1 ml-auto" aria-label="Wizard steps">
            {steps.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if (s.id > 1 && !step1Ok) {
                    setError('Complete General Info first.');
                    setStep(1);
                    return;
                  }
                  setStep(s.id);
                }}
                className={[
                  'min-h-11 sm:min-h-8 px-2.5 rounded-md text-xs font-semibold',
                  step === s.id
                    ? 'bg-accent/15 text-accent'
                    : 'text-muted hover:text-foreground hover:bg-background/70',
                ].join(' ')}
              >
                {s.id}. {s.label}
              </button>
            ))}
          </nav>
          <Button variant="ghost" size="sm" className="min-h-11 sm:min-h-8" onPress={onClose}>
            Close
          </Button>
        </header>

        <div className="flex-1 min-h-0 overflow-auto p-3 sm:p-4">
          {error && (
            <p className="text-sm text-danger mb-3" role="alert">
              {error}
            </p>
          )}

          {step === 1 && (
            <div className="max-w-2xl space-y-4">
              <div className="space-y-1.5">
                <Label>Strategy name *</Label>
                <input
                  className={fieldClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My puzzle"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <textarea
                  className={`${fieldClass} min-h-24`}
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="How the pieces fit together…"
                />
              </div>
              <div className="space-y-2">
                <Label>Markets *</Label>
                <div className="flex flex-wrap gap-2">
                  {MARKETS.map((m) => (
                    <ChipToggle
                      key={m}
                      active={markets.includes(m)}
                      label={m}
                      onClick={() => toggle(markets, m, setMarkets)}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Timeframes *</Label>
                <div className="flex flex-wrap gap-2">
                  {TIMEFRAMES.map((tf) => (
                    <ChipToggle
                      key={tf}
                      active={timeframes.includes(tf)}
                      label={tf}
                      onClick={() => toggle(timeframes, tf, setTimeframes)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="h-[min(62vh,580px)] flex flex-col gap-2 min-h-0">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-muted flex items-center gap-1.5">
                  Starter
                  <select
                    className="min-h-11 sm:min-h-8 rounded-md border border-border bg-background px-2 text-xs"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) loadStarter(e.target.value);
                      e.target.value = '';
                    }}
                  >
                    <option value="">Load example…</option>
                    {STARTER_PUZZLES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                {chartTimeframe && (
                  <span className="text-xs text-muted">
                    Chart TF: <span className="text-foreground font-medium">{chartTimeframe}</span>
                  </span>
                )}
                {!compile.ok && (
                  <span className="text-xs text-danger">
                    {compile.issues.find((i) => i.level === 'error')?.message}
                  </span>
                )}
              </div>

              <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[200px_1fr_200px] gap-2">
                {/* Palette */}
                <aside className="min-h-0 flex flex-col rounded-md border border-border bg-background overflow-hidden order-2 lg:order-1 max-h-[40vh] lg:max-h-none">
                  <div className="shrink-0 p-2 space-y-2 border-b border-[color:var(--tv-panel-line)]">
                    <p className="text-[10px] uppercase tracking-wide text-muted font-semibold">
                      Pieces
                    </p>
                    <input
                      className="w-full min-h-11 sm:min-h-8 rounded-md border border-border bg-surface px-2 text-xs"
                      placeholder="Search…"
                      value={paletteFilter}
                      onChange={(e) => setPaletteFilter(e.target.value)}
                    />
                    <div className="flex flex-wrap gap-1">
                      <ChipToggle
                        active={paletteCat === 'all'}
                        label="All"
                        onClick={() => setPaletteCat('all')}
                        compact
                      />
                      {PIECE_CATEGORIES.map((c) => (
                        <ChipToggle
                          key={c.id}
                          active={paletteCat === c.id}
                          label={c.label}
                          onClick={() => setPaletteCat(c.id)}
                          compact
                        />
                      ))}
                    </div>
                  </div>
                  <ul className="flex-1 overflow-y-auto p-1.5 space-y-1">
                    {filteredPieces.map((p) => (
                      <li key={p.kind}>
                        <PaletteItem def={p} onAdd={() => addPiece(p.kind)} />
                      </li>
                    ))}
                  </ul>
                </aside>

                {/* Canvas */}
                <div className="min-h-[240px] lg:min-h-0 rounded-md border border-border overflow-hidden bg-background order-1 lg:order-2">
                  <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onSelectionChange={({ nodes: sel }) => {
                      setSelectedId(sel[0]?.id ?? null);
                    }}
                    nodeTypes={nodeTypes}
                    fitView
                    proOptions={{ hideAttribution: true }}
                    deleteKeyCode={['Backspace', 'Delete']}
                  >
                    <Background gap={18} size={1} />
                    <MiniMap pannable zoomable className="!bg-surface !hidden sm:!block" />
                    <Controls />
                  </ReactFlow>
                </div>

                {/* Inspector */}
                <aside className="min-h-0 rounded-md border border-border bg-background overflow-y-auto p-2 space-y-2 order-3 max-h-[36vh] lg:max-h-none">
                  <p className="text-[10px] uppercase tracking-wide text-muted font-semibold">
                    Inspector
                  </p>
                  {!selectedPiece ? (
                    <p className="text-xs text-muted">
                      Select a piece to edit params and TF requirement.
                    </p>
                  ) : (
                    <PieceInspector
                      data={selectedPiece}
                      strategyTfs={timeframes}
                      chartTf={chartTimeframe ?? null}
                      onLabel={(label) => updateSelectedPiece({ label })}
                      onRequiredTf={(tf) =>
                        updateSelectedPiece({ requiredTimeframe: tf })
                      }
                      onParam={updateParam}
                    />
                  )}
                </aside>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="max-w-xl space-y-4">
              <div className="space-y-2">
                <Label>Strategy tags</Label>
                <div className="flex gap-2">
                  <input
                    className={fieldClass}
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    placeholder="e.g. London open"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && tagDraft.trim()) {
                        e.preventDefault();
                        setTags((t) => [...new Set([...t, tagDraft.trim()])]);
                        setTagDraft('');
                      }
                    }}
                  />
                  <Button
                    variant="secondary"
                    className="min-h-11 shrink-0"
                    onPress={() => {
                      if (!tagDraft.trim()) return;
                      setTags((t) => [...new Set([...t, tagDraft.trim()])]);
                      setTagDraft('');
                    }}
                  >
                    Add
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tags.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className="min-h-9 px-2.5 rounded-md text-xs bg-accent/15 text-accent"
                      onClick={() => setTags((list) => list.filter((x) => x !== t))}
                    >
                      {t} ×
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Trade tag variables</Label>
                <Button
                  size="sm"
                  variant="secondary"
                  className="min-h-11"
                  onPress={() =>
                    setVariables((v) => [
                      ...v,
                      {
                        id: `var-${Date.now()}`,
                        name: `Tag ${v.length + 1}`,
                        kind: v.length % 2 === 0 ? 'pre' : 'post',
                      },
                    ])
                  }
                >
                  Add variable
                </Button>
                <ul className="space-y-2">
                  {variables.map((v) => (
                    <li
                      key={v.id}
                      className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
                    >
                      <span className="text-xs text-muted uppercase w-12">{v.kind}</span>
                      <input
                        className={fieldClass}
                        value={v.name}
                        onChange={(e) =>
                          setVariables((list) =>
                            list.map((x) =>
                              x.id === v.id ? { ...x, name: e.target.value } : x,
                            ),
                          )
                        }
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-h-11"
                        onPress={() =>
                          setVariables((list) => list.filter((x) => x.id !== v.id))
                        }
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {step === 4 && (
            <Card className="bg-background border border-border max-w-xl">
              <Card.Content className="px-5 py-5 space-y-2 text-sm">
                <Row label="Name" value={name || '—'} />
                <Row label="Markets" value={markets.join(', ') || '—'} />
                <Row label="Timeframes" value={timeframes.join(', ') || '—'} />
                <Row label="Tags" value={tags.join(', ') || '—'} />
                <Row
                  label="Pieces"
                  value={String(nodes.filter((n) => n.type === 'piece').length)}
                />
                <Row label="Edges" value={String(edges.length)} />
                <Row
                  label="Puzzle"
                  value={compile.ok ? 'Ready to run' : 'Needs wiring'}
                />
                {compile.requiredTimeframes.length > 0 && (
                  <Row
                    label="Required TFs"
                    value={compile.requiredTimeframes.join(', ')}
                  />
                )}
                {desc && <p className="text-muted pt-2 whitespace-pre-wrap">{desc}</p>}
              </Card.Content>
            </Card>
          )}
        </div>

        <footer className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-3 border-t border-[color:var(--tv-panel-line)]">
          <Button
            variant="ghost"
            className="min-h-11"
            isDisabled={step <= 1}
            onPress={() => setStep((s) => Math.max(1, s - 1))}
          >
            Back
          </Button>
          <div className="ml-auto flex flex-wrap gap-2">
            {step === 2 && onRunOnChart && (
              <Button
                variant="secondary"
                className="min-h-11"
                isDisabled={!compile.ok}
                onPress={handleRun}
              >
                Run on chart
              </Button>
            )}
            {step < 4 ? (
              <Button
                variant="primary"
                className="min-h-11"
                onPress={() => {
                  if (step === 1 && !step1Ok) {
                    setError('Name, markets, and timeframes are required.');
                    return;
                  }
                  setError(null);
                  setStep((s) => Math.min(4, s + 1));
                }}
              >
                Next
              </Button>
            ) : (
              <>
                {onRunOnChart && (
                  <Button
                    variant="secondary"
                    className="min-h-11"
                    isDisabled={saving || !compile.ok}
                    onPress={handleRun}
                  >
                    Run on chart
                  </Button>
                )}
                <Button
                  variant="primary"
                  className="min-h-11"
                  isDisabled={saving}
                  onPress={handleSave}
                >
                  {saving ? 'Saving…' : 'Save strategy'}
                </Button>
              </>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

export function StrategyBuilderModal(props: StrategyBuilderModalProps) {
  return (
    <ReactFlowProvider>
      <BuilderInner {...props} />
    </ReactFlowProvider>
  );
}

const fieldClass =
  'w-full min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent';

function PaletteItem({
  def,
  onAdd,
}: {
  def: PieceDefinition;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="w-full text-left min-h-11 rounded-md border border-transparent hover:border-border hover:bg-surface px-2 py-1.5"
    >
      <span className="flex items-center justify-between gap-1">
        <span className="text-xs font-medium text-foreground">{def.shortLabel}</span>
        {def.defaultRequiredTimeframe && (
          <span className="text-[9px] font-bold text-accent uppercase">
            {def.defaultRequiredTimeframe}
          </span>
        )}
      </span>
      <span className="block text-[10px] text-muted line-clamp-2">{def.description}</span>
    </button>
  );
}

function PieceInspector({
  data,
  strategyTfs,
  chartTf,
  onLabel,
  onRequiredTf,
  onParam,
}: {
  data: PieceNodeData;
  strategyTfs: string[];
  chartTf: Timeframe | null;
  onLabel: (v: string) => void;
  onRequiredTf: (tf: Timeframe | null) => void;
  onParam: (key: string, value: number | string | boolean) => void;
}) {
  const def = getPieceDef(data.pieceKind);
  const req = data.requiredTimeframe ?? null;
  const tfWarn =
    req &&
    ((!strategyTfs.includes(req) ? `Not in strategy TFs` : null) ||
      (chartTf && chartTf !== req ? `Chart is ${chartTf}` : null));

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs">Label</Label>
        <input
          className={fieldClass}
          value={data.label}
          onChange={(e) => onLabel(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Required TF</Label>
        <select
          className={fieldClass}
          value={req ?? ''}
          onChange={(e) =>
            onRequiredTf((e.target.value || null) as Timeframe | null)
          }
        >
          <option value="">Any</option>
          {TIMEFRAMES.map((tf) => (
            <option key={tf} value={tf}>
              {tf}
            </option>
          ))}
        </select>
        {tfWarn && (
          <p className="text-[11px] text-danger" role="status">
            {tfWarn} — switch before Run, or clear requirement.
          </p>
        )}
      </div>
      {def?.params.map((field) => (
        <div key={field.key} className="space-y-1">
          <Label className="text-xs">{field.label}</Label>
          {field.type === 'number' ? (
            <input
              type="number"
              className={fieldClass}
              min={field.min}
              max={field.max}
              step={field.step ?? 1}
              value={Number(data.params[field.key] ?? def.defaults[field.key] ?? 0)}
              onChange={(e) => onParam(field.key, Number(e.target.value))}
            />
          ) : field.type === 'select' ? (
            <select
              className={fieldClass}
              value={String(data.params[field.key] ?? def.defaults[field.key] ?? '')}
              onChange={(e) => onParam(field.key, e.target.value)}
            >
              {(field.options ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <label className="flex items-center gap-2 min-h-11 text-sm">
              <input
                type="checkbox"
                checked={Boolean(data.params[field.key])}
                onChange={(e) => onParam(field.key, e.target.checked)}
              />
              {field.label}
            </label>
          )}
        </div>
      ))}
    </div>
  );
}

function ChipToggle({
  active,
  label,
  onClick,
  compact,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        compact ? 'min-h-8 px-2 text-[10px]' : 'min-h-11 px-3 text-sm',
        'rounded-md border',
        active
          ? 'bg-accent/15 text-accent border-accent/40'
          : 'bg-background text-muted border-border hover:text-foreground',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-[color:var(--tv-panel-line)] py-1.5 last:border-0">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

export type { Edge, Node };
