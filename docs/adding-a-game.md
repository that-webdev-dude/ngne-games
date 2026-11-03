# Adding a game

Run collection commands from the repository root. Each game lives under `games/<directory>/` on `main`; use a temporary feature branch for changes.

## Workspace contract

- Give the game a unique npm package name and a unique lowercase directory such as `games/my-game`. Directory names and catalog slugs use lowercase letters/digits separated by single hyphens, at most 64 characters; Windows device names such as `con` and `nul` are disallowed. Catalog slugs also cannot be `gallery`.
- Own source, runtime assets, tests, README, TypeScript/Vite configuration, and legal/provenance files within that directory. Builds must use tracked assets and the published NGNE package, without relying on local engine checkouts or authoring archives.
- Keep the package private and ESM. Pin runtime dependencies exactly. Each game chooses its own published `@ngne/core` version; there is no synchronized engine-version policy. Shared TypeScript, Vite, Node types, and Prettier are declared at the root.
- Provide `dev`, `typecheck`, `test`, `build`, and `preview` scripts. Root commands run all workspace tests/builds and fail on missing or failing scripts. Keep forwarding one-way; game scripts must not invoke the corresponding root script.
- Emit production output only to the game's `dist/`, including `dist/index.html`. Keep Vite's `base: "./"` so emitted resources work below the game's URL. The runtime remains a full-window page.

For example, a TypeScript/Vite game can use this package shape. The NGNE version below is an exact example; choose the version required by the new game.

```json
{
    "name": "my-game",
    "version": "0.1.0",
    "private": true,
    "type": "module",
    "engines": { "node": ">=24" },
    "scripts": {
        "dev": "vite --host 127.0.0.1",
        "typecheck": "tsc --noEmit && tsc --noEmit -p tests",
        "test": "node --experimental-strip-types --test tests/*.test.ts",
        "build": "npm run typecheck && vite build",
        "preview": "vite preview --host 127.0.0.1"
    },
    "dependencies": { "@ngne/core": "0.3.0" }
}
```

That example requires game-local `tsconfig.json`, `tests/tsconfig.json`, test files, Vite config, and an HTML entry. Keep relative config relationships intact; for example, `tests/tsconfig.json` extends `../tsconfig.json`. `games/starfall/` demonstrates the existing layout, but its gameplay/configuration need not become shared abstractions.

## Installation and working directory

The root package already includes `games/*` as npm workspaces. After creating the package and reviewing its exact dependencies, update only the root lockfile, inspect the dependency diff, then install:

```sh
npm install --package-lock-only
npm ci
```

Do not keep a game-local lockfile or install a second dependency tree manually. Commit the reviewed root lockfile with the game. Never commit `node_modules/`, `dist/`, or generated test output.

Run game commands through npm's workspace context:

```sh
npm run dev --workspace=my-game -- --port 5173 --strictPort
npm run typecheck --workspace=my-game
npm run test --workspace=my-game
npm run build --workspace=my-game
npm run preview --workspace=my-game -- --port 4173 --strictPort
```

The workspace package name is used here; the catalog uses the directory. They can differ. npm sets the game's working directory, preserving relative test/source paths. Do not replace workspace test forwarding with `node games/my-game/tests/*.test.ts` from the root.

## Catalog entry

Add an entry to `site/games.json`:

```json
{
    "slug": "my-game",
    "directory": "games/my-game",
    "title": "My Game",
    "description": "A concise description of what the player does.",
    "requirements": "State the actual browser, device, and input requirements.",
    "screenshot": "games/my-game/docs/screenshots/gameplay.png",
    "screenshotAlt": "Describe the gameplay visible in this capture."
}
```

Slugs and workspace directories must each be unique. All fields are required, nonempty, trimmed single-line strings. The screenshot must be a tracked PNG beneath that game's `docs/screenshots/`; use a representative 640×360 capture with accurate provenance. Preserve original art/audio attribution and copyright notices.

The assembler derives `./my-game/`, the source URL under `games/my-game` on `main`, and `gallery/my-game.png`. Adding a game requires no game-specific assembler branch. Update the root README catalog and any gallery introduction that no longer describes the collection accurately.

## Storage, fixtures, and legal files

- Browser storage is shared by origin, including all games on the same GitHub Pages host. Namespace keys by game, such as `my-game.settings` and `my-game.best`. Preserve established keys when moving a game; changing its URL path does not create a new origin.
- Keep browser fixtures under the game's `tests/` and outside the production entry/import graph. They may be served by the game's development server; they must not enter its production `dist/`.
- The assembler rejects symlinks/junctions, hidden local files, source maps, TypeScript/JSX source, archives, and directories such as `tests`, `fixtures`, `src`, `node_modules`, `art`, `artifacts`, and `evidence` in game output. Keep only intended runtime files and required notices there.
- Include required runtime notices through the game's `public/` or equivalent build input. Starfall includes `LICENSE-NGNE.txt` in its build. Determine the new game's own legal requirements; this does not license its art/audio or every other game.

## Validation

After updating the root lockfile, run from the root:

```sh
npm ci
npm run format:check
npm run typecheck
npm test
npm run build
npm run check:campaign
npm run preview -- --port 4173 --strictPort
```

`check:campaign` remains Starfall's three-seed regression check. Add the new game's meaningful automated/manual checks within its workspace; do not present a Starfall clear as acceptance of another game.

Check the gallery thumbnail, keyboard focus, Play and source links, direct game load/reload, resources, and license output. Also serve a copy of `dist/` beneath a real `/ngne-games/` directory and check `/ngne-games/<slug>/`; previewing only at `/` does not verify repository-prefixed paths. Record actual browser/device/audio/controller checks separately from automated tests.

See [Deployment](deployment.md) for publication prerequisites and approvals. A local build is not a published release.
