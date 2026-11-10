import { SORT_LABEL, STATUS_LABEL, TYPE_ICON, TYPE_LABEL } from '../format';
import type { Filters, MediaType, SortKey, Status } from '../types';

export type Tab = Status | 'all';
const TABS: Tab[] = ['to_watch', 'watching', 'completed', 'all'];
const TYPES: Array<MediaType | ''> = ['', 'movie', 'show', 'book'];

export function StatusTabs({
  tab,
  counts,
  onChange,
}: {
  tab: Tab;
  counts: Record<Tab, number>;
  onChange: (t: Tab) => void;
}) {
  return (
    <nav className="tabs" aria-label="Status">
      {TABS.map((s) => (
        <button key={s} className={`tab ${tab === s ? 'on' : ''}`} aria-pressed={tab === s} onClick={() => onChange(s)}>
          {s === 'all' ? 'All' : STATUS_LABEL[s]}
          <span className="count">{counts[s]}</span>
        </button>
      ))}
    </nav>
  );
}

export function FilterToolbar({
  filters,
  search,
  genres,
  onSearch,
  onFilter,
}: {
  filters: Filters;
  search: string;
  genres: string[];
  onSearch: (q: string) => void;
  onFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
}) {
  return (
    <>
      <section className="toolbar" aria-label="Filters">
        <input
          className="search"
          type="search"
          placeholder="Search titles & pitches…"
          aria-label="Search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        <div className="segmented compact" role="group" aria-label="Type">
          {TYPES.map((t) => (
            <button
              key={t || 'all'}
              className={filters.type === t ? 'on' : ''}
              aria-pressed={filters.type === t}
              onClick={() => onFilter('type', t)}
            >
              {t ? `${TYPE_ICON[t]} ${TYPE_LABEL[t]}s` : 'All types'}
            </button>
          ))}
        </div>
        <select aria-label="Genre" value={filters.genre} onChange={(e) => onFilter('genre', e.target.value)}>
          <option value="">All genres</option>
          {genres.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select aria-label="Sort by" value={filters.sort} onChange={(e) => onFilter('sort', e.target.value as SortKey)}>
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              Sort: {SORT_LABEL[k]}
            </option>
          ))}
        </select>
      </section>

      {(filters.sort === 'runtime_asc' || filters.sort === 'runtime_desc') && !filters.type && (
        <p className="hint small">Grouped by type, since books are measured in pages and screen time in minutes.</p>
      )}
    </>
  );
}
