/** Logical canvas. The cabinet layout is a centred vertical playfield flanked by HUD panels. */
export const VIEW = { width: 640, height: 360 } as const;

/** Playfield in world coordinates is (0,0)–(W,H); the camera offsets it to screen x = LEFT. */
export const FIELD = { left: 176, width: 288, height: 360 } as const;
export const FIELD_W = FIELD.width;
export const FIELD_H = FIELD.height;
export const PANEL_W = FIELD.left;

/** Render layers, sorted ascending by NGNE. */
export const L = {
    sky: 0,
    skyMid: 1,
    groundShadow: 2,
    ground: 3,
    groundTop: 4,
    airShadow: 5,
    enemy: 6,
    boss: 7,
    bossPart: 8,
    pickup: 9,
    shot: 10,
    player: 11,
    fx: 12,
    wisps: 13,
    bulletGlow: 14,
    bullet: 15,
    overlay: 16,
    fieldText: 17,
    panel: 18,
    panelText: 19,
    screen: 20,
    screenText: 21,
} as const;
