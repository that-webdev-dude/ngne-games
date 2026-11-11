import { REV01_GAMEPLAY } from "./rev01-gameplay.ts";
import { fromLegacy } from "./view.ts";

/** side: spawn x for every kind except sweeper, where it is the entry side flag (0 left, 1 right). */
export interface Encounter {
    at: number;
    kind: "interceptor" | "gunship" | "sweeper" | "minelayer" | "warden" | "repair";
    count: number;
    side: number;
    bankFrom?: "left" | "right";
    firstVolley?: number;
    /** Starting lane in logical pixels for a sweeper. */
    laneY?: number;
}
export const ENCOUNTERS: Encounter[] = (
    [
        { at: 2, kind: "interceptor", count: 4, side: 48, bankFrom: "left" },
        // Give the gunship time to clear the top HUD before its vents telegraph the fan.
        { at: 7.1, kind: "gunship", count: 1, side: fromLegacy(130), firstVolley: 2.8 },
        { at: 8, kind: "interceptor", count: 4, side: 592, bankFrom: "right" },
        // The left pair locks its aim after the player has had time to react to the right pair.
        { at: 41, kind: "interceptor", count: 2, side: 592, bankFrom: "right" },
        { at: 42.8, kind: "interceptor", count: 2, side: 48, bankFrom: "left" },
        ...[
            { side: fromLegacy(160), times: [13, 23, 35, 46, 55, 65, 76] },
            { side: fromLegacy(320), times: [18, 29, 50, 60, 70, 81] },
        ].flatMap(({ side, times }) =>
            times.map((at) => ({ at, kind: "interceptor" as const, count: at < 60 ? 4 : 6, side })),
        ),
        ...[23, 44, 48, 64, 77, 80].map((at, index) => ({
            at,
            kind: "gunship" as const,
            count: 1,
            side: fromLegacy(index % 2 ? 130 : 350),
        })),
        // The gunship on the right is already firing when these staggered lanes cross.
        { at: 28, kind: "sweeper", count: 1, side: 0 },
        { at: 28.75, kind: "sweeper", count: 1, side: 1, laneY: fromLegacy(138) },
        ...[36, 60, 66, 72, 79].map((at, index) => ({
            at,
            kind: "sweeper" as const,
            count: 2,
            side: (index + 1) % 2,
        })),
        { at: 52, kind: "repair", count: 1, side: fromLegacy(240) },
    ] satisfies Encounter[]
).sort((a, b) => a.at - b.at);
/** Player and hostile bullet radii come from the rev01 spec; the player bolt has no spec radius and keeps 2 x 4/3. */
export const COMBAT = {
    enemyCap: 18,
    bulletCap: 180,
    novaSeconds: 15,
    chainSeconds: 2,
    maxChain: 8,
    playerRadius: REV01_GAMEPLAY.playerRadius,
    hostileBulletRadius: REV01_GAMEPLAY.hostileBulletRadius,
    playerBulletRadius: fromLegacy(2),
} as const;
