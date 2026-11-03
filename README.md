# NGNE Games

A collection of small games built with NGNE. Each game owns its source, assets, tests, configuration, and runtime dependencies under `games/<game-name>/`.

Starfall is planned as the first game. No game packages or playable gallery are included yet.

## Requirements

- Node.js 24 or newer
- npm

## Install

```sh
npm ci
```

The collection uses npm workspaces and a single root `package-lock.json`.

## Formatting

```sh
npm run format:check
npm run format
```

These commands check or format the current root package, formatting configuration, and README. Game development, tests, and build commands will be available when the first game is added.
