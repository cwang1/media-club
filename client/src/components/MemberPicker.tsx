import { useState } from 'react';
import { signInLink } from '../api';
import type { Member } from '../types';
import { Avatar, Modal } from './ui';

export function MemberPicker({
  members,
  me,
  onClaim,
  onJoin,
  onRelease,
  onClose,
}: {
  members: Member[];
  me: Member | null;
  onClaim: (id: number) => Promise<void>;
  onJoin: (name: string) => Promise<void>;
  onRelease: () => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function run(fn: () => Promise<void>, closeAfter = true) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (closeAfter) onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (me) {
    const link = signInLink() ?? '';
    return (
      <Modal title="You're in the club" onClose={onClose}>
        <div className="signed-in">
          <Avatar name={me.name} color={me.color} size={44} />
          <div>
            <strong>{me.name}</strong>
            <p className="muted small">Suggestions and reviews from this browser are credited to you.</p>
          </div>
        </div>

        <h3 className="picker-subhead">Use Media Club on another device</h3>
        <p className="muted small">
          Open this link on your phone or another computer. Keep it to yourself: anyone with it can post as you.
        </p>
        <div className="inline-form">
          <input readOnly value={link} aria-label="Your sign-in link" onFocus={(e) => e.target.select()} />
          <button
            className="btn"
            onClick={() => {
              void navigator.clipboard?.writeText(link).then(() => setCopied(true));
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div className="form-actions">
          <button className="btn ghost danger-text" disabled={busy} onClick={() => void run(onRelease, false)}>
            Not {me.name}? Give this profile back
          </button>
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </Modal>
    );
  }

  return (
    <Modal title="Who's watching?" onClose={onClose}>
      <p className="muted">Pick your name to claim your profile on this device.</p>
      <ul className="member-list">
        {members.map((m) => (
          <li key={m.id}>
            <button
              className="member-choice"
              disabled={busy || m.claimed}
              title={m.claimed ? 'Already in use on another device' : undefined}
              onClick={() => void run(() => onClaim(m.id))}
            >
              <Avatar name={m.name} color={m.color} size={36} />
              <span className="member-name">
                {m.name}
                {m.claimed && <small className="muted">On another device</small>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="muted small picker-note">
        Name greyed out but it's you? Open your sign-in link from the device you used before.
      </p>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void run(() => onJoin(name.trim()));
        }}
      >
        <label className="sr-only" htmlFor="new-member">
          New member name
        </label>
        <input
          id="new-member"
          placeholder="New to the club? Add your name"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn" disabled={busy || !name.trim()}>
          Join
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </Modal>
  );
}
