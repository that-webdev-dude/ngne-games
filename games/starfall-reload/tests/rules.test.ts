import { test } from "node:test";
import assert from "node:assert/strict";
import { addChips, addScoreRaw, armourHit, chainMultiplier, chipsForNext } from "../src/sim/rules.ts";
import { newRun } from "../src/sim/context.ts";
import { EXTENDS, PLAYER, POWER } from "../src/config/tuning.ts";
import { DEFAULT_SCORES, insertScore, placeFor } from "../src/services/storage.ts";
import { fitView } from "../src/services/display.ts";
import { AREAS } from "../src/config/areas.ts";
import { ENEMIES } from "../src/config/enemies.ts";
import { SHEETS } from "../src/render/atlas.ts";
import { FONT_CHARS } from "../src/render/font.ts";

test("power is armour: a hit costs two levels, a hit at level 0 destroys the ship", () => {
    assert.deepEqual(armourHit(4), { destroyed: false, power: 2 });
    assert.deepEqual(armourHit(1), { destroyed: false, power: 0 });
    assert.deepEqual(armourHit(0), { destroyed: true, power: 0 });
});

test("chips level the ship up through the specified thresholds and stop at max", () => {
    const run = newRun();
    assert.equal(addChips(run, POWER.chipsPerLevel[0]! - 1), 0);
    assert.equal(addChips(run, 1), 1);
    assert.equal(run.power, 1);
    addChips(run, 1000);
    assert.equal(run.power, PLAYER.maxPower);
    assert.equal(run.chips, 0);
    assert.equal(chipsForNext(PLAYER.maxPower), Infinity);
});

test("chain multiplier steps every 8 kills and caps at x8", () => {
    assert.equal(chainMultiplier(0), 1);
    assert.equal(chainMultiplier(7), 1);
    assert.equal(chainMultiplier(8), 2);
    assert.equal(chainMultiplier(500), 8);
});

test("extends are awarded once per threshold", () => {
    const run = newRun();
    const lives = run.lives;
    assert.equal(addScoreRaw(run, EXTENDS[0] - 1), false);
    assert.equal(addScoreRaw(run, 1), true);
    assert.equal(addScoreRaw(run, 10), false);
    assert.equal(run.lives, lives + 1);
});

test("high-score table placement and insertion", () => {
    assert.equal(placeFor(DEFAULT_SCORES, 0), -1);
    assert.equal(placeFor(DEFAULT_SCORES, 10), -1);
    assert.equal(placeFor(DEFAULT_SCORES, 900_000), 0);
    const table = insertScore(DEFAULT_SCORES, { name: "ABC", score: 100_000, area: 2 });
    assert.equal(table.length, 10);
    assert.equal(table.findIndex((e) => e.name === "ABC"), 7);
});

test("display fit keeps integer scale when it wastes little, otherwise fills", () => {
    assert.deepEqual([fitView(1920, 1080, 1).scale, fitView(1920, 1080, 1).integer], [3, true]);
    assert.equal(fitView(1366, 768, 1).scale, 2);
    const odd = fitView(1000, 600, 1);
    assert.equal(odd.integer, false);
    assert.ok(Math.abs(odd.cssWidth - 1000) < 1);
});

test("content tables are consistent", () => {
    for (const area of AREAS) {
        const at = area.events.map((e) => e.at);
        assert.deepEqual(at, [...at].sort((a, b) => a - b), `${area.name} events sorted`);
        assert.equal(area.events.filter((e) => e.type === "boss").length, 1, `${area.name} has one boss`);
        assert.equal(area.events.filter((e) => e.type === "midboss").length, 1, `${area.name} has one mid-boss`);
        for (const text of [area.name, area.subtitle, area.target, ...area.dossier])
            for (const ch of text) assert.ok(FONT_CHARS.includes(ch), `glyph ${JSON.stringify(ch)} in ${text}`);
    }
    for (const e of ENEMIES) assert.ok(SHEETS[e.sprite], `${e.name} sprite ${e.sprite} is specified`);
});
