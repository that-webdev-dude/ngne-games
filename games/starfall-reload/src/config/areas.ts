import type { MusicId } from "../audio/synth.ts";
import { DROP, K } from "./enemies.ts";
import { Script, type ScriptEvent } from "./script.ts";

export interface AreaDef {
    readonly number: string;
    readonly name: string;
    readonly subtitle: string;
    /** Briefing lines for the area intro card. */
    readonly dossier: readonly string[];
    readonly target: string;
    readonly scroll: number;
    readonly music: MusicId;
    readonly backdrop: "cirrus" | "grid" | "aurora";
    readonly events: readonly ScriptEvent[];
}

// Pacing template for every area: hook with the area's signature formation (0-12 s),
// build, 3-3.5 s lull, mid-boss, 3-3.5 s recovery, second build to the densest wave at 70-80%
// of time to boss, 2-3 s quiet, WARNING and boss. A lull admits no new firing craft.
//
// Challenge escalates from area to area: firing craft per minute and the densest 6 s window
// both rise (tests/encounters.test.ts). Area 1 introduces one wave at a time, Area 2 overlaps
// waves and fires through barrier gaps, Area 3 stacks two or three formations at once. Power is
// armour, so chip drops are kept scarce: popcorn that only adds bodies drops nothing.

/** Area 1 signatures: V formations and side sweeps. */
const cirrus = new Script()
    // Hook.
    .vee(1.5, 144, 7)
    .sideSweep(3.5, 1, 5)
    .sideSweep(4.5, -1, 5)
    .vee(6.5, 144, 3, { kind: K.hornet, vy: 55 })
    .gunship(9, 144, 62, 6, { drop: DROP.chip })
    // Build.
    .weave(12.5, 72, 5)
    .dive(13.5, [72, 216], { drop: DROP.none })
    .sideSweep(15.5, 1, 6, { y: 60 })
    .loopPair(17, 6)
    .vee(19.5, 100, 5, { kind: K.hornet, vy: 55, drop: DROP.none })
    .dive(21.5, [50, 238], { kind: K.dart })
    .line(23, K.dart, 20, 70, 115, 6, 0.2)
    .stations(25, K.hornet, [[60, 80], [228, 80]], 4)
    .sideSweep(26.5, -1, 6, { y: 70 })
    .vee(28, 188, 7)
    .gunship(30, 70, 70, 7, { drop: DROP.capsule })
    .weave(32, 220, 6)
    .dive(33.5, [100, 188])
    .sideSweep(35.5, -1, 7, { y: 50 })
    .hornetLine(37.5)
    .vee(40.5, 144, 7)
    .dive(42, [40, 100, 188, 248], { kind: K.dart })
    .sideSweep(44.5, 1, 7, { y: 60 })
    .stations(48.6, K.hornet, [[72, 70], [216, 70]], 2, { leave: -60, drop: DROP.none })
    // Lull.
    .weave(49.5, 144, 5)
    .midboss(52, "lancer")
    // Recovery.
    .sideSweep(53, 1, 5)
    .sideSweep(54, -1, 5)
    // Second build.
    .dive(55.2, [50, 110, 178, 238], { gap: 0.2, drop: DROP.none })
    .weave(59, 60, 6)
    .loopPair(61, 8, { speed: 2.5 })
    .vee(63.5, 100, 7)
    // Densest wave.
    .vee(66, 144, 5, { kind: K.hornet, vy: 50, drop: DROP.none })
    .sideSweep(67, 1, 5)
    .hornetLine(68)
    .gunship(68.5, 144, 55, 6, { drop: DROP.capsule })
    .stations(68.5, K.hornet, [[144, 50], [60, 130], [228, 130]], 4, { drop: DROP.none })
    .sideSweep(69.5, -1, 5)
    .dive(70.5, [50, 238, 144], { gap: 0.2, drop: DROP.none })
    .line(72, K.dart, 268, -90, 110, 8, 0.16)
    // Ease off.
    .weave(75, 144, 8, { amp: 100, freq: 1.8 })
    .vee(77.5, 100, 3, { kind: K.hornet, vy: 60, drop: DROP.none })
    .loop(79, -1, 8)
    .vee(81.5, 188, 7)
    .loop(84, 1, 8)
    .dive(86.5, [60, 144, 228], { kind: K.dart })
    .stations(92.3, K.hornet, [[90, 60], [198, 60]], 1.5, { leave: -60, drop: DROP.none })
    // Quiet.
    .boss(95, "halberd")
    .build();

