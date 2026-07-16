You are an expert Tauri v2 + React + TypeScript desktop engineer helping build **CounterTop POS**.
Write clean, simple, maintainable code. Prioritize clarity over unnecessary abstraction. Think like a senior desktop-app developer who ships for low-spec Windows machines.

> This file is the source of truth. Read it before every feature and follow it strictly.
> The full product spec lives in `pos-prd.md`. This file is the working contract; the PRD is the reference.
> The build methodology lives in the `practical-vibe-coding` skill — build one feature at a time, verify, commit.

## Project Overview
CounterTop POS is a **fully offline** desktop point-of-sale app for Ghanaian wholesale-and-retail shops. It runs installed on a Windows PC at the counter with a local SQLite database — no internet, no server, no cloud.
The app includes:
- Fast barcode + manual sales with a live "receipt tape" cart
- Per-piece **retail** and per-box **wholesale** pricing on every product, sellable per line
- ESC/POS thermal receipt printing (with HTML/A4 fallback) and reprint-by-number
- Product & stock management (stock tracked in pieces), Excel import
- A live dashboard (today's revenue, cash position, hourly chart, low-stock alerts)
- Reports, end-of-day Z-report, users/PINs, backups to USB
Keep the implementation simple and readable. Money is stored as **integer pesewas** (GHS × 100) — never floats.

## Tech Stack
- **Shell:** Tauri v2 (Rust) — target Windows 10/11 first
- **UI:** React 18 + Vite + TypeScript (strict)
- **State:** Zustand (cart, session) + TanStack Query over SQLite reads
- **DB:** SQLite in WAL mode via `@tauri-apps/plugin-sql`, single file at `%APPDATA%/countertop/pos.db`
- **Styling:** Tailwind CSS with the design tokens below
- **Charts:** hand-rolled SVG — no chart library
- **Printing:** ESC/POS bytes via a Rust Tauri command `print_receipt(bytes)`; HTML fallback via system print
- **Hashing:** argon2 for PINs
- **Excel:** SheetJS (`xlsx`) for import/export
Do not introduce new major libraries unless there is a strong reason. Ask before installing anything new.

## Development Philosophy
Build feature by feature, following the phases in `pos-prd.md §11`. For every feature:
1. Read this file first.
2. Build the smallest useful version first.
3. Avoid overengineering; prefer readable code over clever code.
4. Refactor only when repetition actually appears.
5. Do not start a phase until the previous one runs end to end.

## Decision Making
If something is unclear or could be improved, suggest a better approach and ask before adding libraries or changing existing UI. The Tauri-vs-Electron fallback (PRD §3) is why **all native calls go through `src/native/`** — never call a Tauri API directly from a component.

## Architecture
```
src/
  main.tsx            App entry, providers (QueryClient, router)
  App.tsx             Shell: nav rail + routed screens
  native/             THE ONLY place that talks to the platform.
    index.ts          Adapter interface + environment selection
    tauri.ts          Real Tauri implementation (sql plugin, print, fs)
    mock.ts           Browser/dev implementation (sql.js in-memory) for `npm run dev` without Rust
  db/
    schema.sql        Canonical SQLite schema (mirrors PRD §5)
    migrate.ts        Runs schema/migrations on first launch
    seed.ts           Dev seed data (categories, products, admin PIN)
    queries/          Typed query modules, one file per domain (products.ts, sales.ts...)
  money.ts            pesewas <-> GHS helpers, formatting (tabular)
  stock.ts            pieces <-> "X boxes + Y pcs" helpers
  auth/               PIN pad, session store, argon2 verify via native
  store/              Zustand stores (cartStore, sessionStore)
  components/         Reusable UI (NavRail, ReceiptTape, MoneyText, PinPad...)
  screens/            One folder per screen (Sell, Reprints, Products, Dashboard, Reports, Settings)
  lib/                cn(), events (in-app bus for `sale:completed`), formatting
  styles/             tokens.css, fonts (Archivo, IBM Plex Mono bundled locally)
src-tauri/            Rust shell: tauri.conf.json, Cargo.toml, src/main.rs, capabilities
```
Screens compose components and call queries/stores; they hold no platform calls and no large reusable UI. Create a component only when it's reused or is a clear concept (e.g. `ReceiptTape`, `MoneyText`, `PinPad`, `NavRail`). Don't create components too early.

## UI Rules
Replicate the design spec in `pos-prd.md §9` exactly: the ledger-green identity, the live receipt-tape cart, tabular numerals on every money figure, light theme only, touch targets ≥ 48 px (primary ≥ 56 px). Do not approximate spacing, color, or type. The 48 px money size is reserved for exactly two moments: **change due** and **today's revenue**.

## Styling Rules
Tailwind first, using the design tokens (below / in `tailwind.config` + `styles/tokens.css`). Fall back to inline style only for dynamic runtime values (e.g. SVG bar heights, animated slide offsets) and CSS clip-path perforations. Reuse patterns via small components, not copy-paste. No gradients. Clean & consistent (SiMi Shop direction): white surfaces, soft diffuse `shadow-card` (no hard borders needed), generous rounding (`rounded-2xl` for cards), roomy whitespace.

### Design tokens
`paper #F1F6F2` bg · `ledger #27A567` primary (fresh grocery green — fills, active nav, accents) · `ledger-deep #1E8A54` hover · `leaf #E9F6EE` light tint (hovers, selected rows, active-nav bg) · `ink #1C2522` text · `tape #FFFFFF` surfaces/cart/receipt · `carbon #3A5FA8` info/focus · `stamp #E0503A` danger/alerts · `brass #B98A2F` money accent (change due, today's revenue).
Sidebar is white with the active item as a solid `ledger` pill. Cards: `rounded-2xl bg-tape shadow-card`. Type scale: 13 / 15 / 18 / 24 / 34 / 48. UI+headings = Archivo (600 headings); money + receipt tape = IBM Plex Mono; tables = Archivo with `tabular-nums`.

## State Management
Zustand for global client state: `cartStore` (lines, unit, qty, discount, totals) and `sessionStore` (current user, role). TanStack Query for all SQLite reads (keyed, invalidated on the `sale:completed` event). Local component state for transient UI. The in-app event bus in `lib/events.ts` is the "live" mechanism — no server, no websockets.

## TypeScript
Strict mode. No `any`. Money is always typed as pesewas (integer). Keep types simple and readable; colocate them with their query module.

## Data & correctness rules (non-negotiable, from the PRD)
- Stock lives in **pieces**; a box deducts `pieces_per_box`. Validate stock in pieces at charge time.
- A sale commits in **one transaction**: sale row + line items + stock decrements + stock_movements. Survive power loss with no partial sale.
- Sale lines are **snapshots**: copy `product_name` and `unit_price_pesewas` at sale time so renames/price changes never alter old receipts.
- Receipt numbers come from a **sequence** (`R-000481`), never from the clock.
- Every price change, void, override, and PIN reset writes to `audit_log`.
- Retail and wholesale prices are independent numbers set by the owner — never compute one from the other.

## Feature Implementation
1. Read this file first. 2. Identify the files to change. 3. Keep changes focused. 4. Don't rewrite unrelated code. 5. Follow existing patterns. 6. Make the feature work end to end. 7. Fix lint and type errors before finishing.

## Secrets
There is no cloud, so there are essentially no secrets — but never log PINs or write the recovery phrase in plaintext to disk. PINs are argon2-hashed.

## Communication
Be concise. Explain what changed and how to test it. Recommend one commit per working feature.

## Final Reminder
Before every feature: read this file, follow it strictly, build the smallest working version, replicate the PRD §9 design exactly, and verify the previous phases still work before calling it done.
