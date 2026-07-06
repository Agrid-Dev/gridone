# @gridone/sdk

TypeScript client for the Gridone API. Runs in the browser and Node 18+, with zero runtime dependencies.

> **Status**: scaffolding — the public API (`GridoneClient`, `TokenStorage`, error classes) is under construction ([AGR-373](https://linear.app/agrid-bms/issue/AGR-373)).

## Development

```sh
npm install
npm run build       # tsup — ESM + CJS + type declarations in dist/
npm run test        # vitest
npm run lint        # eslint
npm run format -- --check
npm run type-check  # tsc --noEmit
```
