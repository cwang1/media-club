# 🍿 Media Club: Group Watchlist

A small CRUD app for a circle of friends. Members suggest movies, shows and books to a shared backlog, move them from **To Watch → Watching → Completed**, and leave star ratings and comments.

## Quick start

Requires **Node 22.13+**. The app uses the built-in `node:sqlite` module, so there are no native modules to compile.

```bash
npm install
npm run dev
```

Open http://localhost:5173. The API runs on http://localhost:3001; Vite forwards `/api` requests to it.

On first run the database (`server/data/club.db`) is created and filled with four members and eight sample titles. To start over, stop the app and delete `server/data/`.

| Command | What it does |
|---|---|
| `npm run dev` | Starts the API and web client with hot reload |
| `npm test` | Runs the API tests (Node's built-in test runner, in-memory DB) |
| `npm run typecheck` | Type-checks server and client |
| `npm start` | Builds the client and serves the app and API from one server on port 3001 |

Environment variables: `API_PORT` (default `3001`) and `DB_FILE` (default `server/data/club.db`).

## Features

| | |
|---|---|
| **Create** | Suggest a movie, show or book with genre, length and a short pitch (up to 280 characters). New members can join from the "Who's watching?" dialog. |
| **Read** | Status tabs with counts; filter by type, genre or a search term; sort by newest, oldest, title, genre, runtime or rating. Open a title to read the full pitch and every member's review. |
| **Update** | Change status from the card dropdown or the detail view; edit a title's details; add or update your own 1–5 star rating and comment. |
| **Delete** | "Skip this title" (with a confirmation) removes it and its reviews. You can also remove your own review. |

There are no accounts. You choose who you are from the member list, and the browser remembers your choice.

## Architecture

```
server/            Express 5 + TypeScript + SQLite (node:sqlite) + Zod
  src/db.ts        schema + first-run seed data
  src/app.ts       REST routes, validation, error handling
  src/index.ts     starts the API (and serves client/dist in production)
  test/            API tests
client/            React 19 + TypeScript + Vite, plain CSS (light/dark)
  src/App.tsx      queue page: tabs, filters, grid
  src/components/  ItemCard, ItemDetailModal, ItemForm, MemberPicker, ui
```

### Data model

- **members**: `id, name (unique), color`
- **items**: `id, title, type (movie|show|book), genre, runtime, pitch, status (to_watch|watching|completed), suggested_by → members`
- **reviews**: `id, item_id → items (cascade delete), member_id → members, stars (1–5, optional), comment`. Each member has at most one review per title.

`runtime` is in minutes for movies, minutes per episode for shows, and pages for books. Runtime sorting therefore groups items by type first.

### API

| Method | Path | Notes |
|---|---|---|
| GET | `/api/members` | |
| POST | `/api/members` | `{ name }` |
| GET | `/api/genres` | Distinct genres |
| GET | `/api/items` | Query: `status, type, genre, q, sort` (`newest, oldest, title, genre, runtime_asc, runtime_desc, rating`) |
| GET | `/api/items/:id` | Includes `reviews[]` |
| POST | `/api/items` | `{ title, type, genre, runtime?, pitch?, suggested_by? }` |
| PATCH | `/api/items/:id` | Any subset of the fields above, plus `status` |
| DELETE | `/api/items/:id` | 204 |
| PUT | `/api/items/:id/reviews/:memberId` | `{ stars?, comment? }`; creates or updates the review |
| DELETE | `/api/items/:id/reviews/:memberId` | |

Errors come back as `{ "error": "message" }` with the matching status code: 400 for invalid input, 404 when something isn't found, 409 for a duplicate member name.