/** Area 2 signatures: echelon lines and crossfire pairs. Barriers as before, re-timed, with guns behind their gaps. */
const grid = new Script()
    // Hook.
    .echelon(2, 1, K.hornet, 3, { drop: DROP.none })
    .crossfire(3.5, K.hornet, 80, { drop: DROP.none, drop2: DROP.none })
    .ground(5, K.crawler, [30], { vx: 18, drop: DROP.chip })
    .ground(5, K.crawler, [258], { vx: -18, drop: DROP.chip })
    .dive(7, [72, 144, 216], { gap: 0.25, drop: DROP.none })
    .ground(8.5, K.turret, [100, 188], { drop: DROP.none })
    .barrier(10, 144, 70)
    .mortar(11, 144, { drop: DROP.none })
    // Build.
    .weave(12.5, 72, 6)
    .echelon(13, -1, K.hornet, 3)
    .dive(15.5, [60, 228], { kind: K.dart })
    .weave(17, 144, 5)
    .barrier(19, 70)
    .ground(20, K.turret, [70], { drop: DROP.none })
    .crossfire(20.5, K.skiff, 70, { drop: DROP.none, drop2: DROP.capsule })
    .barrier(21.5, 218)
    .mortar(22.5, 218, { drop: DROP.none })
    .ground(24, K.turret, [40, 144, 248])
    .echelon(25, 1, K.hornet, 3, { drop: DROP.none })
    .loop(26.5, 1, 7)
    .dive(28, [90, 198])
    .ground(29, K.crawler, [60, 228], { drop: DROP.none })
    .crossfire(31, K.hornet, 100, { drop: DROP.none, drop2: DROP.none })
    .stations(32.5, K.hornet, [[60, 70], [228, 70]], 4)
    .weave(34.5, 144, 6)
    .barrier(36, 200)
    .ground(37, K.turret, [200], { drop: DROP.none })
    .echelon(38, -1, K.dart, 4)
    .barrier(39, 90)
    .mortar(40, 90, { drop: DROP.none })
    .weave(41, 220, 6)
    .stations(42.6, K.hornet, [[100, 70], [188, 70]], 1.5, { leave: -60, drop: DROP.none })
    // Lull.
    .weave(43.5, 144, 5)
    .midboss(46, "bastion")
    // Recovery.
    .weave(47, 72, 6)
    // Second build.
    .echelon(49.2, 1, K.hornet, 4)
    .dive(50.5, [50, 110, 178, 238], { gap: 0.2, drop: DROP.none })
    .barrier(52, 144, 60)
    .mortar(53, 144, { drop: DROP.none })
    .crossfire(54, K.hornet, 90, { drop: DROP.none, drop2: DROP.none })
    .barrier(55.5, 60)
    .ground(56.5, K.turret, [60], { drop: DROP.none })
    .dive(57, [100, 188], { kind: K.dart })
    .barrier(58, 228)
    .mortar(59, 228, { drop: DROP.none })
    // Densest wave.
    .ground(62.5, K.turret, [40, 110, 178, 248], { drop: DROP.none })
    .echelon(63, -1, K.hornet, 4, { drop: DROP.none })
    .crossfire(64, K.skiff, 70, { drop: DROP.capsule, drop2: DROP.none })
    .dive(65, [60, 120, 168, 228], { gap: 0.2, drop: DROP.none })
    .ground(66, K.crawler, [90, 198], { drop: DROP.none })
    .hornetLine(66.5)
    .loopPair(67.5, 9)
    // Ease off.
    .weave(71, 72, 8)
    .echelon(72.5, 1, K.hornet, 3, { drop: DROP.none })
    .weave(74, 216, 6)
    .dive(76, [72, 216], { kind: K.dart })
    .loop(78, -1, 7)
    .barrier(80, 144, 54)
    .ground(81, K.turret, [144], { drop: DROP.none })
    .echelon(82.5, -1, K.dart, 4)
    .weave(84.5, 144, 6)
    .stations(87.3, K.hornet, [[72, 70], [216, 70]], 1.5, { leave: -60, drop: DROP.none })
    // Quiet.
    .boss(90, "cantor")
    .build();

