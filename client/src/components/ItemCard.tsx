import { STATUSES, STATUS_LABEL, TYPE_ICON, TYPE_LABEL, runtimeLabel } from '../format';
import type { Item, Status } from '../types';
import { Avatar, StarDisplay } from './ui';

export function ItemCard({
  item,
  onOpen,
  onStatus,
}: {
  item: Item;
  onOpen: () => void;
  onStatus: (s: Status) => void;
}) {
  const rt = runtimeLabel(item.type, item.runtime);
  return (
    <article
      className={`card status-${item.status}`}
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`${item.title}, ${TYPE_LABEL[item.type]}, ${STATUS_LABEL[item.status]}`}
    >
      <div className="card-top">
        <span className={`type-badge type-${item.type}`}>
          {TYPE_ICON[item.type]} {TYPE_LABEL[item.type]}
        </span>
        <select
          className={`status-select s-${item.status}`}
          value={item.status}
          aria-label={`Status of ${item.title}`}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) => onStatus(e.target.value as Status)}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>

      <h3 className="card-title">{item.title}</h3>
      <p className="meta">
        <span className="genre">{item.genre}</span>
        {rt && <span> · {rt}</span>}
      </p>
      {item.pitch && <p className="pitch">{item.pitch}</p>}

      <footer className="card-foot">
        {item.suggested_by_name ? (
          <span className="by">
            <Avatar name={item.suggested_by_name} color={item.suggested_by_color ?? '#777'} size={22} />
            <span className="muted small">{item.suggested_by_name}</span>
          </span>
        ) : (
          <span />
        )}
        <span className="rating">
          {item.avg_stars != null && <StarDisplay value={item.avg_stars} size={14} />}
          <span className="muted small">
            {item.avg_stars != null ? `${item.avg_stars.toFixed(1)} · ` : ''}
            {item.review_count} review{item.review_count === 1 ? '' : 's'}
          </span>
        </span>
      </footer>
    </article>
  );
}
