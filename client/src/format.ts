import type { MediaType, SortKey, Status } from './types';

export const STATUSES: Status[] = ['to_watch', 'watching', 'completed'];

export const STATUS_LABEL: Record<Status, string> = {
  to_watch: 'To Watch',
  watching: 'Watching',
  completed: 'Completed',
};

export const TYPE_LABEL: Record<MediaType, string> = { movie: 'Movie', show: 'Show', book: 'Book' };
export const TYPE_ICON: Record<MediaType, string> = { movie: '🎬', show: '📺', book: '📖' };

export const RUNTIME_UNIT: Record<MediaType, string> = {
  movie: 'Runtime (minutes)',
  show: 'Episode length (minutes)',
  book: 'Length (pages)',
};

export const SORT_LABEL: Record<SortKey, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  title: 'Title A–Z',
  genre: 'Genre',
  runtime_asc: 'Shortest first',
  runtime_desc: 'Longest first',
  rating: 'Highest rated',
};

export function runtimeLabel(type: MediaType, runtime: number | null): string | null {
  if (runtime == null) return null;
  if (type === 'book') return `${runtime} pages`;
  const h = Math.floor(runtime / 60);
  const m = runtime % 60;
  const time = h ? `${h}h${m ? ` ${m}m` : ''}` : `${m}m`;
  return type === 'show' ? `${time} / episode` : time;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  const units: Array<[number, string]> = [[60, 'minute'], [60, 'hour'], [24, 'day'], [7, 'week'], [4.35, 'month'], [12, 'year']];
  let value = diff / 60;
  let label = 'minute';
  for (let i = 1; i < units.length && value >= units[i]![0]; i++) {
    value /= units[i]![0];
    label = units[i]![1];
  }
  const n = Math.floor(value);
  return `${n} ${label}${n === 1 ? '' : 's'} ago`;
}
