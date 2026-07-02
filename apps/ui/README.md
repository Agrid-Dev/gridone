# Gridone UI

React dashboard for inspecting and controlling Gridone devices. Built with Vite + TypeScript, TailwindCSS, and [shadcn/ui](https://ui.shadcn.com/) components.

## Development

```bash
cd apps/ui
npm install
npm run dev
```

Set API endpoint via `.env`/`.env.local` using `VITE_API_BASE_URL`. Defaults to `http://localhost:8000` when unset.

### Developing against a remote deployment

Auth is cookie-based, so the browser only attaches credentials to
same-origin requests — pointing `VITE_API_BASE_URL` directly at a remote
host breaks login (cross-site cookies, CORS). Instead, let the dev server
proxy the API so requests stay first-party:

```bash
# .env / .env.local
VITE_API_BASE_URL=/api
VITE_DEV_PROXY_TARGET=https://my-deployment.example.com/api
```

The app then calls `/api/...` on the dev origin and Vite forwards to the
target (see `vite.config.ts`). Both variables are read at startup —
restart `npm run dev` after changing them. Leave `VITE_DEV_PROXY_TARGET`
unset to work against a local backend directly.

## Features

- Device list view fetching `/devices/` and displaying metrics in responsive card grids.
- Device detail view with per-attribute read-only indicators, switches, sliders, and inputs that emit `PATCH /devices/:id` requests to update values.
- Loading, error, and success states around API interactions plus refresh control.
- UI components from [shadcn/ui](https://ui.shadcn.com/): `Card`, `Button`, `Input`, `Switch`, and `Slider` for consistent spacing and typography.
