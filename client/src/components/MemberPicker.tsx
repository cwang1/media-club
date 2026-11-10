import { useState } from 'react';
import { api } from '../api';
import type { Member } from '../types';
import { Avatar, Modal } from './ui';

export function MemberPicker({
  members,
  currentId,
  onPick,
  onClose,
  onMemberAdded,
}: {
  members: Member[];
  currentId: number | null;
  onPick: (id: number) => void;
  onClose?: () => void;
  onMemberAdded: (m: Member) => void;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const m = await api.addMember(name.trim());
      onMemberAdded(m);
      onPick(m.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Who's watching?" onClose={onClose ?? (() => {})}>
      <p className="muted">Pick your name so suggestions and reviews are credited to you.</p>
      <ul className="member-list">
        {members.map((m) => (
          <li key={m.id}>
            <button className={`member-choice ${m.id === currentId ? 'active' : ''}`} onClick={() => onPick(m.id)}>
              <Avatar name={m.name} color={m.color} size={36} />
              <span>{m.name}</span>
              {m.id === currentId && <span className="pill">You</span>}
            </button>
          </li>
        ))}
      </ul>
      <form className="inline-form" onSubmit={add}>
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
