import assert from "node:assert/strict";
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    realpathSync,
    rmdirSync,
    rmSync,
    symlinkSync,
    unlinkSync,
    writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { buildSite } from "../build-site.mjs";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const rootPackage = JSON.parse(readFileSync(path.join(repositoryRoot, "package.json"), "utf8"));

function fixture(t, names = ["alpha"]) {
    const parent = realpathSync(tmpdir());
    const root = mkdtempSync(path.join(parent, "ngne-games-site-"));
    t.after(() => {
        assert.equal(path.dirname(path.resolve(root)), parent);
        assert.ok(path.basename(root).startsWith("ngne-games-site-"));
        rmSync(root, { recursive: true, force: true });
    });
    const put = (relative, contents) => {
        const filename = path.join(root, relative);
        mkdirSync(path.dirname(filename), { recursive: true });
        writeFileSync(filename, contents);
    };
    for (const relative of ["site/index.html", "site/style.css", "tooling/build-site.mjs"]) {
        put(relative, readFileSync(path.join(repositoryRoot, relative)));
    }
    const catalog = names.map((slug) => ({
        slug,
        directory: `games/${slug}`,
        title: `${slug} game`,
        description: "A small fixture game.",
        requirements: "A browser.",
        screenshot: `games/${slug}/docs/screenshots/combat.png`,
        screenshotAlt: `${slug} gameplay`,
    }));
    for (const game of catalog) {
        put(
            `${game.directory}/package.json`,
            JSON.stringify({
                name: game.slug,
                private: true,
                scripts: {
                    build: 'node -e "process.exit(0)"',
                    test: "node -e \"require('node:fs').writeFileSync('test-ran', '')\"",
                },
            }),
        );
        put(
            `${game.directory}/dist/index.html`,
            '<link rel="stylesheet" href="./assets/main.css"><script type="module" src="./assets/main.js"></script>',
        );
        put(
            `${game.directory}/dist/assets/main.js`,
            'const audio = new URL("./nested/sound.wav", import.meta.url);',
        );
        put(
            `${game.directory}/dist/assets/main.css`,
            'body { background: url("./nested/image.png"); }',
        );
        put(`${game.directory}/dist/assets/nested/sound.wav`, Buffer.from([82, 73, 70, 70]));
        put(`${game.directory}/dist/assets/nested/image.png`, Buffer.from([137, 80, 78, 71]));
        put(`${game.directory}/dist/LICENSE.txt`, "Fixture license");
        put(game.screenshot, Buffer.from([137, 80, 78, 71, 1]));
    }
    put("package.json", JSON.stringify({ ...rootPackage, devDependencies: {} }));
    const saveCatalog = () => put("site/games.json", JSON.stringify(catalog));
    saveCatalog();
    return { root, put, catalog, saveCatalog };
}

function npmRun(root, script) {
    assert.ok(
        process.env.npm_execpath,
        "Run these integration checks through npm run test:tooling or npm test",
    );
    const env = { ...process.env };
    // Child npm scripts start their own test runner, rather than inheriting this runner's context.
    delete env.NODE_TEST_CONTEXT;
    return spawnSync(process.execPath, [process.env.npm_execpath, "run", script], {
        cwd: root,
        env,
        encoding: "utf8",
        timeout: 30000,
    });
}

test("two catalog entries produce complete nested output and repository-prefixed relative links", (t) => {
    const f = fixture(t, ["alpha", "beta"]);
    const output = buildSite(f.root);
    assert.equal(output, path.join(f.root, "dist"));
    const html = readFileSync(path.join(output, "index.html"), "utf8");
    assert.doesNotMatch(html, /<script|<iframe|<canvas|@ngne|GAME_CARDS/i);
    assert.equal((html.match(/<article /g) ?? []).length, 2);
    for (const game of f.catalog) {
        assert.ok(html.includes(`href="./${game.slug}/"`));
        assert.ok(
            html.includes(
                `href="https://github.com/that-webdev-dude/ngne-games/tree/main/${game.directory}"`,
            ),
        );
        for (const relative of [
            "index.html",
            "assets/main.js",
            "assets/main.css",
            "assets/nested/sound.wav",
            "assets/nested/image.png",
            "LICENSE.txt",
        ]) {
            assert.deepEqual(
                readFileSync(path.join(output, game.slug, relative)),
                readFileSync(path.join(f.root, game.directory, "dist", relative)),
            );
        }
        assert.deepEqual(
            readFileSync(path.join(output, "gallery", `${game.slug}.png`)),
            readFileSync(path.join(f.root, game.screenshot)),
        );
    }
    const base = new URL("https://example.test/ngne-games/");
    for (const [, attribute] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const url = new URL(attribute, base);
        if (url.origin !== base.origin || url.hash) continue;
        assert.ok(url.pathname.startsWith(base.pathname));
        const relative = url.pathname.slice(base.pathname.length);
        assert.ok(
            existsSync(path.join(output, relative, url.pathname.endsWith("/") ? "index.html" : "")),
            attribute,
        );
    }
    assert.ok(!existsSync(path.join(output, "site")));
    assert.ok(!existsSync(path.join(output, "tooling")));
});

