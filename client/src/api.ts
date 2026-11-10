import type { Filters, Item, ItemDetail, ItemInput, Member, Status } from './types';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      data?.error ?? (res.status >= 500 ? "Can't reach the Media Club server. Is it running?" : `Request failed (${res.status})`),
    );
  }
  return data as T;
}

export const api = {
  members: () => request<Member[]>('GET', '/members'),
  addMember: (name: string) => request<Member>('POST', '/members', { name }),

  genres: () => request<string[]>('GET', '/genres'),
  items: (f: Filters) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v) params.set(k, v);
    return request<Item[]>('GET', `/items?${params}`);
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
