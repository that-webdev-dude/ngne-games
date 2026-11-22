import { test } from "node:test";
import assert from "node:assert/strict";
import { AREAS } from "../src/config/areas.ts";
import { G, K, spec } from "../src/config/enemies.ts";
import { REAR_WARNING, type Form, type ScriptEvent, type Slot, type WaveTag } from "../src/config/script.ts";

type Spawn = Extract<ScriptEvent, { type: "enemy" }>;
type Tagged = Extract<ScriptEvent, { tag: WaveTag }>;

/** Each area's signature formations, in area order. */
const SIGNATURES: readonly (readonly Form[])[] = [
    ["vee", "sideSweep"],
    ["echelon", "crossfire"],
    ["rearEntry", "orbitRing"],
];

/** Time to boss before the re-pace (s); the re-paced scripts stay within ±10%. */
const BOSS_AT = [95, 90, 85];

/** Area 2 barriers before the re-pace, as [gapX, gapW]. Only their times may move. */
const GRID_BARRIERS: readonly (readonly [number, number])[] = [
    [144, 70],
    [70, 64],
    [218, 64],
    [200, 64],
    [90, 64],
    [144, 60],
    [60, 64],
    [228, 64],
    [144, 54],
];

/** Allowed counts per area for each named slot, with its stand-in. */
const SLOTS: Record<Slot, { area: number; min: number; max: number; standIn: number | "barrier" }> = {
    gunship: { area: 0, min: 2, max: 3, standIn: K.skiff },
    mortar: { area: 1, min: 4, max: 6, standIn: K.turret },
    interceptor: { area: 2, min: 3, max: 4, standIn: K.dart },
    mines: { area: 2, min: 2, max: 3, standIn: K.rockS },
    fence: { area: 2, min: 2, max: 3, standIn: "barrier" },
};

const DENSITY_WINDOW = 6;

const spawns = (events: readonly ScriptEvent[]) => events.filter((e): e is Spawn => e.type === "enemy");
const tagged = (events: readonly ScriptEvent[]) => events.filter((e): e is Tagged => "tag" in e);
const firing = (e: Spawn) => spec(e.init.kind).gun !== undefined && e.init.gun !== G.none;
const timeOf = (events: readonly ScriptEvent[], type: "midboss" | "boss") => events.find((e) => e.type === type)!.at;

/** Waves (one per helper call) in order of their first event. */
function waves(events: readonly ScriptEvent[]) {
    const byId = new Map<number, { id: number; form: Form; slot?: Slot; at: number; events: Tagged[] }>();
    for (const e of tagged(events)) {
        const w = byId.get(e.tag.wave) ?? { id: e.tag.wave, form: e.tag.form, slot: e.tag.slot, at: e.at, events: [] };
        w.at = Math.min(w.at, e.at);
        w.events.push(e);
        byId.set(e.tag.wave, w);
    }
    return [...byId.values()].sort((a, b) => a.at - b.at || a.id - b.id);
}

/**
 * Spawn density: craft spawned in a DENSITY_WINDOW-second window, firing craft counting double.
 * Returns the densest window's weight and centre time (windows start at each spawn).
 */
function densest(events: readonly ScriptEvent[]): { weight: number; at: number } {
    const list = spawns(events);
    let weight = -1,
        at = 0;
    for (const start of list) {
        let w = 0;
        for (const e of list) if (e.at >= start.at && e.at < start.at + DENSITY_WINDOW) w += firing(e) ? 2 : 1;
        if (w > weight) {
            weight = w;
            at = start.at + DENSITY_WINDOW / 2;
        }
    }
    return { weight, at };
}

/** Firing craft spawned per minute of script time (start to boss). */
function firingPerMinute(events: readonly ScriptEvent[]): number {
    const boss = timeOf(events, "boss");
    return (spawns(events).filter((e) => firing(e) && e.at < boss).length / boss) * 60;
}

