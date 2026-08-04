import { useCallback, useMemo, useState } from 'react';
import { Button, Card, Label } from '@heroui/react';
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
import {
  emptyCanvas,
  saveStrategy,
  type StrategyRecord,
} from '@/strategy/strategyStore';

const MARKETS = ['Forex', 'Futures', 'Crypto', 'Stocks'] as const;
const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1D'] as const;

function SectionNode({ data }: NodeProps<{ label: string; kind?: string }>) {
  return (
    <div className="min-w-[140px] rounded-md border border-border bg-surface px-3 py-2 shadow-sm">
      <Handle type="target" position={Position.Left} className="!bg-accent !w-2 !h-2" />
      <p className="text-[10px] uppercase tracking-wide text-muted">{data.kind ?? 'section'}</p>
      <p className="text-sm font-semibold text-foreground">{data.label}</p>
      <Handle type="source" position={Position.Right} className="!bg-accent !w-2 !h-2" />
    </div>
  );
}

function ConditionNode({ data }: NodeProps<{ label: string }>) {
  return (
    <div className="min-w-[120px] rounded-md border border-accent/40 bg-accent/10 px-3 py-2">
      <Handle type="target" position={Position.Left} className="!bg-accent !w-2 !h-2" />
      <p className="text-xs font-medium text-foreground">{data.label}</p>
      <Handle type="source" position={Position.Right} className="!bg-accent !w-2 !h-2" />
    </div>
  );
}

const nodeTypes = { section: SectionNode, condition: ConditionNode };

interface StrategyBuilderModalProps {
  edit?: StrategyRecord | null;
  onClose: () => void;
  onSaved: (s: StrategyRecord) => void;
}

function BuilderInner({ edit, onClose, onSaved }: StrategyBuilderModalProps) {
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

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, type: 'default' }, eds)),
    [setEdges],
  );

  const step1Ok = name.trim().length > 0 && markets.length > 0 && timeframes.length > 0;

  const toggle = (list: string[], v: string, set: (n: string[]) => void) => {
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  };

  const addCondition = () => {
    const id = `cond-${Date.now()}`;
    setNodes((ns) => [
      ...ns,
      {
        id,
        type: 'condition',
        position: { x: 240, y: 40 + ns.length * 36 },
        data: { label: `Condition ${ns.filter((n) => n.type === 'condition').length + 1}` },
      },
    ]);
  };

  const handleSave = () => {
    if (!step1Ok) {
      setError('Name, markets, and timeframes are required.');
      setStep(1);
      return;
    }
    setSaving(true);
    try {
      const saved = saveStrategy({
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
      onSaved(saved);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const steps = useMemo(
    () => [
      { id: 1, label: 'General Info' },
      { id: 2, label: 'Strategy Flow' },
      { id: 3, label: 'Trade Tags' },
      { id: 4, label: 'Review' },
    ],
    [],
  );

  return (
    <div className="fixed inset-0 z-[100010] flex items-center justify-center bg-background/80 p-2 sm:p-4">
      <div className="w-full max-w-[1400px] h-[min(90vh,880px)] flex flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-xl">
        <header className="shrink-0 flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[color:var(--tv-panel-line)]">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Strategy Builder</p>
            <h2 className="text-lg font-semibold truncate">
              {initial ? 'Edit strategy' : 'New strategy'}
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

        <div className="flex-1 min-h-0 overflow-auto p-4">
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
                  placeholder="Momentum Breakout"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <textarea
                  className={`${fieldClass} min-h-24`}
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="Rules, sessions, risk notes…"
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
            <div className="h-[min(56vh,520px)] flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" className="min-h-11" onPress={addCondition}>
                  Add condition
                </Button>
                <p className="text-xs text-muted self-center">
                  Drag nodes · connect handles · Entry → Exit flow
                </p>
              </div>
              <div className="flex-1 min-h-0 rounded-md border border-border overflow-hidden bg-background">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  nodeTypes={nodeTypes}
                  fitView
                  proOptions={{ hideAttribution: true }}
                >
                  <Background gap={18} size={1} />
                  <MiniMap pannable zoomable className="!bg-surface" />
                  <Controls />
                </ReactFlow>
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
                <Row label="Variables" value={String(variables.length)} />
                <Row label="Canvas nodes" value={String(nodes.length)} />
                <Row label="Edges" value={String(edges.length)} />
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
              <Button
                variant="primary"
                className="min-h-11"
                isDisabled={saving}
                onPress={handleSave}
              >
                {saving ? 'Saving…' : 'Save strategy'}
              </Button>
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

function ChipToggle({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'min-h-11 px-3 rounded-md text-sm border',
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

// silence unused Edge/Node type imports if tree-shaken oddly
export type { Edge, Node };
