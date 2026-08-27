---
name: conventions
description: Reference guide for any agent making changes to the React admin dashboard. Read before modifying pages, stores, routes, or components.
version: 1.0.0
---

# Admin — Agent Conventions

Reference guide for any agent making changes to this React admin dashboard. Read this before touching any file.

---

## Overview

| Item | Value |
|------|-------|
| Framework | React 18 + Vite |
| Language | TypeScript (strict) |
| Package manager | Bun / npm |
| State management | Zustand |
| HTTP client | Axios (`src/utils/api.ts`) — auto token refresh |
| UI components | shadcn/ui (Radix primitives + Tailwind) |
| Table | TanStack Table v8 |
| Forms | react-hook-form |
| Notifications | react-hot-toast |
| Icons | lucide-react |
| UI language | Spanish (all labels, toasts, validation messages) |
| Base API URL | `VITE_API_URL` env var, defaults to `""` (same origin) |

---

## Project Structure

```
admin/src/
├── pages/
│   ├── dashboard/
│   │   ├── Dashboard.tsx                   # Main dashboard with stats/charts
│   │   ├── users/
│   │   │   ├── UsersIndex.tsx              # Table + batch ops + all dialogs wired
│   │   │   ├── UsersCreate.tsx             # Create dialog + inline form
│   │   │   ├── UsersUpdate.tsx             # Edit dialog with Tabs (General / Contraseña)
│   │   │   └── UsersDelete.tsx             # Destructive confirm dialog
│   │   ├── business/
│   │   │   └── BusinessSettings.tsx        # Settings page (Profile / Password / Business tabs)
│   │   └── components/                     # Shared dashboard sub-components
│   └── auth/                               # Login / OTP pages
├── stores/
│   ├── authStore.ts                        # Current user, login, logout, hasPermission
│   ├── userStore.ts                        # Users CRUD + batch ops
│   ├── businessStore.ts                    # Business settings + public cache
│   ├── dashboardStore.ts                   # Dashboard stats
│   └── profileStore.ts                     # Current user profile update + password
├── components/
│   ├── ui/                                 # shadcn auto-generated components
│   ├── navigation/
│   │   └── AppSidebar.tsx                  # Sidebar nav
│   └── shared/                             # Reusable app-level components
├── utils/
│   ├── api.ts                              # Axios instance + interceptors
│   └── adminRoutes.ts                      # Route path constants
├── routes/
│   └── index.tsx                           # React Router route tree
├── types/
│   └── auth.ts                             # User type, Permissions enum
└── index.css                               # CSS variables (.dashboard-theme)
```

---

## Core Conventions

### 1. Page File Pattern (4-file rule)

Every CRUD resource under `src/pages/dashboard/<resource>/` uses exactly four files:

| File | Purpose |
|------|---------|
| `ResourceIndex.tsx` | Page entry point: table, filters, pagination, opens all dialogs |
| `ResourceCreate.tsx` | `Dialog` + create form (self-contained, no props for fields) |
| `ResourceUpdate.tsx` | `Dialog` + `Tabs` (General tab + Contraseña tab when applicable) |
| `ResourceDelete.tsx` | Destructive `AlertDialog` confirm, receives `resource` + `onClose` |

The `Index` file owns all state (`selectedResource`, `isCreateOpen`, `isUpdateOpen`, `isDeleteOpen`) and passes it down.

The TanStack Table (`columns` definition + `DataTable` wrapper) lives **inline** in `ResourceIndex.tsx` — do not split into separate files unless the table is used in more than one page.

### 2. Store Pattern (Zustand)

One store per resource at `src/stores/<resource>Store.ts`:

```typescript
import { create } from "zustand";
import api from "../utils/api";

export interface Thing {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

interface ThingFilters {
  search?: string;
}

interface ThingState {
  things: Thing[];
  isLoading: boolean;
  error: string | null;
  pagination: Pagination;
  currentFilters: ThingFilters | null;
  fetchThings: (page?: number, perPage?: number, filters?: ThingFilters) => Promise<void>;
  createThing: (data: CreateThingData) => Promise<void>;
  updateThing: (id: number, data: UpdateThingData) => Promise<void>;
  deleteThing: (id: number) => Promise<void>;
  batchDeleteThings: (ids: number[]) => Promise<void>;
}
```

Rules:
- Always initialize `isLoading: false`, `error: null`, `currentFilters: null`
- Always `set({ isLoading: true, error: null })` at the top of every async action
- After mutations call `fetchThings(pagination.current_page, ...)` to sync with server
- Batch ops use `Promise.all(ids.map(...))` then a single `fetchThings` call
- Errors are stored in `error` **and** re-thrown so the calling component can show a toast

### 3. HTTP Calls

Always use the shared `api` instance from `src/utils/api.ts` — never raw `fetch` or a new `axios.create`. It handles:
- Bearer token injection
- Automatic token refresh on 401
- Server 5xx global toast

```typescript
import api from "../utils/api";

const response = await api.get("/api/v1/things", { params });
const response = await api.post("/api/v1/things", { thing: data });
const response = await api.put(`/api/v1/things/${id}`, { thing: data });
const response = await api.delete(`/api/v1/things/${id}`);
```

Roles/extra params that live outside the `thing` key are sent at the root level:
```typescript
{ thing: { name, email }, roles: "admin,manager" }
```

### 4. TypeScript Types

Define the resource interface inline at the top of the store file (exported for re-use). Only move it to `src/types/` if it is shared across multiple stores or pages.

```typescript
// In thingStore.ts — export so Index/Create/Update can import it
export interface Thing { ... }
```

### 5. Forms (react-hook-form)

```tsx
const form = useForm<ThingFormData>({
  defaultValues: { name: "", ... },
  values: existingThing ? { name: existingThing.name, ... } : undefined,
});
```

