import { REV01_GAMEPLAY } from "./rev01-gameplay.ts";
import { VIEW, fromLegacy } from "./view.ts";

/** side: spawn x (left group's x for "both"), or the sweeper entry flag (0 left, 1 right). */
export interface Encounter {
    at: number;
    kind: "interceptor" | "gunship" | "sweeper" | "minelayer" | "warden" | "repair";
    count: number;
    side: number;
    /** "both" mirrors the volley; "right-ripple" staggers it; "right-return" crosses before firing.
     * "split-dive" uses side as the centre of the formation. */
    bankFrom?: "left" | "right" | "both" | "right-ripple" | "right-return" | "split-dive";
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

export const CITADEL_ENCOUNTERS: Encounter[] = [
    // The second lock follows the opening dodge. The mine and low sweeper make the edges costly.
    { at: 2, kind: "interceptor", count: 4, side: 48, bankFrom: "left" },
    { at: 4.35, kind: "interceptor", count: 2, side: 592, bankFrom: "right" },
    { at: 6, kind: "minelayer", count: 1, side: fromLegacy(145) },
    { at: 9, kind: "sweeper", count: 1, side: 1, laneY: 174 },
    { at: 13, kind: "gunship", count: 1, side: fromLegacy(350), firstVolley: 2.8 },
    { at: 15, kind: "interceptor", count: 8, side: 20, bankFrom: "both" },
    { at: 20.25, kind: "sweeper", count: 1, side: 0, laneY: 114 },

    // Teach the split's outward shots before the finale uses a beam to close its centre gap.
    { at: 26, kind: "interceptor", count: 4, side: 320, bankFrom: "split-dive" },
    { at: 31.6, kind: "minelayer", count: 1, side: fromLegacy(335) },
    { at: 33, kind: "warden", count: 1, side: fromLegacy(135) },
    { at: 34.25, kind: "interceptor", count: 5, side: VIEW.width + 85, bankFrom: "right-return" },
    { at: 35.25, kind: "sweeper", count: 1, side: 0, laneY: 164 },
    { at: 40, kind: "interceptor", count: 2, side: 592, bankFrom: "right" },
    { at: 41.6, kind: "interceptor", count: 2, side: 48, bankFrom: "left" },

    // Recover through the repair lane. The ripple then sweeps one side instead of aiming at the ship.
    { at: 46, kind: "repair", count: 1, side: fromLegacy(210) },
    { at: 47.5, kind: "sweeper", count: 1, side: 0, laneY: 132 },
    { at: 51, kind: "interceptor", count: 6, side: 624, bankFrom: "right-ripple" },
    { at: 55.4, kind: "minelayer", count: 1, side: fromLegacy(150) },
    { at: 57.5, kind: "gunship", count: 1, side: fromLegacy(130), firstVolley: 2.8 },
    { at: 59.75, kind: "sweeper", count: 1, side: 1, laneY: 156 },
    // The tighter formation and low sweeper make the wide centre seam from the first volley unreliable.
    { at: 62, kind: "interceptor", count: 8, side: 32, bankFrom: "both" },
    { at: 67, kind: "interceptor", count: 4, side: 48, bankFrom: "left" },
    { at: 69.5, kind: "minelayer", count: 1, side: fromLegacy(330) },
    { at: 72.4, kind: "sweeper", count: 1, side: 1, laneY: 176 },
    { at: 73, kind: "interceptor", count: 5, side: VIEW.width + 85, bankFrom: "right-return" },
    { at: 80.2, kind: "sweeper", count: 1, side: 0, laneY: 118 },

    // Enter through the split's centre pocket, step off the Warden lock, then read the right-hand ripple.
    { at: 86.75, kind: "gunship", count: 1, side: fromLegacy(365), firstVolley: 2.8 },
    { at: 88.5, kind: "minelayer", count: 1, side: fromLegacy(145) },
    { at: 89.25, kind: "sweeper", count: 1, side: 1, laneY: 203 },
    { at: 93, kind: "interceptor", count: 6, side: 334, bankFrom: "split-dive" },
    { at: 93.45, kind: "warden", count: 1, side: fromLegacy(265) },
    { at: 97.3, kind: "interceptor", count: 6, side: 624, bankFrom: "right-ripple" },
    { at: 100.25, kind: "interceptor", count: 2, side: 48, bankFrom: "left" },
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
