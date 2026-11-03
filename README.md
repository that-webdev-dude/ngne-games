# NGNE Games

A collection of small games built with NGNE. Each game owns its source, assets, tests, configuration, and runtime dependencies under `games/<game-name>/`.

## Games

- [Starfall](games/starfall/README.md): a full-window arcade shoot-em-up with three sectors. Requires a WebGPU-capable desktop browser. Its sole planned deployment is [Starfall in NGNE Games](https://that-webdev-dude.github.io/ngne-games/starfall/); public deployment is not available yet. Build and preview the gallery locally with the commands below.

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

Game output is in `games/starfall/dist/`. Root `build` builds every game, then assembles the gallery and games into root `dist/`. Root `test` runs site-tooling checks and all game suites. See the [Starfall README](games/starfall/README.md) for gameplay, controls, fixtures, and campaign checks.

To preview the combined artifact:

```sh
npm run build
npm run preview -- --port 4173 --strictPort
```

Open the printed local URL for the gallery, or `/starfall/` on that origin for the game. Production paths are planned as `/ngne-games/` and `/ngne-games/starfall/`; local preview at `/` alone does not verify a repository prefix.

`site/games.json` owns catalog metadata. Each entry supplies a unique lowercase hyphenated slug (excluding `gallery`), a unique `games/<directory>` workspace, title, description, requirements, screenshot alt text, and a PNG under that workspace's `docs/screenshots/`. Play and source links are derived from the slug and directory. Build every game first; `npm run build:site` then assembles existing game output without running game builds. Missing inputs, unsafe paths, symlinks/junctions, and non-production files in game builds fail assembly.

## Formatting

```sh
npm run format:check
npm run format
```

These commands check or format the root package, formatting configuration, root README, game package files and READMEs, gallery sources, and site tooling.