test("metadata cannot inject HTML or link schemes", (t) => {
    const f = fixture(t);
    f.catalog[0].title = "Alpha <script>alert(\"x\")</script> & 'friends' $& $$ $`";
    f.catalog[0].screenshotAlt = '" onerror="alert(1)';
    f.saveCatalog();
    buildSite(f.root);
    const html = readFileSync(path.join(f.root, "dist/index.html"), "utf8");
    assert.ok(
        html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;friends&#39;"),
    );
    assert.ok(html.includes('alt="&quot; onerror=&quot;alert(1)"'));
    assert.doesNotMatch(html, /<script|alt="" onerror=/);
    assert.ok(html.includes("$&amp; $$ $`"));
});

test("rebuild removes stale root output without changing game builds or other directories", (t) => {
    const f = fixture(t);
    f.put("dist/retired-game/old.js", "stale");
    f.put(".test-output/keep.txt", "private evidence");
    f.put("games/alpha/src/keep.ts", "source");
    buildSite(f.root);
    assert.ok(!existsSync(path.join(f.root, "dist/retired-game")));
    assert.equal(
        readFileSync(path.join(f.root, ".test-output/keep.txt"), "utf8"),
        "private evidence",
    );
    assert.equal(readFileSync(path.join(f.root, "games/alpha/src/keep.ts"), "utf8"), "source");
    assert.ok(existsSync(path.join(f.root, "games/alpha/dist/index.html")));
});

test("invalid catalogs fail before replacing existing output", (t) => {
    const f = fixture(t);
    f.put("dist/keep.txt", "previous artifact");
    for (const change of [
        (entry) => {
            entry.slug = "../escape";
        },
        (entry) => {
            entry.slug = "gallery";
        },
        (entry) => {
            entry.slug = "index.html";
        },
        (entry) => {
            entry.slug = "Starfall";
        },
        (entry) => {
            entry.slug = "con";
        },
        (entry) => {
            entry.slug = "x".repeat(65);
        },
        (entry) => {
            entry.slug = "javascript:alert(1)";
        },
        (entry) => {
            entry.directory = "games/../outside";
        },
        (entry) => {
            entry.directory = "C:/outside";
        },
        (entry) => {
            entry.directory = "games\\alpha";
        },
        (entry) => {
            entry.screenshot = "games/alpha/docs/screenshots/../../../../outside.png";
        },
        (entry) => {
            entry.screenshot = "/outside.png";
        },
        (entry) => {
            entry.screenshot = "https://example.test/picture.png";
        },
        (entry) => {
            entry.title = "";
        },
        (entry) => {
            entry.description = "bad\ntext";
        },
    ]) {
        const entries = structuredClone(f.catalog);
        change(entries[0]);
        f.put("site/games.json", JSON.stringify(entries));
        assert.throws(() => buildSite(f.root));
        assert.equal(readFileSync(path.join(f.root, "dist/keep.txt"), "utf8"), "previous artifact");
    }
    for (const entries of [
        [],
        {},
        [null],
        [f.catalog[0], f.catalog[0]],
        [f.catalog[0], { ...f.catalog[0], slug: "beta" }],
    ]) {
        f.put("site/games.json", JSON.stringify(entries));
        assert.throws(() => buildSite(f.root));
    }
});

test("missing build, entry point, or screenshot fails clearly and preserves previous output", (t) => {
    const f = fixture(t);
    f.put("dist/keep.txt", "previous artifact");
    f.catalog[0].directory = "games/missing";
    f.saveCatalog();
    assert.throws(() => buildSite(f.root), /Missing input/);
    f.catalog[0].directory = "games/alpha";
    f.catalog[0].screenshot = "games/alpha/docs/screenshots/missing.png";
    f.saveCatalog();
    assert.throws(() => buildSite(f.root), /Missing input/);
    f.catalog[0].screenshot = "games/alpha/docs/screenshots/combat.png";
    f.saveCatalog();
    unlinkSync(path.join(f.root, "games/alpha/dist/index.html"));
    assert.throws(() => buildSite(f.root), /Missing input.*build:games/);
    assert.equal(readFileSync(path.join(f.root, "dist/keep.txt"), "utf8"), "previous artifact");
});

test("test fixtures, source maps, source, archives, and dependencies cannot enter production output", (t) => {
    const f = fixture(t);
    for (const relative of [
        "tests/fixture.html",
        "fixtures/data.json",
        "node_modules/pkg/index.js",
        ".test-output/report.json",
        ".env",
        "assets/main.js.map",
        "src/main.ts",
        "package-lock.json",
        "archive.zip",
    ]) {
        const full = path.join(f.root, "games/alpha/dist", relative);
        f.put(`games/alpha/dist/${relative}`, "must not ship");
        assert.throws(() => buildSite(f.root), /Non-production input/);
        // Remove only the test-created file; empty parents are also rejected, so remove those below.
        unlinkSync(full);
        let directory = path.dirname(full);
        const gameBuild = path.join(f.root, "games/alpha/dist");
        while (directory !== gameBuild && directory !== path.join(gameBuild, "assets")) {
            rmdirSync(directory); // Empty directory only; never recursive.
            directory = path.dirname(directory);
        }
    }
});

