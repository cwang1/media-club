import type { Filters, Item, ItemDetail, ItemInput, Member, Session, Status } from './types';

const TOKEN_KEY = 'mediaclub.token';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---------- the per-device key that says which member this browser is ----------

let token: string | null = (() => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
})();

export function getToken() {
  return token;
}

export function setToken(value: string | null) {
  token = value;
  try {
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable: the key lasts for this tab only */
  }
}

/** The link that signs another device in as the current member. */
export function signInLink() {
  return token ? `${location.origin}/?key=${encodeURIComponent(token)}` : null;
}

/** Picks up a key from a sign-in link (`?key=...`) and removes it from the address bar. */
export function consumeSignInLink() {
  const url = new URL(location.href);
  const key = url.searchParams.get('key');
  if (!key) return;
  setToken(key);
  url.searchParams.delete('key');
  history.replaceState(null, '', url);
}

// ---------- requests ----------

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) {
    const fallback =
      res.status >= 500 ? "Can't reach the Media Club server. Is it running?" : `Request failed (${res.status})`;
    throw new ApiError(res.status, data?.error ?? fallback);
  }
  return data as T;
}

export const api = {
  members: () => request<Member[]>('GET', '/members'),
  join: (name: string) => request<Session>('POST', '/members', { name }),
  claim: (memberId: number) => request<Session>('POST', `/members/${memberId}/claim`),
  me: () => request<Member>('GET', '/me'),
  release: () => request<void>('POST', '/me/release'),

  genres: () => request<string[]>('GET', '/genres'),
  items: (f: Filters) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(f) as Array<[string, string]>) if (v) params.set(k, v);
    return request<Item[]>('GET', `/items?${params.toString()}`);
  },
  item: (id: number) => request<ItemDetail>('GET', `/items/${id}`),
  createItem: (input: ItemInput) => request<ItemDetail>('POST', '/items', input),
  updateItem: (id: number, patch: Partial<ItemInput> & { status?: Status }) =>
    request<ItemDetail>('PATCH', `/items/${id}`, patch),
  deleteItem: (id: number) => request<void>('DELETE', `/items/${id}`),

  saveReview: (itemId: number, memberId: number, review: { stars: number | null; comment: string }) =>
    request<ItemDetail>('PUT', `/items/${itemId}/reviews/${memberId}`, review),
  deleteReview: (itemId: number, memberId: number) =>
    request<ItemDetail>('DELETE', `/items/${itemId}/reviews/${memberId}`),
};
