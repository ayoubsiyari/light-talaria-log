import { useState, type FormEvent } from 'react';

interface PlaybookPanelProps {
  setups: string[];
  onAdd: (name: string) => Promise<void>;
  onRemove: (name: string) => Promise<void>;
}

export function PlaybookPanel({ setups, onAdd, onRemove }: PlaybookPanelProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name the setup.');
      return;
    }
    setError(null);
    void onAdd(trimmed).then(() => setName(''));
  };

  return (
    <div className="jd-stack">
      <h2>Playbook</h2>
      <p className="jd-muted">
        Setups you type here show up on the trade form. Tag tickets with the same name so the
        mentor can tell which play is paying.
      </p>
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
        <input
          className="jd-field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Opening range break"
        />
        <button type="submit" className="jd-btn jd-btn-ink shrink-0">
          Add setup
        </button>
      </form>
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {setups.length === 0 ? (
        <p className="jd-muted">No setups yet. Add the one you actually trade.</p>
      ) : (
        <ul className="jd-fold">
          {setups.map((s) => (
            <li key={s} className="flex items-center gap-3" style={{ minHeight: 52 }}>
              <span className="flex-1 font-medium">{s}</span>
              <button
                type="button"
                className="jd-btn jd-btn-ghost"
                onClick={() => void onRemove(s)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
