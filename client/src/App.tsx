import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from './api';
import { FilterToolbar, StatusTabs, type Tab } from './components/FilterToolbar';
import { ItemCard } from './components/ItemCard';
import { ItemDetailModal } from './components/ItemDetailModal';
import { ItemForm } from './components/ItemForm';
import { MemberPicker } from './components/MemberPicker';
import { Avatar, ConfirmDialog } from './components/ui';
import { STATUS_LABEL } from './format';
import { useIdentity } from './hooks/useIdentity';
import { useToast } from './hooks/useToast';
import type { Filters, Item, ItemInput, Status } from './types';

type FormState = { mode: 'create' } | { mode: 'edit'; item: Item } | null;

export default function App() {
  const identity = useIdentity();
  const { me } = identity;
  const { toast, notify } = useToast();
  const [pickerOpen, setPickerOpen] = useState(false);

  const [items, setItems] = useState<Item[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemsError, setItemsError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>('to_watch');
  const [filters, setFilters] = useState<Filters>({ type: '', genre: '', q: '', sort: 'newest' });
  const [search, setSearch] = useState('');

  const [openId, setOpenId] = useState<number | null>(null);
  const [detailKey, setDetailKey] = useState(0);
  const [form, setForm] = useState<FormState>(null);
  const [skipping, setSkipping] = useState<Item | null>(null);

  // Ask who you are once the member list has actually loaded and this browser isn't anyone yet.
  useEffect(() => {
    if (identity.status === 'ready' && !identity.me) setPickerOpen(true);
  }, [identity.status, identity.me]);

  // debounce the search box into filters
  useEffect(() => {
    const t = window.setTimeout(() => setFilters((f) => (f.q === search ? f : { ...f, q: search })), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const reloadItems = useCallback(async () => {
    try {
      const [list, gs] = await Promise.all([api.items(filters), api.genres()]);
      setItems(list);
      setGenres(gs);
      setItemsError(null);
    } catch (e) {
      setItemsError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void reloadItems();
  }, [reloadItems]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { all: items.length, to_watch: 0, watching: 0, completed: 0 };
    for (const it of items) c[it.status]++;
    return c;
  }, [items]);

  const visible = tab === 'all' ? items : items.filter((i) => i.status === tab);
  const filtersActive = filters.type !== '' || filters.genre !== '' || filters.q !== '';
  const error = identity.error ?? itemsError;

  /** Writes need a member; prompt for one instead of letting the server reject it. */
  function requireMe() {
    if (me) return true;
    setPickerOpen(true);
    return false;
  }

  /** Shows an error, and re-prompts for identity if the server no longer recognises this browser. */
  function fail(e: unknown) {
    if (e instanceof ApiError && e.status === 401) {
      identity.forget();
      setPickerOpen(true);
    }
    notify((e as Error).message);
  }

  async function changeStatus(item: Item, status: Status) {
    if (!requireMe()) return;
    // optimistic update so the card moves immediately
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, status } : i)));
    try {
      await api.updateItem(item.id, { status });
      notify(`“${item.title}” moved to ${STATUS_LABEL[status]}`);
    } catch (e) {
      fail(e);
    }
    await reloadItems();
  }

  async function saveForm(input: ItemInput) {
    if (form?.mode === 'edit') {
      await api.updateItem(form.item.id, input);
      notify('Changes saved');
      setDetailKey((k) => k + 1);
    } else {
      const created = await api.createItem(input);
      notify(`“${created.title}” added to the backlog`);
      if (tab !== 'all' && tab !== 'to_watch') setTab('to_watch');
    }
    setForm(null);
    await reloadItems();
  }

  async function confirmSkip() {
    if (!skipping) return;
    try {
      await api.deleteItem(skipping.id);
      notify(`Skipped “${skipping.title}”`);
      setOpenId(null);
    } catch (e) {
      fail(e);
    }
    setSkipping(null);
    await reloadItems();
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            🍿
          </span>
          <div>
            <h1>Media Club</h1>
            <p className="muted small">Our shared watch &amp; read list</p>
          </div>
        </div>
        <div className="topbar-actions">
          <button className="me-btn" onClick={() => setPickerOpen(true)} aria-label="Who you are">
            {me ? (
              <>
                <Avatar name={me.name} color={me.color} />
                <span>{me.name}</span>
              </>
            ) : (
              <span>Who are you?</span>
            )}
          </button>
          <button className="btn primary" onClick={() => requireMe() && setForm({ mode: 'create' })}>
            + Suggest
          </button>
        </div>
      </header>

      <StatusTabs tab={tab} counts={counts} onChange={setTab} />
      <FilterToolbar
        filters={filters}
        search={search}
        genres={genres}
        onSearch={setSearch}
        onFilter={(key, value) => setFilters((f) => ({ ...f, [key]: value }))}
      />

      <main>
        {error && (
          <div className="banner error">
            {error}{' '}
            <button className="link" onClick={() => void Promise.all([identity.reload(), reloadItems()])}>
              Retry
            </button>
          </div>
        )}
        {loading ? (
          <p className="muted center">Loading the queue…</p>
        ) : visible.length === 0 ? (
          <div className="empty">
            <p className="empty-emoji" aria-hidden="true">
              {tab === 'completed' ? '🏁' : tab === 'watching' ? '🛋️' : '📭'}
            </p>
            <p>
              {filtersActive
                ? 'Nothing matches these filters.'
                : tab === 'all'
                  ? 'The backlog is empty.'
                  : `Nothing in ${STATUS_LABEL[tab]} yet.`}
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
              <button className="btn primary" onClick={() => requireMe() && setForm({ mode: 'create' })}>
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
                onStatus={(s) => void changeStatus(item, s)}
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
            void reloadItems();
          }}
          onError={fail}
          onEdit={(item) => requireMe() && setForm({ mode: 'edit', item })}
          onSkip={(item) => requireMe() && setSkipping(item)}
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
          members={identity.members}
          me={me}
          onClaim={identity.claim}
          onJoin={identity.join}
          onRelease={identity.release}
          onClose={() => setPickerOpen(false)}
        />
      )}

      <div className={`toast ${toast ? 'show' : ''}`} role="status" aria-live="polite">
        {toast}
      </div>
    </div>
  );
}