/** Area 3 signatures: rear entries and orbit rings. Rings before the lull sink out before it starts. */
const aurora = new Script()
    // Hook.
    .debris(1.5, 6, 1, { small: 0.5 })
    .rearEntry(2.5, [72, 216, 144], { gap: 0.6, vy: 140 })
    .orbitRing(4, 144, 5, { sink: 30 })
    .interceptor(6, 1, 3)
    .stations(7.5, K.hornet, [[60, 80], [228, 80]], 2.5, { leave: -60, drop: DROP.none })
    .rearEntry(9, [40, 248, 110, 178, 144], { gap: 0.4, vy: 140 })
    .stations(10, K.sentry, [[60, 70], [228, 70]], 3)
    // Build.
    .mines(12, 10, 2, { duration: 5 })
    .station(12.5, K.skiff, 144, 60, 5, { drop: DROP.capsule })
    .orbitRing(14, 72, 4, { spin: -1.2, sink: 30 })
    .weave(14.5, 220, 6)
    .dive(16, [40, 248], { gap: 0.25 })
    .rearEntry(17.5, [100, 188], { vy: 140 })
    .interceptor(18.5, -1, 3)
    .orbitRing(19.5, 216, 4, { spin: 1.2, sink: 30 })
    .stations(21, K.hornet, [[60, 80], [228, 80]], 4)
    .rearEntry(22, [144, 72, 216], { vy: 140 })
    .hornetLine(23.5, K.sentry, 4, { drop: DROP.none })
    .debris(25, 10, 3, { duration: 5 })
    .dive(26, [72, 216], { drop: DROP.none })
    .orbitRing(27.5, 144, 5, { spin: -1.1, sink: 35 })
    .weave(28.5, 60, 6)
    .stations(29.5, K.hornet, [[100, 90], [188, 90]], 3, { drop: DROP.none })
    .rearEntry(31, [40, 248, 144], { vy: 140 })
    .loopPair(32, 6)
    .stations(33.5, K.sentry, [[72, 100], [216, 100]], 2.5, { leave: 70 })
    .dive(35, [50, 238], { gap: 0.2 })
    .rearEntry(36.5, [100, 188], { vy: 140 })
    .weave(37.5, 144, 6)
    .stations(38.6, K.hornet, [[40, 60], [248, 60]], 0.8, { leave: -60, drop: DROP.none })
    // Lull.
    .rearEntry(39.5, [144], { vy: 140 })
    .midboss(42, "lantern")
    // Recovery.
    .mines(43, 8, 4, { duration: 3 })
    // Second build.
    .orbitRing(45.2, 144, 6, { sink: 25 })
    .fence(46.5, 144)
    .interceptor(47.5, 1, 3)
    .station(48.5, K.skiff, 220, 62, 5, { drop: DROP.capsule })
    .rearEntry(49.5, [60, 228, 144, 100], { gap: 0.4, vy: 140 })
    .hornetLine(51, K.hornet, 4)
    .dive(52.5, [40, 248], { drop: DROP.none })
    .fence(53.5, 80)
    .orbitRing(54.5, 72, 4, { spin: 1.3, sink: 30 })
    .rearEntry(55.5, [188, 248], { vy: 140 })
    .weave(56.5, 216, 6)
    // Densest wave.
    .orbitRing(58.5, 90, 5, { spin: 1.3 })
    .stations(59, K.sentry, [[50, 60], [238, 60]], 5)
    .rearEntry(59.5, [40, 248, 144, 100, 188], { gap: 0.3, vy: 140 })
    .orbitRing(60.5, 198, 5, { spin: -1.3 })
    .dive(61.5, [40, 90, 144, 198, 248], { gap: 0.2 })
    .interceptor(62.5, -1, 3)
    .mines(63.5, 14, 5, { duration: 6 })
    .stations(64, K.hornet, [[100, 90], [188, 90]], 3, { drop: DROP.none })
    // Ease off, still pressing.
    .weave(66, 144, 8)
    .fence(67.5, 200)
    .stations(68.5, K.sentry, [[110, 110], [178, 110]], 4)
    .rearEntry(70, [72, 216, 144], { vy: 140 })
    .debris(71.5, 10, 6, { duration: 4 })
    .dive(72.5, [60, 228], { drop: DROP.none })
    .orbitRing(74, 144, 4, { sink: 40 })
    .weave(75.5, 72, 6)
    .rearEntry(77, [100, 188], { vy: 140 })
    .stations(78.5, K.hornet, [[72, 80], [216, 80]], 2, { drop: DROP.none })
    .loop(80, 1, 7)
    .stations(82.3, K.hornet, [[100, 60], [188, 60]], 1.5, { leave: -60, drop: DROP.none })
    // Quiet.
    .banner(82.5, "ENGINE SIGNATURE", "ALL CRAFT WITHDRAW")
    .boss(85, "seraph")
    .build();

export const AREAS: readonly AreaDef[] = [
    {
        number: "AREA 1",
        name: "CIRRUS LINE",
        subtitle: "ALTITUDE 9,800 M · DAWN",
        dossier: ["ENEMY WING HOLDS THE CLOUD DECK.", "BREAK THROUGH TO THE CARRIER LANE.", "CAPSULES CARRY NEW WEAPONS."],
        target: "HALBERD · FLYING WING",
        scroll: 38,
        music: "area1",
        backdrop: "cirrus",
        events: cirrus,
    },
    {
        number: "AREA 2",
        name: "NEON GRID",
        subtitle: "MEGACITY APPROACH · 02:40",
        dossier: ["ROOFTOP GUNS AND BARRIER PYLONS.", "SHOOT A PYLON TO DROP ITS WALL.", "THE FORTRESS WAITS ON THE AVENUE."],
        target: "CANTOR · SIEGE CRAWLER",
        scroll: 52,
        music: "area2",
        backdrop: "grid",
        events: grid,
    },
    {
        number: "AREA 3",
        name: "AURORA ORBIT",
        subtitle: "LOW ORBIT · ABOVE THE AURORA",
        dossier: ["DEBRIS FIELD AND MINE SCREEN.", "THE SERAPH ENGINE IS WAKING.", "THIS IS THE LAST RELOAD."],
        target: "SERAPH ENGINE · ORBITAL CORE",
        scroll: 66,
        music: "area3",
        backdrop: "aurora",
        events: aurora,
    },
];
