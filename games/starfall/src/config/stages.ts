import {
    CITADEL_ENCOUNTERS,
    ENCOUNTERS,
    FURNACE_ENCOUNTERS,
    type Encounter,
} from "./encounters.ts";
import type { BossDefinition } from "../bosses/boss.ts";
import { gatebreaker } from "../bosses/gatebreaker.ts";
import { kilnSerpent } from "../bosses/kiln-serpent.ts";
import { starfallEngine } from "../bosses/starfall-engine.ts";
export interface StageConfig {
    index: number;
    id: string;
    name: string;
    bossAt: number;
    boss: BossDefinition;
    encounters: Encounter[];
}
export const STAGES: readonly StageConfig[] = [
    {
        index: 0,
        id: "orbital-breakwater",
        name: "ORBITAL BREAKWATER",
        bossAt: 90,
        boss: gatebreaker,
        encounters: ENCOUNTERS,
    },
    {
        index: 1,
        id: "furnace-belt",
        name: "FURNACE BELT",
        bossAt: 100,
        boss: kilnSerpent,
        encounters: FURNACE_ENCOUNTERS,
    },
    {
        index: 2,
        id: "midnight-citadel",
        name: "MIDNIGHT CITADEL",
        bossAt: 110,
        boss: starfallEngine,
        encounters: CITADEL_ENCOUNTERS,
    },
];
