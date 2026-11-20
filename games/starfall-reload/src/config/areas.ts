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

const cirrus = new Script()
    .weave(2, 80, 5)
    .weave(3.5, 208, 5)
    .station(6, K.skiff, 144, 62, 6, { drop: DROP.chips4 })
    .loop(7.5, 1, 6)
    .loop(9.5, -1, 6)
    .dive(13, [60, 144, 228])
    .weave(16, 144, 7, { amp: 60 })
    .loop(18.5, 1, 6)
    .loop(19, -1, 6)
    .station(22, K.hornet, 50, 80, 4)
    .station(22.2, K.hornet, 238, 80, 4)
    .line(25, K.dart, 20, 70, 115, 6, 0.2)
    .line(26, K.dart, 268, -70, 115, 6, 0.2)
    .dive(29, [40, 100, 188, 248])
    .station(32, K.skiff, 70, 70, 7, { drop: DROP.capsule })
    .weave(33, 220, 6)
    .loop(37, 1, 8)
    .loop(37.4, -1, 8)
    .station(41, K.hornet, 72, 60, 5)
    .station(41.3, K.hornet, 144, 92, 5)
    .station(41.6, K.hornet, 216, 60, 5)
    .weave(46, 50, 6)
    .weave(46.5, 238, 6)
    .midboss(52, "lancer")
    .loop(54, 1, 8, { speed: 2.5 })
    .loop(54.3, -1, 8, { speed: 2.5 })
    .dive(57, [30, 80, 130, 180, 230, 270], { gap: 0.2 })
    .station(61, K.skiff, 230, 65, 6, { drop: DROP.capsule })
    .weave(61.5, 60, 6)
    .station(65, K.hornet, 40, 110, 6)
    .station(65.2, K.hornet, 248, 110, 6)
    .line(68, K.dart, 20, 90, 110, 8, 0.16)
    .line(69, K.dart, 268, -90, 110, 8, 0.16)
    .weave(72, 144, 10, { amp: 100, freq: 1.8 })
    .dive(76, [50, 238, 100, 188, 144], { gap: 0.25 })
    .loop(80, 1, 10)
    .loop(80.3, -1, 10)
    .station(85, K.hornet, 50, 70, 5)
    .station(85.2, K.hornet, 110, 100, 5)
    .station(85.4, K.hornet, 178, 100, 5)
    .station(85.6, K.hornet, 238, 70, 5)
    .weave(90, 80, 8)
    .weave(90.4, 208, 8)
    .boss(95, "halberd")
    .build();

const grid = new Script()
    .ground(2, K.turret, [60, 228])
    .weave(3, 144, 6)
    .ground(6, K.crawler, [30], { vx: 18 })
    .ground(6, K.crawler, [258], { vx: -18 })
    .dive(8, [72, 216])
    .barrier(10, 144, 70)
    .ground(12, K.turret, [100, 188])
    .loop(14, 1, 7)
    .station(16, K.skiff, 144, 60, 6, { drop: DROP.capsule })
    .barrier(19, 70)
    .barrier(21.5, 218)
    .ground(24, K.turret, [40, 144, 248])
    .dive(24.5, [90, 198])
    .ground(28, K.crawler, [60, 228])
    .weave(28.5, 144, 7)
    .station(32, K.hornet, 60, 70, 6)
    .station(32.2, K.hornet, 228, 70, 6)
    .barrier(36, 200)
    .ground(36.5, K.turret, [60])
    .barrier(39, 90)
    .ground(39.5, K.turret, [230])
    .loop(42, 1, 7)
    .loop(42.3, -1, 7)
    .midboss(46, "bastion")
    .ground(48, K.turret, [50, 120, 170, 240])
    .dive(50, [40, 100, 144, 188, 248], { gap: 0.2 })
    .barrier(53, 144, 60)
    .barrier(55.5, 60)
    .barrier(58, 228)
    .station(60, K.skiff, 60, 70, 6, { drop: DROP.capsule })
    .ground(60.5, K.crawler, [150])
    .station(63, K.hornet, 60, 90, 5)
    .station(63.2, K.hornet, 144, 60, 5)
    .station(63.4, K.hornet, 228, 90, 5)
    .weave(67, 72, 8)
    .weave(67.3, 216, 8)
    .ground(71, K.turret, [40, 110, 178, 248])
    .ground(71.5, K.crawler, [90, 198])
    .loop(75, 1, 9)
    .loop(75.3, -1, 9)
    .dive(77, [60, 120, 168, 228], { gap: 0.2 })
    .barrier(80, 144, 54)
    .ground(80.6, K.turret, [60, 228])
    .station(84, K.hornet, 40, 70, 5)
    .station(84.2, K.hornet, 110, 100, 5)
    .station(84.4, K.hornet, 178, 100, 5)
    .station(84.6, K.hornet, 248, 70, 5)
    .boss(90, "cantor")
    .build();

const aurora = new Script()
    .debris(2, 8, 1)
    .station(5, K.sentry, 72, 80, 6)
    .station(5.2, K.sentry, 216, 80, 6)
    .loop(9, 1, 8)
    .loop(9.3, -1, 8)
    .debris(13, 12, 2, { duration: 6 })
    .dive(15, [40, 100, 144, 188, 248], { gap: 0.18 })
    .station(19, K.skiff, 144, 60, 6, { drop: DROP.capsule })
    .station(22, K.sentry, 40, 70, 6)
    .station(22.2, K.sentry, 110, 100, 6)
    .station(22.4, K.sentry, 178, 100, 6)
    .station(22.6, K.sentry, 248, 70, 6)
    .weave(26, 60, 6)
    .weave(26.2, 144, 6)
    .weave(26.4, 228, 6)
    .debris(30, 16, 3, { duration: 8 })
    .station(31, K.hornet, 60, 80, 6)
    .station(31.2, K.hornet, 228, 80, 6)
    .loop(38, 1, 10)
    .loop(38.3, -1, 10)
    .midboss(42, "lantern")
    .debris(44, 10, 4, { duration: 5 })
    .station(45, K.sentry, 60, 90, 5)
    .station(45.2, K.sentry, 144, 70, 5)
    .station(45.4, K.sentry, 228, 90, 5)
    .dive(49, [30, 80, 130, 160, 210, 260], { gap: 0.15 })
    .station(53, K.skiff, 220, 62, 6, { drop: DROP.capsule })
    .weave(53.4, 60, 7)
    .station(57, K.hornet, 50, 70, 6)
    .station(57.2, K.hornet, 110, 100, 6)
    .station(57.4, K.hornet, 178, 100, 6)
    .station(57.6, K.hornet, 238, 70, 6)
    .station(58, K.sentry, 90, 50, 5)
    .station(58.2, K.sentry, 198, 50, 5)
    .debris(62, 20, 5, { duration: 10, small: 0.4 })
    .loop(63, 1, 8)
    .loop(66, -1, 8)
    .weave(70, 60, 8)
    .weave(70.2, 144, 8)
    .weave(70.4, 228, 8)
    .dive(75, [40, 90, 144, 198, 248, 144], { gap: 0.2 })
    .station(76, K.sentry, 50, 60, 5)
    .station(76.2, K.sentry, 238, 60, 5)
    .station(76.4, K.sentry, 110, 110, 5)
    .station(76.6, K.sentry, 178, 110, 5)
    .banner(81, "ENGINE SIGNATURE", "ALL CRAFT WITHDRAW")
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