- All validation messages in Spanish
- Show errors inline below each field with `<p className="text-xs text-destructive">`
- Use `<Loader2 className="... animate-spin" />` on submit buttons while loading

### 6. UI Components (shadcn)

Import from `@/components/ui/*`. Standard set used across all resource pages:

- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` — for Update dialogs with password section
- `Button` (variants: `default`, `destructive`, `outline`, `ghost`)
- `Input`, `Label`, `Separator`
- `Card`, `CardContent`
- `Alert`, `AlertDescription`
- `Badge`

Do not install new UI libraries. If a component is missing from shadcn, build it inline.

### 7. Toasts

```typescript
import toast from "react-hot-toast";

toast.success("Usuario creado correctamente");
toast.error(error.message || "Error al crear usuario");
```

Always use Spanish text. Never `alert()` or `console.error` for user-facing feedback.

### 8. Permission Checks

```typescript
import { useAuthStore } from "../../../stores/authStore";
import { Permissions } from "../../../types/auth";

const { hasPermission } = useAuthStore();
const canCreate = hasPermission(Permissions.CREATE_THINGS);
```

Gate destructive/write buttons behind permission checks. The `Permissions` enum mirrors `Permission::` constants from the backend.

### 9. TanStack Table (Index page)

```typescript
const table = useReactTable({
  data: things,
  columns,
  getRowId: (row) => String(row.id),   // stable selection across refetches
  enableRowSelection: true,
  onRowSelectionChange: setRowSelection,
  state: { rowSelection },
  // ...
});
```

**Batch action bar** — animate in when `Object.keys(rowSelection).length > 0`:
```tsx
{selectedCount > 0 && (
  <div className="flex items-center gap-2 animate-in slide-in-from-top-1">
    <span>{selectedCount} seleccionados</span>
    <Button onClick={handleBatchDelete} variant="destructive" size="sm">Eliminar</Button>
    <Button onClick={() => setRowSelection({})} variant="ghost" size="sm">Limpiar</Button>
  </div>
)}
```

Checkbox column uses `header` select-all + per-row `cell` — see `UsersIndex.tsx` as the reference implementation.

### 10. Colors & Theme

CSS variables live in `src/index.css` under `.dashboard-theme`. Primary color: `oklch(0.48 0.18 260)` (indigo blue). Do not use hardcoded hex/rgb — always use Tailwind semantic tokens (`text-primary`, `bg-muted`, `border-border`, etc.).

---

## Adding a New Resource

Follow these steps in order:

### Step 1 — Add the Zustand store

Create `src/stores/<resource>Store.ts`:
- Define and export the TypeScript interface for the resource
- Define `Filters`, `CreateData`, `UpdateData` interfaces
- Implement: `fetchThings`, `createThing`, `updateThing`, `deleteThing`, `batchDeleteThings`
- Follow the store pattern above exactly

### Step 2 — Create the four page files

Under `src/pages/dashboard/<resource>/`:

1. **`ThingDelete.tsx`** — simplest, build first. Receives `thing: Thing | null` and `onClose: () => void`.
2. **`ThingCreate.tsx`** — `Dialog` that opens when `isOpen` is true. Contains the react-hook-form form. Calls `store.createThing` on submit.
3. **`ThingUpdate.tsx`** — same structure as Create but pre-fills form with `values`. Uses `Tabs` if there is a password/secondary section.
4. **`ThingIndex.tsx`** — builds the table (`columns`, `useReactTable`), manages selection state, renders batch action bar, and renders the three dialog components.

### Step 3 — Register the route

In `src/routes/index.tsx`, add the new route pointing to `ThingIndex`.

In `src/utils/adminRoutes.ts`, add the path constant.

### Step 4 — Add sidebar entry

In `src/components/navigation/AppSidebar.tsx`, add the nav item with the correct icon, label (Spanish), and route path. Gate visibility with `hasPermission(Permissions.VIEW_THINGS)`.

### Step 5 — Add permission constant

In `src/types/auth.ts`, add the new permission keys to the `Permissions` enum so they mirror the backend `Permission::` constants.

---

## Updating an Existing Resource

Typical files touched:

| Change | Files |
|--------|-------|
| Add/remove field | Store interface + `fetchThings` mapping → `Create`/`Update` form fields |
| Add a new action (e.g. toggle) | Store (new method) → `Index` (button + handler) |
| Change table columns | `columns` array inside `ResourceIndex.tsx` |
| Change filters | `Filters` interface in store + filter UI in `ResourceIndex.tsx` |
| Change dialog layout | Only `ResourceCreate.tsx` or `ResourceUpdate.tsx` |
| Add batch operation | Store (`batchVerb` method) → `ResourceIndex.tsx` (batch bar button + `BatchConfirmDialog`) |

---

## Validation Checklist

Before finishing any change, verify:

- [ ] All toast messages and validation errors are in Spanish
- [ ] New store actions follow the `set({ isLoading: true, error: null })` → try/catch → re-throw pattern
- [ ] Batch operations use `Promise.all` + single `fetchResource` call after
- [ ] TanStack Table uses `getRowId: (row) => String(row.id)` to keep selection stable
- [ ] Destructive actions (delete, batch delete) are behind a confirmation `AlertDialog`
- [ ] Write buttons are gated behind `hasPermission(Permissions.VERB_RESOURCE)`
- [ ] No hardcoded colors — only Tailwind semantic tokens
- [ ] TypeScript: zero new errors (`tsc --noEmit` must pass)
- [ ] New route added in `src/routes/index.tsx` and path constant in `src/utils/adminRoutes.ts`
- [ ] Sidebar entry gated behind correct `VIEW_` permission
