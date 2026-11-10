import { useState } from 'react';
import { RUNTIME_UNIT, TYPE_ICON, TYPE_LABEL } from '../format';
import type { Item, ItemInput, MediaType } from '../types';
import { Modal } from './ui';

const PITCH_MAX = 280;

export function ItemForm({
  initial,
  genres,
  onSave,
  onClose,
}: {
  initial?: Item;
  genres: string[];
  onSave: (input: ItemInput) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [type, setType] = useState<MediaType>(initial?.type ?? 'movie');
  const [genre, setGenre] = useState(initial?.genre ?? '');
  const [runtime, setRuntime] = useState(initial?.runtime?.toString() ?? '');
  const [pitch, setPitch] = useState(initial?.pitch ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const rt = runtime.trim() === '' ? null : Number(runtime);
    if (rt !== null && (!Number.isInteger(rt) || rt <= 0)) {
      setError('Length must be a whole number greater than 0.');
      return;
    }
    setBusy(true);
    try {
      await onSave({ title: title.trim(), type, genre: genre.trim(), runtime: rt, pitch: pitch.trim() });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={initial ? `Edit “${initial.title}”` : 'Suggest a title'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <fieldset className="segmented" aria-label="Type">
          {(['movie', 'show', 'book'] as MediaType[]).map((t) => (
            <label key={t} className={type === t ? 'on' : ''}>
              <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} />
              {TYPE_ICON[t]} {TYPE_LABEL[t]}
            </label>
          ))}
        </fieldset>

        <label className="field">
          <span>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} autoFocus />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Genre</span>
            <input
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              required
              maxLength={40}
              list="genre-options"
              placeholder="e.g. Sci-Fi"
            />
            <datalist id="genre-options">
              {genres.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>{RUNTIME_UNIT[type]}</span>
            <input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={runtime}
              onChange={(e) => setRuntime(e.target.value)}
              placeholder="optional"
            />
          </label>
        </div>

        <label className="field">
          <span>
            Pitch to the group{' '}
            <small className={pitch.length > PITCH_MAX ? 'error' : 'muted'}>
              {pitch.length}/{PITCH_MAX}
            </small>
          </span>
          <textarea
            value={pitch}
            onChange={(e) => setPitch(e.target.value)}
            rows={3}
            maxLength={PITCH_MAX}
            placeholder="Why should we pick this one?"
          />
        </label>

        {error && <p className="error">{error}</p>}

        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? 'Saving…' : initial ? 'Save changes' : 'Add to backlog'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
