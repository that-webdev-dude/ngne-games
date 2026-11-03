# NGNE Games

A collection of small games built with NGNE. Each game owns its source, assets, tests, configuration, and runtime dependencies under `games/<game-name>/`.

## Games

- [Starfall](games/starfall/README.md): a full-window arcade shoot-em-up with three sectors. Requires a WebGPU-capable desktop browser. Its planned play location is `/ngne-games/starfall/`; deployment and the gallery are not available yet.

## Requirements

- Node.js 24 or newer
- npm

## Install

```sh
npm ci
```

The collection uses npm workspaces and a single root `package-lock.json`.

## Development and checks

Run these commands from the repository root:

```sh
npm run dev --workspace=starfall -- --port 5173 --strictPort
npm run typecheck
npm test
npm run build
```

To build or preview Starfall independently:

```sh
npm run build --workspace=starfall
npm run preview --workspace=starfall -- --port 4173 --strictPort
```

Game output is in `games/starfall/dist/`. Root `build` currently builds game workspaces; the combined gallery artifact is not available yet. See the [Starfall README](games/starfall/README.md) for gameplay, controls, fixtures, and campaign checks.

## Formatting

```sh
npm run format:check
npm run format
```

These commands check or format the root package, formatting configuration, root README, and game package files and READMEs.
