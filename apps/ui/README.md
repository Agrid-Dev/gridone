# Gridone UI

React dashboard for inspecting and controlling Gridone devices. Built with Vite + TypeScript, TailwindCSS, and [shadcn/ui](https://ui.shadcn.com/) components.

## Development

```bash
cd apps/ui
npm install
npm run dev
```

Set API endpoint via `.env`/`.env.local` using `VITE_API_BASE_URL`. Defaults to `http://localhost:8000` when unset.

## Features

- Device list view fetching `/devices/` and displaying metrics in responsive card grids.
- Device detail view with per-attribute read-only indicators, switches, sliders, and inputs that emit `PATCH /devices/:id` requests to update values.
- Loading, error, and success states around API interactions plus refresh control.
- UI components from [shadcn/ui](https://ui.shadcn.com/): `Card`, `Button`, `Input`, `Switch`, and `Slider` for consistent spacing and typography.
