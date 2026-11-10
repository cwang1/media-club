import { useEffect, useState } from 'react';
import { api } from '../api';
import { STATUSES, STATUS_LABEL, TYPE_ICON, TYPE_LABEL, runtimeLabel, timeAgo } from '../format';
import type { ItemDetail, Member, Status } from '../types';
import { Avatar, Modal, StarDisplay, StarInput } from './ui';

export function ItemDetailModal({
  itemId,
  me,
  refreshKey,
  onClose,
  onChanged,
  onError,
  onEdit,
  onSkip,
  onNeedMember,
}: {
  itemId: number;
  me: Member | null;
  refreshKey: number;
  onClose: () => void;
  onChanged: (msg?: string) => void;
  onError: (e: unknown) => void;
  onEdit: (item: ItemDetail) => void;
  onSkip: (item: ItemDetail) => void;
  onNeedMember: () => void;
}) {
  const [item, setItem] = useState<ItemDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api
      .item(itemId)
      .then((d) => live && setItem(d))
      .catch((e: Error) => live && setLoadError(e.message));
    return () => {
      live = false;
    };
  }, [itemId, refreshKey]);

  async function setStatus(status: Status) {
    if (!item || item.status === status) return;
    if (!me) {
      onNeedMember();
      return;
    }
    try {
      setItem(await api.updateItem(item.id, { status }));
      onChanged(`Moved to ${STATUS_LABEL[status]}`);
    } catch (e) {
      onError(e);
    }
  }

  if (loadError) {
    return (
      <Modal title="Couldn't load title" onClose={onClose}>
        <p className="error">{loadError}</p>
      </Modal>
    );
  }
  if (!item) {
    return (
      <Modal title="Loading…" onClose={onClose}>
        <p className="muted">Loading…</p>
      </Modal>
    );
  }

  const rt = runtimeLabel(item.type, item.runtime);
  const mine = me ? item.reviews.find((r) => r.member_id === me.id) : undefined;
  const others = item.reviews.filter((r) => r.member_id !== me?.id);

  return (
    <Modal title={item.title} onClose={onClose} wide>
      <div className="detail-meta">
        <span className={`type-badge type-${item.type}`}>
          {TYPE_ICON[item.type]} {TYPE_LABEL[item.type]}
        </span>
        <span className="genre">{item.genre}</span>
        {rt && <span className="muted">{rt}</span>}
        {item.suggested_by_name && (
          <span className="by">
            <span className="muted small">suggested by</span>
            <Avatar name={item.suggested_by_name} color={item.suggested_by_color ?? '#777'} size={22} />
            <span className="small">{item.suggested_by_name}</span>
          </span>
        )}
      </div>

      {item.pitch && <blockquote className="pitch-full">{item.pitch}</blockquote>}

      <div className="status-steps" role="group" aria-label="Status">
        {STATUSES.map((s, i) => (
          <button
            key={s}
            className={`step ${item.status === s ? 'on' : ''} ${STATUSES.indexOf(item.status) > i ? 'past' : ''}`}
            aria-pressed={item.status === s}
            onClick={() => void setStatus(s)}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="detail-actions">
        <button className="btn ghost" onClick={() => onEdit(item)}>
          ✎ Edit details
        </button>
        <button className="btn ghost danger-text" onClick={() => onSkip(item)}>
          🗑 Skip this title
        </button>
      </div>

      <section className="reviews">
        <div className="reviews-head">
          <h3>Reviews</h3>
          {item.avg_stars != null && (
            <span className="rating">
              <StarDisplay value={item.avg_stars} />
              <strong>{item.avg_stars.toFixed(1)}</strong>
              <span className="muted small">group average</span>
            </span>
          )}
        </div>

        {me ? (
          <ReviewEditor
            key={`${item.id}-${me.id}-${mine?.updated_at ?? 'new'}`}
            itemId={item.id}
            me={me}
            existing={mine ? { stars: mine.stars, comment: mine.comment } : null}
            notFinished={item.status !== 'completed'}
            onSaved={(d, msg) => {
              setItem(d);
              onChanged(msg);
            }}
          />
        ) : (
          <p className="muted">
            <button className="link" onClick={onNeedMember}>
              Pick your name
            </button>{' '}
            to add a rating.
          </p>
        )}

        {others.length === 0 && !mine && <p className="muted empty-reviews">No reviews yet.</p>}
        <ul className="review-list">
          {others.map((r) => (
            <li key={r.id} className="review">
              <Avatar name={r.member_name} color={r.member_color} size={32} />
              <div>
                <div className="review-head">
                  <strong>{r.member_name}</strong>
                  {r.stars != null && <StarDisplay value={r.stars} size={14} />}
                  <span className="muted small">{timeAgo(r.updated_at)}</span>
                </div>
                {r.comment && <p>{r.comment}</p>}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </Modal>
  );
}

function ReviewEditor({
  itemId,
  me,
  existing,
  notFinished,
  onSaved,
}: {
  itemId: number;
  me: Member;
  existing: { stars: number | null; comment: string } | null;
  notFinished: boolean;
  onSaved: (d: ItemDetail, msg: string) => void;
}) {
  const [stars, setStars] = useState<number | null>(existing?.stars ?? null);
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = stars !== (existing?.stars ?? null) || comment.trim() !== (existing?.comment ?? '');
  const canSave = dirty && (stars != null || comment.trim() !== '');

  async function run(fn: () => Promise<ItemDetail>, msg: string) {
    setBusy(true);
    setError(null);
    try {
      onSaved(await fn(), msg);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="review-editor"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) void run(() => api.saveReview(itemId, me.id, { stars, comment: comment.trim() }), 'Review saved');
      }}
    >
      <div className="review-editor-head">
        <Avatar name={me.name} color={me.color} size={32} />
        <strong>Your take</strong>
        <StarInput value={stars} onChange={setStars} />
      </div>
      {notFinished && !existing && (
        <p className="hint small">Not finished yet? You can still leave first impressions.</p>
      )}
      <textarea
        aria-label="Your comment"
        rows={2}
        maxLength={1000}
        placeholder="What did you think?"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        {existing && (
          <button
            type="button"
            className="btn ghost danger-text"
            disabled={busy}
            onClick={() => void run(() => api.deleteReview(itemId, me.id), 'Review removed')}
          >
            Remove my review
          </button>
        )}
        <button className="btn primary" disabled={busy || !canSave}>
          {existing ? 'Update review' : 'Post review'}
        </button>
      </div>
    </form>
  );
}