test("junctions in workspace inputs cannot escape the project", (t) => {
    const f = fixture(t);
    const outside = fixture(t, ["external"]);
    const link = path.join(f.root, "games/linked");
    symlinkSync(path.join(outside.root, "games/external"), link, "junction");
    try {
        f.catalog[0].directory = "games/linked";
        f.catalog[0].screenshot = "games/linked/docs/screenshots/combat.png";
        f.saveCatalog();
        assert.throws(() => buildSite(f.root), /Symbolic link or junction/);
        assert.ok(existsSync(path.join(outside.root, "games/external/dist/index.html")));
    } finally {
        unlinkSync(link);
    }
});

test("root dist and nested output junctions are rejected without deleting their targets", (t) => {
    const f = fixture(t);
    const outside = fixture(t);
    const target = path.join(outside.root, "protected");
    outside.put("protected/keep.txt", "untouched");
    for (const relative of ["dist", "dist/nested"]) {
        const link = path.join(f.root, relative);
        mkdirSync(path.dirname(link), { recursive: true });
        symlinkSync(target, link, "junction");
        try {
            assert.throws(() => buildSite(f.root), /Unsafe output|Symbolic link or junction/);
            assert.equal(readFileSync(path.join(target, "keep.txt"), "utf8"), "untouched");
        } finally {
            unlinkSync(link);
        }
    }
});

test("junctions inside a game build are rejected before copying", (t) => {
    const f = fixture(t);
    const link = path.join(f.root, "games/alpha/dist/linked");
    symlinkSync(path.join(f.root, "site"), link, "junction");
    try {
        assert.throws(() => buildSite(f.root), /Symbolic link or junction/);
    } finally {
        unlinkSync(link);
    }
});

test("CLI resolves the project from its module location and returns failure for missing builds", (t) => {
    const f = fixture(t);
    const run = () =>
        spawnSync(process.execPath, [path.join(f.root, "tooling/build-site.mjs")], {
            cwd: tmpdir(),
            encoding: "utf8",
            timeout: 10000,
        });
    assert.equal(run().status, 0);
    unlinkSync(path.join(f.root, "games/alpha/dist/index.html"));
    const failed = run();
    assert.equal(failed.status, 1);
    assert.match(failed.stderr, /Site build failed: Missing input/);
});

test("root build propagates missing or failing workspace builds without assembling", (t) => {
    const f = fixture(t);
    f.put("dist/keep.txt", "previous artifact");
    for (const scripts of [{}, { build: 'node -e "process.exit(7)"' }]) {
        f.put(
            "games/alpha/package.json",
            JSON.stringify({ name: "alpha", private: true, scripts }),
        );
        const result = npmRun(f.root, "build");
        assert.ok(result.status !== null && result.status !== 0, result.stdout + result.stderr);
        assert.doesNotMatch(result.stdout, /Built gallery/);
        assert.equal(readFileSync(path.join(f.root, "dist/keep.txt"), "utf8"), "previous artifact");
    }
});

test("root test stops on tooling failure before running game tests", (t) => {
    const f = fixture(t);
    f.put(
        "tooling/tests/failure.test.mjs",
        'import test from "node:test"; test("deliberate fixture failure", () => { throw new Error("fixture failure"); });',
    );
    const result = npmRun(f.root, "test");
    assert.ok(result.status !== null && result.status !== 0, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /fixture failure/);
    assert.ok(!existsSync(path.join(f.root, "games/alpha/test-ran")));
});

test("root build assembles successful workspaces using the declared npm commands", (t) => {
    const f = fixture(t, ["alpha", "beta"]);
    const result = npmRun(f.root, "build");
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.ok(existsSync(path.join(f.root, "dist/alpha/index.html")));
    assert.ok(existsSync(path.join(f.root, "dist/beta/index.html")));
});

test("root test runs games in workspace context and propagates a game failure", (t) => {
    const f = fixture(t, ["alpha", "beta"]);
    f.put(
        "tooling/tests/pass.test.mjs",
        'import test from "node:test"; test("fixture tooling pass", () => {});',
    );
    f.put(
        "games/beta/package.json",
        JSON.stringify({
            name: "beta",
            private: true,
            scripts: { test: 'node -e "process.exit(7)"' },
        }),
    );
    const result = npmRun(f.root, "test");
    assert.ok(result.status !== null && result.status !== 0, result.stdout + result.stderr);
    assert.ok(existsSync(path.join(f.root, "games/alpha/test-ran")));
    assert.ok(!existsSync(path.join(f.root, "test-ran")));
});