for (const [index, area] of AREAS.entries()) {
    const name = area.name;
    const events = area.events;
    const all = waves(events);

    test(`${name}: signature formations stay in their own area`, () => {
        const own = SIGNATURES[index]!;
        const forms = new Set(all.filter((w) => !w.slot).map((w) => w.form));
        for (const form of own) assert.ok(forms.has(form), `${name} uses its signature ${form}`);
        for (const [other, sig] of SIGNATURES.entries())
            if (other !== index) for (const form of sig) assert.ok(!forms.has(form), `${name} uses ${form}, a signature of ${AREAS[other]!.name}`);
    });

    test(`${name}: the four-hornet line and the mirrored loop pair appear at most twice`, () => {
        for (const form of ["hornetLine", "loopPair"] as const) {
            const n = all.filter((w) => w.form === form).length;
            assert.ok(n <= 2, `${name} has ${n} ${form} waves`);
        }
    });

    test(`${name}: no three consecutive waves from the same helper`, () => {
        for (let i = 2; i < all.length; i++) {
            const [a, b, c] = [all[i - 2]!, all[i - 1]!, all[i]!];
            assert.ok(!(a.form === b.form && b.form === c.form), `${name}: three ${c.form} waves in a row ending at ${c.at}s`);
        }
    });

    test(`${name}: craft enter from at least two directions`, () => {
        const entries = new Set(spawns(events).map((e) => e.tag.entry));
        assert.ok(entries.size >= 2, `${name} entries: ${[...entries].join(", ")}`);
    });

    test(`${name}: follows the pacing template`, () => {
        const boss = timeOf(events, "boss");
        const mid = timeOf(events, "midboss");
        const guns = spawns(events).filter(firing);
        const gunsBefore = (t: number) => guns.filter((e) => e.at < t);
        const gunsAfter = (t: number) => guns.filter((e) => e.at > t);

        assert.ok(Math.abs(boss - BOSS_AT[index]!) <= BOSS_AT[index]! * 0.1, `${name} time to boss ${boss}s`);

        const hook = all.find((w) => SIGNATURES[index]!.includes(w.form) && !w.slot);
        assert.ok(hook && hook.at < 12, `${name} hook with a signature formation in the first 12 s`);
        assert.ok(
            gunsBefore(mid).some((e) => e.at >= 12),
            `${name} builds between the hook and the mid-boss`,
        );

        const lull = mid - gunsBefore(mid).at(-1)!.at;
        assert.ok(lull >= 3 && lull <= 3.5, `${name} lull before the mid-boss is ${lull.toFixed(2)}s`);

        const recovery = gunsAfter(mid)[0]!.at - mid;
        assert.ok(recovery >= 3 && recovery <= 3.5, `${name} recovery lull after the mid-boss is ${recovery.toFixed(2)}s`);

        const peak = densest(events).at;
        assert.ok(peak >= boss * 0.7 && peak <= boss * 0.8, `${name} densest wave centred at ${peak}s (${((peak / boss) * 100).toFixed(1)}%)`);

        const quiet = boss - gunsBefore(boss).at(-1)!.at;
        assert.ok(quiet >= 2 && quiet <= 3, `${name} quiet before the boss is ${quiet.toFixed(2)}s`);
        assert.equal(
            events.filter((e) => e.type === "enemy" && e.at > boss).length,
            0,
            `${name} spawns nothing after the boss`,
        );
    });
}

test("challenge escalates: firing craft per minute and the densest window rise from area to area", () => {
    const rate = AREAS.map((a) => firingPerMinute(a.events));
    const peak = AREAS.map((a) => densest(a.events).weight);
    for (let i = 1; i < AREAS.length; i++) {
        assert.ok(rate[i]! > rate[i - 1]!, `firing craft per minute ${rate.map((r) => r.toFixed(1)).join(" / ")}`);
        assert.ok(peak[i]! > peak[i - 1]!, `densest ${DENSITY_WINDOW} s window weight ${peak.join(" / ")}`);
    }
});

test("named slots exist with their stand-ins in the agreed counts", () => {
    for (const [slot, rule] of Object.entries(SLOTS) as [Slot, (typeof SLOTS)[Slot]][]) {
        for (const [index, area] of AREAS.entries()) {
            const slotted = waves(area.events).filter((w) => w.slot === slot);
            if (index !== rule.area) {
                assert.equal(slotted.length, 0, `${slot} slots in ${area.name}`);
                continue;
            }
            assert.ok(slotted.length >= rule.min && slotted.length <= rule.max, `${area.name} has ${slotted.length} ${slot} slots`);
            for (const w of slotted)
                for (const e of w.events) {
                    if (rule.standIn === "barrier") assert.equal(e.type, "barrier", `${slot} stand-in at ${e.at}s`);
                    else assert.ok(e.type === "enemy" && e.init.kind === rule.standIn, `${slot} stand-in at ${e.at}s`);
                }
        }
    }
    const boss = timeOf(AREAS[2]!.events, "boss");
    for (const w of waves(AREAS[2]!.events).filter((w) => w.slot === "fence"))
        assert.ok(w.at >= boss / 2, `fence at ${w.at}s is in the second half of ${AREAS[2]!.name}`);
});

test("Area 2 keeps its barriers; only their times move", () => {
    const grid = AREAS[1]!.events.flatMap((e) => (e.type === "barrier" ? [[e.gapX, e.gapW] as const] : []));
    const key = (b: readonly [number, number]) => b.join("/");
    assert.deepEqual(grid.map(key).sort(), GRID_BARRIERS.map(key).sort());
});

test("rear entries are unarmed and announced by a glow where they appear", () => {
    for (const area of AREAS) {
        const glows = area.events.filter((e) => e.type === "telegraph");
        for (const e of spawns(area.events).filter((s) => s.tag.entry === "rear")) {
            assert.ok(!firing(e), `${area.name} rear entry at ${e.at}s is unarmed`);
            const glow = glows.find((g) => g.x === e.init.x && Math.abs(g.at + REAR_WARNING - e.at) < 1e-9 && g.tag.wave === e.tag.wave);
            assert.ok(glow, `${area.name} rear entry at ${e.at}s has its glow`);
        }
    }
});
