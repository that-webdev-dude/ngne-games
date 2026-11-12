import { REV01_GAMEPLAY } from "./rev01-gameplay.ts";
import { VIEW, fromLegacy } from "./view.ts";

/** side: spawn x (left group's x for "both"), or the sweeper entry flag (0 left, 1 right). */
export interface Encounter {
    at: number;
    kind: "interceptor" | "gunship" | "sweeper" | "minelayer" | "warden" | "repair";
    count: number;
    side: number;
    /** "both" mirrors the volley; "right-ripple" staggers it; "right-return" crosses before firing. */
    bankFrom?: "left" | "right" | "both" | "right-ripple" | "right-return";
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
        { at: 60, kind: "interceptor", count: 6, side: 32, bankFrom: "both" },
        { at: 81, kind: "interceptor", count: 6, side: 624, bankFrom: "right-ripple" },
        ...[
            { side: fromLegacy(160), times: [13, 23, 35, 46, 55, 65, 76] },
            { side: fromLegacy(320), times: [18, 29, 50, 70] },
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
            count: at === 79 ? 1 : 2,
            side: (index + 1) % 2,
        })),
        { at: 52, kind: "repair", count: 1, side: fromLegacy(240) },
    ] satisfies Encounter[]
).sort((a, b) => a.at - b.at);

export const FURNACE_ENCOUNTERS: Encounter[] = [
    // Introduce the left mine lane while the first bank fires from the right.
    { at: 2, kind: "interceptor", count: 4, side: 592, bankFrom: "right" },
    { at: 3.5, kind: "minelayer", count: 1, side: fromLegacy(130) },
    { at: 8.75, kind: "sweeper", count: 1, side: 1, laneY: fromLegacy(126) },
    { at: 10.5, kind: "interceptor", count: 4, side: 48, bankFrom: "left" },

    // The beam charges in the lane the player chose after the first pair.
    { at: 15.5, kind: "warden", count: 1, side: fromLegacy(345) },
    { at: 18, kind: "interceptor", count: 2, side: 592, bankFrom: "right" },
    { at: 19.8, kind: "interceptor", count: 2, side: 48, bankFrom: "left" },
    { at: 23.5, kind: "gunship", count: 1, side: fromLegacy(130), firstVolley: 2.8 },
    { at: 24.25, kind: "sweeper", count: 1, side: 1 },
    { at: 27.75, kind: "minelayer", count: 1, side: fromLegacy(335) },
    { at: 29, kind: "interceptor", count: 5, side: VIEW.width + 85, bankFrom: "right-return" },
    { at: 34, kind: "warden", count: 1, side: fromLegacy(345) },
    { at: 36.5, kind: "sweeper", count: 1, side: 1, laneY: fromLegacy(126) },
    { at: 36.7, kind: "interceptor", count: 4, side: 48, bankFrom: "left" },

    // The second crossing hooks below a mine on the left.
    { at: 44, kind: "interceptor", count: 5, side: fromLegacy(160) },
    { at: 45, kind: "sweeper", count: 2, side: 0 },
    { at: 51, kind: "interceptor", count: 5, side: VIEW.width + 85, bankFrom: "right-return" },
    { at: 52, kind: "minelayer", count: 1, side: fromLegacy(145) },
    { at: 55, kind: "repair", count: 1, side: fromLegacy(240) },
    { at: 56, kind: "gunship", count: 1, side: fromLegacy(165) },
    { at: 59.5, kind: "interceptor", count: 4, side: 592, bankFrom: "right" },

    // Stagger the sweeper lanes, then put a Warden lock through the synchronized volley.
    { at: 62, kind: "sweeper", count: 1, side: 1 },
    { at: 62.9, kind: "sweeper", count: 1, side: 0, laneY: fromLegacy(138) },
    { at: 64, kind: "warden", count: 1, side: fromLegacy(135) },
    { at: 65.25, kind: "minelayer", count: 1, side: fromLegacy(335) },
    { at: 66.5, kind: "interceptor", count: 8, side: 16, bankFrom: "both" },
    { at: 73.6, kind: "interceptor", count: 4, side: 48, bankFrom: "left" },

    // The left mine and right gunship both reach into the retreat from the final ripple.
    { at: 76.25, kind: "sweeper", count: 1, side: 1 },
    { at: 78.2, kind: "gunship", count: 1, side: fromLegacy(355), firstVolley: 2.8 },
    { at: 81.5, kind: "sweeper", count: 1, side: 0, laneY: fromLegacy(114) },
    { at: 83.5, kind: "minelayer", count: 1, side: fromLegacy(145) },
    { at: 88, kind: "interceptor", count: 6, side: 624, bankFrom: "right-ripple" },
];

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
