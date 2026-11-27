# NGNE Games

A collection of small games built with NGNE. Each game owns its source, assets, tests, configuration, and runtime dependencies under `games/<game-name>/`.

## Games

### Starfall Reload

A full-screen vertical arcade shooter in a cabinet layout: three areas, four weapon families with Shot Control, power-as-armour, graze-reloaded bombs and multi-phase bosses. Requires a WebGPU-capable desktop browser; plays with a keyboard or a standard gamepad.

[![Starfall Reload facing the Halberd above the cloud deck](games/starfall-reload/docs/screenshots/cirrus-line-halberd.png)](games/starfall-reload/docs/screenshots/cirrus-line-halberd.png)

[Gameplay and controls](games/starfall-reload/README.md) · [Source](games/starfall-reload/) · [Screenshot provenance](games/starfall-reload/docs/screenshots/README.md)

[Open the gallery](https://that-webdev-dude.github.io/ngne-games/) or [play Starfall Reload](https://that-webdev-dude.github.io/ngne-games/starfall-reload/). Starfall Reload replaces the original Starfall, which is retired; the old `/starfall/` address redirects to it. Build and preview locally with the commands below.

## Requirements

- Node.js 24 or newer
- npm
- A desktop browser with WebGPU support to play Starfall Reload, served over localhost or HTTPS

## Install

```sh
npm ci
```

The collection uses npm workspaces and a single root `package-lock.json`.

## Development and checks

Run these commands from the repository root:

```sh
npm run dev --workspace=starfall-reload -- --port 5173 --strictPort
npm run typecheck
npm test
npm run build
```

To build or preview Starfall Reload independently:

```sh
npm run build --workspace=starfall-reload
npm run preview --workspace=starfall-reload -- --port 4173 --strictPort
```

Game output is in `games/starfall-reload/dist/`. Root `build` typechecks/builds every game, then assembles the gallery and games into root `dist/`. Root `test` runs site-tooling checks and all game suites, including Starfall Reload's headless campaign: a bot clears all three areas with each weapon. It does not verify rendering, audible audio, controllers, or human difficulty. See the [Starfall Reload README](games/starfall-reload/README.md) for gameplay, controls, and detailed checks.

To preview the combined artifact:

```sh
npm run build
npm run preview -- --port 4173 --strictPort
```

Open the printed local URL for the gallery, or `/starfall-reload/` on that origin for the game. Production paths are `/ngne-games/` and `/ngne-games/starfall-reload/`; local preview at `/` alone does not verify a repository prefix.

`site/games.json` owns catalog metadata. `site/redirects.json` lists retired game slugs; each gets a small page that sends visitors on to a catalog game, so `/starfall/` leads to `/starfall-reload/`. Play and source links are derived from each game's slug and workspace directory. Build every game first; `npm run build:site` then assembles existing game output without running game builds. Missing inputs, unsafe paths, symlinks/junctions, and non-production files in game builds fail assembly. The gallery has no game runtime and links to each full-window game.

## Repository layout

```text
games/starfall-reload/ Game source, sprites and .px sources, tests, documentation, legal notices
site/                Static gallery template, stylesheet, catalog, and redirects
tooling/             Site assembly and tooling tests
docs/                Contributor and deployment guides
.github/workflows/   CI and manual Pages deployment
package-lock.json    The single collection lockfile
```

Each game owns its runtime dependencies and can pin its own published NGNE version. Shared developer tools live at the root. Legal notices and asset provenance are game-specific; a game's NGNE notice does not establish a collection-wide license.

## CI and deployment

CI checks pull requests targeting `main` and pushes to `main` or a `feat/**`, `dev/**`, `cleanup/**` or `chore/**` branch. It installs with `npm ci`, checks formatting, runs tooling/game tests and builds the complete collection. Failed runs upload scoped logs for seven days.

Pages publication is manual-only and guarded to `main`; pushing or merging does not deploy. See [Deployment](docs/deployment.md) for prerequisites, separate approvals, verification, and rollback. Check workflow results in [GitHub Actions](https://github.com/that-webdev-dude/ngne-games/actions).

See [Adding a game](docs/adding-a-game.md) for the workspace, catalog, storage, legal, and validation contract.

## Formatting

```sh
npm run format:check
npm run format
```

These commands check or format the root package, formatting configuration, root README, game package files and READMEs, gallery sources, site tooling, contributor docs, and workflows. Generated output, dependencies, lockfiles, and local evidence are excluded.
