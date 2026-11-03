import {
    copyFileSync,
    lstatSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    realpathSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = "https://github.com/that-webdev-dude/ngne-games";
const defaultRoot = fileURLToPath(new URL("../", import.meta.url));
const marker = "<!-- GAME_CARDS -->";
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const deviceNamePattern = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/;
const forbiddenNames = new Set([
    "node_modules",
    "src",
    "tests",
    "test",
    "fixtures",
    "art",
    "artifacts",
    "evidence",
    "package.json",
    "package-lock.json",
]);

function inside(parent, candidate) {
    const relative = path.relative(parent, candidate);
    return (
        relative !== "" &&
        relative !== ".." &&
        !relative.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relative)
    );
}

// Reject links in every component, including links that currently resolve inside the root.
function inputPath(root, relative, kind) {
    const parts = relative.split("/");
    if (
        parts.some(
            (part) => !part || part === "." || part === ".." || !/^[a-zA-Z0-9_.-]+$/.test(part),
        )
    ) {
        throw new Error(`Unsafe input path: ${relative}`);
    }
    let current = root;
    for (const part of parts) {
        current = path.join(current, part);
        const stat = lstatSync(current, { throwIfNoEntry: false });
        if (!stat)
            throw new Error(
                `Missing input: ${relative}. Run npm run build:games before assembling the site.`,
            );
        if (stat.isSymbolicLink())
            throw new Error(`Symbolic link or junction is not allowed: ${relative}`);
        if (current !== path.join(root, ...parts) && !stat.isDirectory())
            throw new Error(`Not a directory: ${current}`);
    }
    if (!inside(root, realpathSync(current)))
        throw new Error(`Input escapes repository: ${relative}`);
    const stat = lstatSync(current);
    if (kind === "file" ? !stat.isFile() : !stat.isDirectory())
        throw new Error(`Expected ${kind}: ${relative}`);
    return current;
}

function walk(directory, production = false) {
    const files = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isSymbolicLink())
            throw new Error(`Symbolic link or junction is not allowed: ${full}`);
        if (
            production &&
            (entry.name.startsWith(".") ||
                forbiddenNames.has(entry.name.toLowerCase()) ||
                /\.(?:map|tsx?|jsx|zip|tar|gz)$/i.test(entry.name))
        ) {
            throw new Error(`Non-production input in game build: ${full}`);
        }
        if (entry.isDirectory()) files.push(...walk(full, production));
        else if (entry.isFile()) files.push(full);
        else throw new Error(`Unsupported filesystem entry: ${full}`);
    }
    return files;
}

function textField(entry, key) {
    const value = entry[key];
    if (
        typeof value !== "string" ||
        value.trim() !== value ||
        !value ||
        value.length > 1000 ||
        /[\u0000-\u001f\u007f]/.test(value)
    ) {
        throw new Error(`Invalid catalog ${key}`);
    }
    return value;
}

function escapeHtml(value) {
    return value.replace(
        /[&<>"']/g,
        (character) =>
            ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
    );
}

function card(game) {
    const play = `./${game.slug}/`;
    const source = `${repository}/tree/main/${game.directory}`;
    return `<li><article class="game" aria-labelledby="game-${game.slug}">
        <div class="game-image"><img src="./gallery/${game.slug}.png" alt="${escapeHtml(game.screenshotAlt)}" width="640" height="360" /></div>
        <div class="game-info">
            <h3 id="game-${game.slug}">${escapeHtml(game.title)}</h3>
            <p class="description">${escapeHtml(game.description)}</p>
            <p class="requirements">${escapeHtml(game.requirements)}</p>
            <div class="game-actions">
                <a class="play" href="${play}" aria-label="Play ${escapeHtml(game.title)}">Play game <span aria-hidden="true">↗</span></a>
                <a class="source" href="${source}" aria-label="View ${escapeHtml(game.title)} source">View source</a>
            </div>
        </div>
    </article></li>`;
}

export function buildSite(projectRoot = defaultRoot) {
    const root = realpathSync(projectRoot);
    const output = path.resolve(root, "dist");
    if (path.dirname(output) !== root || !inside(root, output))
        throw new Error("Unsafe output directory");
    // Validate the existing output tree before deletion; never traverse a junction or symlink.
    const previous = lstatSync(output, { throwIfNoEntry: false });
    if (previous) {
        if (previous.isSymbolicLink() || !previous.isDirectory() || realpathSync(output) !== output)
            throw new Error("Unsafe output directory: dist");
        walk(output);
    }
    const template = readFileSync(inputPath(root, "site/index.html", "file"), "utf8");
    if (template.split(marker).length !== 2)
        throw new Error("Gallery template requires exactly one GAME_CARDS marker");
    const style = inputPath(root, "site/style.css", "file");
    const catalog = JSON.parse(readFileSync(inputPath(root, "site/games.json", "file"), "utf8"));
    if (!Array.isArray(catalog) || catalog.length === 0)
        throw new Error("Catalog must be a nonempty array");
    const slugs = new Set(["gallery"]);
    const directories = new Set();
    const games = catalog.map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry))
            throw new Error("Invalid catalog entry");
        const game = Object.fromEntries(
            [
                "slug",
                "directory",
                "title",
                "description",
                "requirements",
                "screenshot",
                "screenshotAlt",
            ].map((key) => [key, textField(entry, key)]),
        );
        if (
            !slugPattern.test(game.slug) ||
            game.slug.length > 64 ||
            deviceNamePattern.test(game.slug) ||
            slugs.has(game.slug)
        )
            throw new Error(`Invalid, duplicate, or reserved slug: ${game.slug}`);
        slugs.add(game.slug);
        if (
            !/^games\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(game.directory) ||
            game.directory.slice(6).length > 64 ||
            deviceNamePattern.test(game.directory.slice(6)) ||
            directories.has(game.directory)
        )
            throw new Error(`Invalid or duplicate workspace directory: ${game.directory}`);
        directories.add(game.directory);
        inputPath(root, `${game.directory}/package.json`, "file");
        if (
            !game.screenshot.startsWith(`${game.directory}/docs/screenshots/`) ||
            !game.screenshot.endsWith(".png")
        )
            throw new Error(`Invalid screenshot path: ${game.screenshot}`);
        game.image = inputPath(root, game.screenshot, "file");
        game.build = inputPath(root, `${game.directory}/dist`, "directory");
        inputPath(root, `${game.directory}/dist/index.html`, "file");
        game.files = walk(game.build, true);
        return game;
    });
    const html = template.replace(marker, () => games.map(card).join("\n"));
    // Every input and the exact output target have been validated before clearing root dist.
    rmSync(output, { recursive: true, force: true });
    mkdirSync(path.join(output, "gallery"), { recursive: true });
    writeFileSync(path.join(output, "index.html"), html);
    copyFileSync(style, path.join(output, "style.css"));
    for (const game of games) {
        copyFileSync(game.image, path.join(output, "gallery", `${game.slug}.png`));
        for (const file of game.files) {
            const destination = path.join(output, game.slug, path.relative(game.build, file));
            mkdirSync(path.dirname(destination), { recursive: true });
            copyFileSync(file, destination);
        }
    }
    return output;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        buildSite();
        console.log("Built gallery and game output in dist/");
    } catch (error) {
        console.error(`Site build failed: ${error.message}`);
        process.exitCode = 1;
    }
}
