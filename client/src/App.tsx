import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { ItemCard } from './components/ItemCard';
import { ItemDetailModal } from './components/ItemDetailModal';
import { ItemForm } from './components/ItemForm';
import { MemberPicker } from './components/MemberPicker';
import { Avatar, ConfirmDialog } from './components/ui';
import { SORT_LABEL, STATUS_LABEL, TYPE_ICON, TYPE_LABEL } from './format';
import type { Filters, Item, ItemInput, MediaType, Member, SortKey, Status } from './types';

const ME_KEY = 'mediaclub.memberId';

function readStoredMe(): number | null {
  try {
    const v = Number(localStorage.getItem(ME_KEY));
    return Number.isInteger(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

type FormState = { mode: 'create' } | { mode: 'edit'; item: Item } | null;

export default function App() {
  const [members, setMembers] = useState<Member[]>([]);
  const [meId, setMeId] = useState<number | null>(readStoredMe);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [items, setItems] = useState<Item[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<Status | 'all'>('to_watch');
  const [filters, setFilters] = useState<Filters>({ type: '', genre: '', q: '', sort: 'newest' });
  const [search, setSearch] = useState('');

  const [openId, setOpenId] = useState<number | null>(null);
  const [detailKey, setDetailKey] = useState(0);
  const [form, setForm] = useState<FormState>(null);
  const [skipping, setSkipping] = useState<Item | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>(undefined);

  const me = members.find((m) => m.id === meId) ?? null;

  const notify = useCallback((msg?: string) => {
    if (!msg) return;
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  // members: load once, prompt for identity if unknown
  useEffect(() => {
    api
      .members()
      .then((ms) => {
        setMembers(ms);
        if (!ms.some((m) => m.id === readStoredMe())) setPickerOpen(true);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  // debounce the search box into filters
  useEffect(() => {
    const t = window.setTimeout(() => setFilters((f) => (f.q === search ? f : { ...f, q: search })), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const reload = useCallback(async () => {
    try {
      const [list, gs] = await Promise.all([api.items(filters), api.genres()]);
      setItems(list);
      setGenres(gs);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    reload();
  }, [reload]);

  const counts = useMemo(() => {
    const c: Record<Status | 'all', number> = { all: items.length, to_watch: 0, watching: 0, completed: 0 };
    for (const it of items) c[it.status]++;
    return c;
  }, [items]);

  const visible = tab === 'all' ? items : items.filter((i) => i.status === tab);
  const filtersActive = filters.type !== '' || filters.genre !== '' || filters.q !== '';

  function pickMe(id: number) {
    setMeId(id);
    try {
      localStorage.setItem(ME_KEY, String(id));
    } catch {
      /* storage unavailable: identity lasts for this tab only */
    }
    setPickerOpen(false);
  }

  async function changeStatus(item: Item, status: Status) {
    // optimistic update so the card moves immediately
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, status } : i)));
    try {
      await api.updateItem(item.id, { status });
      notify(`“${item.title}” moved to ${STATUS_LABEL[status]}`);
    } catch (e) {
      notify((e as Error).message);
    }
    reload();
  }

  async function saveForm(input: ItemInput) {
    if (form?.mode === 'edit') {
      await api.updateItem(form.item.id, input);
      notify('Changes saved');
      setDetailKey((k) => k + 1);
    } else {
      const created = await api.createItem({ ...input, suggested_by: me?.id ?? null });
      notify(`“${created.title}” added to the backlog`);
      if (tab !== 'all' && tab !== 'to_watch') setTab('to_watch');
    }
    setForm(null);
    reload();
  }

  async function confirmSkip() {
    if (!skipping) return;
    try {
      await api.deleteItem(skipping.id);
      notify(`Skipped “${skipping.title}”`);
      setOpenId(null);
    } catch (e) {
      notify((e as Error).message);
    }
    setSkipping(null);
    reload();
  }

  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">🍿</span>
          <div>
            <h1>Media Club</h1>
            <p className="muted small">Our shared watch &amp; read list</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="me-btn" onClick={() => setPickerOpen(true)} aria-label="Change who you are">
            {me ? (
              <>
                <Avatar name={me.name} color={me.color} />
                <span>{me.name}</span>
              </>
            ) : (
              <span>Who are you?</span>
            )}
          </button>
          <button className="btn primary" onClick={() => setForm({ mode: 'create' })}>
            + Suggest
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label="Status">
        {(['to_watch', 'watching', 'completed', 'all'] as const).map((s) => (
          <button key={s} className={`tab ${tab === s ? 'on' : ''}`} aria-pressed={tab === s} onClick={() => setTab(s)}>
            {s === 'all' ? 'All' : STATUS_LABEL[s]}
            <span className="count">{counts[s]}</span>
          </button>
        ))}
      </nav>

      <section className="toolbar" aria-label="Filters">
        <input
          className="search"
          type="search"
          placeholder="Search titles & pitches…"
          aria-label="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="segmented compact" role="group" aria-label="Type">
          {(['', 'movie', 'show', 'book'] as const).map((t) => (
            <button
              key={t || 'all'}
              className={filters.type === t ? 'on' : ''}
              aria-pressed={filters.type === t}
              onClick={() => setFilter('type', t as MediaType | '')}
            >
              {t ? `${TYPE_ICON[t]} ${TYPE_LABEL[t]}s` : 'All types'}
            </button>
          ))}
        </div>
        <select aria-label="Genre" value={filters.genre} onChange={(e) => setFilter('genre', e.target.value)}>
          <option value="">All genres</option>
          {genres.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select aria-label="Sort by" value={filters.sort} onChange={(e) => setFilter('sort', e.target.value as SortKey)}>
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

      <main>
        {error && (
          <div className="banner error">
            {error} <button className="link" onClick={reload}>Retry</button>
          </div>
        )}
        {loading ? (
          <p className="muted center">Loading the queue…</p>
        ) : visible.length === 0 ? (
          <div className="empty">
            <p className="empty-emoji" aria-hidden="true">{tab === 'completed' ? '🏁' : tab === 'watching' ? '🛋️' : '📭'}</p>
            <p>
              {filtersActive
                ? 'Nothing matches these filters.'
                : tab === 'all'
                  ? 'The backlog is empty.'
                  : `Nothing in ${STATUS_LABEL[tab as Status]} yet.`}
            </p>
            {filtersActive ? (
              <button
                className="btn ghost"
                onClick={() => {
                  setSearch('');
                  setFilters((f) => ({ ...f, type: '', genre: '', q: '' }));
                }}
              >
                Clear filters
              </button>
            ) : (
              <button className="btn primary" onClick={() => setForm({ mode: 'create' })}>
                Suggest something
              </button>
            )}
          </div>
        ) : (
          <div className="grid">
            {visible.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onOpen={() => setOpenId(item.id)}
                onStatus={(s) => changeStatus(item, s)}
              />
            ))}
          </div>
        )}
      </main>

      {openId != null && (
        <ItemDetailModal
          itemId={openId}
          me={me}
          refreshKey={detailKey}
          onClose={() => setOpenId(null)}
          onChanged={(msg) => {
            notify(msg);
            reload();
          }}
          onEdit={(item) => setForm({ mode: 'edit', item })}
          onSkip={(item) => setSkipping(item)}
          onNeedMember={() => setPickerOpen(true)}
        />
      )}

      {form && (
        <ItemForm
          initial={form.mode === 'edit' ? form.item : undefined}
          genres={genres}
          onSave={saveForm}
          onClose={() => setForm(null)}
        />
      )}

      {skipping && (
        <ConfirmDialog
          title="Skip this title?"
          message={
            <>
              <strong>{skipping.title}</strong> and its {skipping.review_count} review
              {skipping.review_count === 1 ? '' : 's'} will be removed from the club for everyone. This can't be undone.
            </>
          }
          confirmLabel="Skip it"
          onConfirm={confirmSkip}
          onCancel={() => setSkipping(null)}
        />
      )}

      {pickerOpen && (
        <MemberPicker
          members={members}
          currentId={meId}
          onPick={pickMe}
          onClose={() => setPickerOpen(false)}
          onMemberAdded={(m) => setMembers((ms) => [...ms, m].sort((a, b) => a.name.localeCompare(b.name)))}
        />
      )}

      <div className={`toast ${toast ? 'show' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}
