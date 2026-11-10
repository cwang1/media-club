export type MediaType = 'movie' | 'show' | 'book';
export type Status = 'to_watch' | 'watching' | 'completed';
export type SortKey = 'newest' | 'oldest' | 'title' | 'genre' | 'runtime_asc' | 'runtime_desc' | 'rating';

export interface Member {
  id: number;
  name: string;
  color: string;
}

export interface Item {
  id: number;
  title: string;
  type: MediaType;
  genre: string;
  runtime: number | null;
  pitch: string;
  status: Status;
  suggested_by: number | null;
  suggested_by_name: string | null;
  suggested_by_color: string | null;
  created_at: string;
  updated_at: string;
  avg_stars: number | null;
  review_count: number;
}

export interface Review {
  id: number;
  item_id: number;
  member_id: number;
  member_name: string;
  member_color: string;
  stars: number | null;
  comment: string;
  created_at: string;
  updated_at: string;
}

export interface ItemDetail extends Item {
  reviews: Review[];
}

export interface ItemInput {
  title: string;
  type: MediaType;
  genre: string;
  runtime: number | null;
  pitch: string;
  suggested_by?: number | null;
}

export interface Filters {
  type: MediaType | '';
  genre: string;
  q: string;
  sort: SortKey;
}
