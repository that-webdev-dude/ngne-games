import { test } from "node:test";
import assert from "node:assert/strict";
import { cabinet, input } from "./helpers/harness.ts";
import { Pose, Ship } from "../src/ecs/components.ts";
import { PLAYER } from "../src/config/tuning.ts";
import { FIELD_H, HUD } from "../src/config/view.ts";
import { SHEETS } from "../src/render/atlas.ts";

test("the ship's y clamp keeps its sprite clear of both in-field HUD rows", async () => {
    const h = await cabinet("HUD-CLAMP");
    for (let i = 0; i < 40; i++) h.tick();
    h.tick(input([], ["Enter"]));
    assert.equal(h.flow().mode, "play");
    const half = SHEETS.player!.h / 2;
    let lo = Infinity,
        hi = -Infinity;
    for (const [key, ticks] of [
        ["ArrowDown", 60 * 8],
        ["ArrowUp", 60 * 6],
    ] as const) {
        for (let i = 0; i < ticks; i++) {
            const sim = h.sim();
            if (sim.player && sim.world.has(sim.player)) sim.world.write(sim.player, Ship, "invuln", 5);
            h.tick(input([key]));
            const ship = h.sim().player;
            if (!ship || !h.sim().world.has(ship) || h.sim().world.read(ship, Ship, "entering") !== 0) continue;
            const y = h.sim().world.read(ship, Pose, "y")!;
            lo = Math.min(lo, y);
            hi = Math.max(hi, y);
        }
    }
    assert.equal(h.flow().mode, "play");
    // Both limits are reached and never passed.
    assert.equal(lo, PLAYER.marginTop);
    assert.equal(hi, FIELD_H - PLAYER.marginBottom);
    // The sprite's edges stay outside the top row (y < HUD.top) and the bottom row (y >= FIELD_H - HUD.bottom).
    assert.ok(lo - half >= HUD.top, `top edge ${lo - half} overlaps the top row`);
    assert.ok(hi + half <= FIELD_H - HUD.bottom, `bottom edge ${hi + half} overlaps the bottom row`);
});
