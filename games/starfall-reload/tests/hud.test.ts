import { test } from "node:test";
import assert from "node:assert/strict";
import { cabinet, input } from "./helpers/harness.ts";
import { Pose, Ship } from "../src/ecs/components.ts";
import { PLAYER } from "../src/config/tuning.ts";
import { FIELD_H, HUD } from "../src/config/view.ts";

test("the ship's y clamp keeps its sprite clear of both in-field HUD rows", async () => {
    const h = await cabinet("HUD-CLAMP");
    for (let i = 0; i < 40; i++) h.tick();
    h.tick(input([], ["Enter"]));
    assert.equal(h.flow().mode, "play");
    // The drawn ship spans rows 4-26 of its 24x32 frame (art/player.png), pivot at row 16.
    const above = 12,
        below = 11;
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
    assert.ok(lo - above >= HUD.top, `top edge ${lo - above} overlaps the top row`);
    assert.ok(hi + below <= FIELD_H - HUD.bottom, `bottom edge ${hi + below} overlaps the bottom row`);
});
