import { AREAS } from "../config/areas.ts";
import { CHAIN, GRAZE, PLAYER } from "../config/tuning.ts";
import { Ship } from "../ecs/components.ts";
import { FIELD, FIELD_H, FIELD_W, HUD, L, VIEW } from "../config/view.ts";
import { WEAPONS } from "../config/weapons.ts";
import { ENTRY_CHARS, hiScore, pauseItems, type Flow } from "../game/flow.ts";
import type { Sim } from "../sim/context.ts";
import { chainMultiplier, chipsForNext } from "../sim/rules.ts";
import { textWidth } from "./font.ts";
import type { Painter } from "./painter.ts";

const GOLD = 0xffc94a,
    CYAN = 0x46c8ee,
    DIM = 0x7184ad,
    RED = 0xff3d4f,
    WHITE = 0xffffff,
    INK = 0x0b0d1a,
    OFF = 0x1c2238;
const CX = VIEW.width / 2;
const LEFT_X = FIELD.left / 2;
const RIGHT_X = FIELD.left + FIELD.width + FIELD.left / 2;

const pad = (n: number, width: number) => String(Math.floor(n)).padStart(width, "0");

/**
 * Cabinet bezel and the minimal HUD. The side panels are plain plates with static neon frame
 * lines; the only readouts are two thin outlined rows inside the playfield (see `drawHudRows`).
 */
export function drawPanels(p: Painter, sim: Sim, flow: Flow): void {
    p.frame.sprite({ x: LEFT_X, y: 180, width: 176, height: 360, texture: "panels", u: 0, v: 0, uw: 0.5, vh: 1, layer: L.panel, screen: true });
    p.frame.sprite({ x: RIGHT_X, y: 180, width: 176, height: 360, texture: "panels", u: 0.5, v: 0, uw: 0.5, vh: 1, layer: L.panel, screen: true });
    for (const x of [FIELD.left - 1, FIELD.left + FIELD.width]) {
        p.rect(x - 1, 0, 3, 360, CYAN, { alpha: 0.18, layer: L.panel, screen: true });
        p.rect(x, 0, 1, 360, CYAN, { alpha: 0.85, layer: L.panel, screen: true });
    }
    drawHudRows(p, sim, flow);
}

// HUD row geometry in playfield x. Text sits 2 px into a row so its baked outline stays inside.
const hud = { layer: L.fieldText, screen: true } as const;
const EDGE = 4;
const TOP_Y = 2;
const BOT_ROW = FIELD_H - HUD.bottom;
const BOT_Y = BOT_ROW + 2;
const ICON_STEP = 10;
const SHIP_SLOTS = 4;
const BOMB_X = EDGE + SHIP_SLOTS * ICON_STEP + 6;
const PIP_W = 5,
    PIP_GAP = 2;
const PIPS_W = PLAYER.maxPower * (PIP_W + PIP_GAP) - PIP_GAP;
const PIPS_X = FIELD_W - EDGE - PIPS_W;
const GAUGE_SEGS = 15,
    GAUGE_W = GAUGE_SEGS * 6 - 1;
/** Centred in the gap between the bomb slots and the widest weapon block (letter + 6-letter mode). */
const GAUGE_X = Math.round((BOMB_X + PLAYER.maxBombs * ICON_STEP + (PIPS_X - 5 - textWidth("XXXXXX") - 4 - 5) - GAUGE_W) / 2);

/** Top row (score, hi-score; hi-score only on the title and in demo), chain line, bottom row in a run. */
function drawHudRows(p: Painter, sim: Sim, flow: Flow): void {
    const run = sim.run;
    const title = flow.mode === "attract" || flow.demo;
    const playing = flow.mode !== "attract" && flow.mode !== "ending" && flow.mode !== "entry" && !flow.demo;
    const hi = pad(hiScore(flow, sim), 8);
    p.text(hi, fx(FIELD_W - EDGE), TOP_Y, { ...hud, color: GOLD, align: "right" });
    p.text("HI", fx(FIELD_W - EDGE - textWidth(hi) - 6), TOP_Y, { ...hud, color: DIM, align: "right" });
    if (!title) {
        p.text("1UP", fx(EDGE), TOP_Y, { ...hud, color: RED });
        p.text(pad(run.score, 8), fx(EDGE + 24), TOP_Y, hud);
    }
    // Chain: a second line only while the multiplier is live, with its window draining under it.
    const mult = chainMultiplier(run.chain);
    if (playing && mult > 1 && run.chainT > 0) {
        const label = `CHAIN x${mult}`;
        const w = textWidth(label);
        p.text(label, fx(FIELD_W - EDGE), HUD.top + 1, { ...hud, color: GOLD, align: "right" });
        const k = Math.min(1, run.chainT / CHAIN.window);
        p.rect(fx(FIELD_W - EDGE - w) - 1, HUD.top + 9, w + 2, 3, INK, { alpha: 0.9, layer: L.fieldText, screen: true });
        p.rect(fx(FIELD_W - EDGE) - w * k, HUD.top + 10, w * k, 1, GOLD, { layer: L.fieldText, screen: true });
    }
    if (playing) drawBottomRow(p, sim);
}

/** Bottom row: ships and bombs (left), reload gauge (centre), weapon, mode and power (right). */
function drawBottomRow(p: Painter, sim: Sim): void {
    const t = sim.time;
    const run = sim.run;
    const iconY = BOT_ROW + 6;
    // Ships in reserve: the ship in play is not counted.
    const shipOut = !!sim.player && sim.world.has(sim.player) && sim.world.read(sim.player, Ship, "alive") === 1;
    const lives = Math.max(0, run.lives - (shipOut ? 1 : 0));
    if (lives > SHIP_SLOTS) {
        p.spr("icon-life", 0, fx(EDGE + 4.5), iconY, hud);
        p.text(`x${lives}`, fx(EDGE + ICON_STEP + 1), BOT_Y, hud);
    } else for (let i = 0; i < lives; i++) p.spr("icon-life", 0, fx(EDGE + 4.5 + i * ICON_STEP), iconY, hud);
    for (let i = 0; i < PLAYER.maxBombs; i++) p.spr("icon-bomb", 0, fx(BOMB_X + 4.5 + i * ICON_STEP), iconY, { ...hud, alpha: i < run.bombs ? 1 : 0.18 });
    // Reload gauge: graze fills it; a full gauge reloads one bomb. Blinks when nearly full.
    const fill = run.grazeMeter / GRAZE.perBomb;
    const gy = BOT_ROW + 3;
    p.rect(fx(GAUGE_X) - 1, gy - 1, GAUGE_W + 2, 7, INK, { alpha: 0.9, layer: L.fieldText, screen: true });
    const blink = fill > 0.8 && Math.floor(t * 10) % 2 === 1;
    for (let i = 0; i < GAUGE_SEGS; i++) p.rect(fx(GAUGE_X + i * 6), gy, 5, 5, i / GAUGE_SEGS < fill ? (blink ? WHITE : CYAN) : OFF, { layer: L.fieldText, screen: true });
    // Weapon letter, mode name, power pips with the chip progress line under them.
    const w = WEAPONS[run.weapon]!;
    const mode = w.modes[run.mode]!;
    const modeRight = PIPS_X - 5;
    p.text(mode, fx(modeRight), BOT_Y, { ...hud, color: 0xa7b8d8, align: "right" });
    p.text(w.letter, fx(modeRight - textWidth(mode) - 4), BOT_Y, { ...hud, color: w.color, align: "right" });
    p.rect(fx(PIPS_X) - 1, gy - 1, PIPS_W + 2, 9, INK, { alpha: 0.9, layer: L.fieldText, screen: true });
    for (let i = 0; i < PLAYER.maxPower; i++) {
        const on = i < run.power;
        p.rect(fx(PIPS_X + i * (PIP_W + PIP_GAP)), gy, PIP_W, 5, on ? CYAN : OFF, { layer: L.fieldText, screen: true });
        if (on) p.rect(fx(PIPS_X + i * (PIP_W + PIP_GAP)), gy, PIP_W, 1, 0xb2f4ff, { layer: L.fieldText, screen: true });
    }
    const need = chipsForNext(run.power);
    const progress = Number.isFinite(need) ? run.chips / need : 1;
    p.rect(fx(PIPS_X), gy + 6, PIPS_W * progress, 1, Number.isFinite(need) ? 0x7fe0ff : GOLD, { layer: L.fieldText, screen: true });
}

const FX0 = FIELD.left;
const CARD_TIME = 3.6;
/** Screen x of a playfield x. */
const fx = (x: number) => FX0 + x;

/** In-playfield overlays: banners, popups, flash, area card. Screen space. */
export function drawFieldOverlays(p: Painter, sim: Sim, flow: Flow): void {
    const t = sim.time;
    const fb = sim.feedback;
    // Score popups.
    for (const pop of fb.popups) {
        const a = 1 - pop.t / 0.8;
        p.text(pop.text, fx(pop.x), pop.y - pop.t * 22, { color: pop.color, align: "center", layer: L.fieldText, screen: true, alpha: a });
    }
    // Banners.
    for (const b of fb.banners) drawBanner(p, b.text, b.sub, b.style, b.t, b.life, t);
    // Area intro card (reportage style).
    if (flow.mode === "play" && flow.introT < CARD_TIME) drawAreaCard(p, sim.area.index, flow.introT);
    if (flow.demo) {
        p.text("DEMO PLAY", CX, 30, { scale: 2, color: GOLD, align: "center", layer: L.fieldText, screen: true, alpha: 0.85 });
        if (Math.floor(t * 1.6) % 2 === 0) p.text("PRESS START", CX, 50, { color: WHITE, align: "center", layer: L.fieldText, screen: true });
    }
    // Screen flash.
    if (fb.flash > 0) p.rect(fx(0), 0, FIELD_W, FIELD_H, fb.flashColor, { alpha: Math.min(0.7, fb.flash * (flow.settings.calm ? 0.3 : 0.6)), layer: L.overlay, screen: true });
}

function drawBanner(p: Painter, text: string, sub: string, style: string, bt: number, life: number, t: number): void {
    const fade = Math.min(1, bt * 8, (life - bt) * 5);
    if (style === "warning" && text === "WARNING") {
        // Hazard bands, blinking title and a wireframe target box.
        const cy = 150;
        const open = Math.min(1, bt * 3);
        const h = 70 * open;
        p.rect(fx(0), cy - h / 2, FIELD_W, h, 0x2a0410, { alpha: 0.75 * fade, layer: L.fieldText, screen: true });
        for (const y of [cy - h / 2, cy + h / 2 - 6]) {
            for (let x = -12; x < FIELD_W + 12; x += 12) {
                const sx = x + ((t * 60) % 12);
                if (sx < 0 || sx > FIELD_W - 6) continue;
                p.rect(fx(sx), y, 6, 6, RED, { alpha: fade, layer: L.fieldText, screen: true });
            }
        }
        if (Math.floor(bt * 4) % 2 === 0) p.text("WARNING", CX, cy - 14, { scale: 3, color: RED, align: "center", layer: L.fieldText, screen: true, alpha: fade });
        p.text(sub, CX, cy + 12, { color: 0xffd6d6, align: "center", layer: L.fieldText, screen: true, alpha: fade });
        // Grid scan lines sweeping down the band.
        const scan = (bt * 120) % h;
        p.rect(fx(0), cy - h / 2 + scan, FIELD_W, 1, 0xff8a86, { alpha: 0.5 * fade, layer: L.fieldText, screen: true });
        return;
    }
    if (style === "warning") {
        p.rect(fx(0), 96, FIELD_W, 34, 0x2a0410, { alpha: 0.3 * fade, layer: L.fieldText, screen: true });
        p.rect(fx(0), 96, FIELD_W, 1, RED, { alpha: fade, layer: L.fieldText, screen: true });
        p.rect(fx(0), 129, FIELD_W, 1, RED, { alpha: fade, layer: L.fieldText, screen: true });
        p.text(text, CX, 101, { scale: 2, color: 0xff8a86, align: "center", layer: L.fieldText, screen: true, alpha: fade });
        p.text(sub, CX, 119, { color: 0xffd6d6, align: "center", layer: L.fieldText, screen: true, alpha: fade });
        return;
    }
    const y = style === "reload" ? 210 : style === "extend" ? 180 : style === "chain" ? 240 : 228;
    const color = style === "reload" ? CYAN : style === "extend" ? GOLD : style === "chain" ? GOLD : WHITE;
    const pop = 1 + Math.max(0, 0.25 - bt) * 2;
    p.text(text, CX, y, { scale: style === "reload" || style === "extend" ? Math.round(2 * pop) : 1, color, align: "center", layer: L.fieldText, screen: true, alpha: fade });
    if (sub) p.text(sub, CX, y + (style === "reload" || style === "extend" ? 18 : 10), { color: 0xa7b8d8, align: "center", layer: L.fieldText, screen: true, alpha: fade * 0.9 });
}

function drawAreaCard(p: Painter, index: number, t: number): void {
    const area = AREAS[index]!;
    const fade = Math.min(1, t * 3, (CARD_TIME - t) * 2.5);
    const bar = Math.min(1, t * 2.5) * 46;
    p.rect(fx(0), 0, FIELD_W, bar, 0x000000, { alpha: 0.85 * fade, layer: L.fieldText, screen: true });
    p.rect(fx(0), FIELD_H - bar, FIELD_W, bar, 0x000000, { alpha: 0.85 * fade, layer: L.fieldText, screen: true });
    const y = 112;
    p.rect(fx(16), y - 6, FIELD_W - 32, 96, 0x05060c, { alpha: 0.6 * fade, layer: L.fieldText, screen: true });
    p.rect(fx(16), y - 6, 3, 96, GOLD, { alpha: fade, layer: L.fieldText, screen: true });
    p.text(area.number, fx(28), y, { color: GOLD, layer: L.fieldText, screen: true, alpha: fade });
    p.text(area.name, fx(28), y + 12, { scale: 3, color: WHITE, layer: L.fieldText, screen: true, alpha: fade });
    p.text(area.subtitle, fx(28), y + 38, { color: 0xa7b8d8, layer: L.fieldText, screen: true, alpha: fade });
    area.dossier.forEach((line, i) => {
        const shown = Math.max(0, Math.floor((t - 0.6 - i * 0.5) * 40));
        if (shown > 0) p.text(line.slice(0, shown), fx(28), y + 52 + i * 10, { color: 0x7fe0ff, layer: L.fieldText, screen: true, alpha: fade });
    });
    // Red ticker with the target name.
    const ticker = `TARGET ▶ ${area.target}   ·   `;
    const tw = ticker.length * 6;
    const off = (t * 50) % tw;
    p.rect(fx(0), FIELD_H - 40, FIELD_W, 11, 0x5a0a1c, { alpha: fade, layer: L.fieldText, screen: true });
    for (let x = -off; x < FIELD_W; x += tw) p.text(ticker, fx(x), FIELD_H - 38, { color: 0xffd6d6, layer: L.fieldText, screen: true, alpha: fade });
}

/** Full-cabinet screens drawn over the playfield region. */
export function drawScreens(p: Painter, sim: Sim, flow: Flow): void {
    const t = sim.time;
    switch (flow.mode) {
        case "attract":
            return drawAttract(p, sim, flow);
        case "paused": {
            shade(p, 0.6);
            p.text("PAUSE", CX, 120, { scale: 3, color: WHITE, align: "center", layer: L.screenText, screen: true });
            pauseItems(sim.run).forEach((item, i) => {
                const active = i === flow.menu;
                if (active) p.rect(CX - 70, 156 + i * 18, 140, 13, CYAN, { alpha: 0.2, layer: L.screen, screen: true });
                p.text((active ? "▶ " : "  ") + item, CX, 159 + i * 18, { color: active ? WHITE : DIM, align: "center", layer: L.screenText, screen: true });
            });
            return;
        }
        case "continue": {
            shade(p, 0.55);
            p.text("CONTINUE?", CX, 120, { scale: 3, color: GOLD, align: "center", layer: L.screenText, screen: true });
            p.text(String(Math.max(0, Math.ceil(flow.count))), CX, 150, { scale: 6, color: WHITE, align: "center", layer: L.screenText, screen: true });
            p.text(`CONTINUES LEFT ${sim.run.credits}`, CX, 206, { color: DIM, align: "center", layer: L.screenText, screen: true });
            if (Math.floor(t * 2) % 2) p.text("PRESS START (ENTER)", CX, 220, { color: CYAN, align: "center", layer: L.screenText, screen: true });
            p.text("RESTARTS THE AREA · SCORE RESETS", CX, 236, { color: 0x4a5a82, align: "center", layer: L.screenText, screen: true });
            return;
        }
        case "gameover": {
            shade(p, Math.min(0.7, flow.t));
            const drop = Math.max(0, 1 - flow.t * 2) * -60;
            p.text("GAME OVER", CX, 150 + drop, { scale: 4, color: RED, align: "center", layer: L.screenText, screen: true });
            p.text(`FINAL SCORE ${pad(sim.run.score, 8)}`, CX, 190, { color: WHITE, align: "center", layer: L.screenText, screen: true });
            return;
        }
        case "clear": {
            const a = Math.min(1, flow.t * 2);
            shade(p, 0.45 * a);
            const final = sim.run.area === AREAS.length - 1;
            p.text(`${AREAS[sim.run.area]!.number} CLEAR`, CX, 92, { scale: 3, color: GOLD, align: "center", layer: L.screenText, screen: true, alpha: a });
            if (final) p.text("THE SERAPH ENGINE IS SILENT", CX, 118, { color: CYAN, align: "center", layer: L.screenText, screen: true, alpha: a });
            flow.tally.forEach((line, i) => {
                if (i >= flow.tallyShown) return;
                const y = 138 + i * 14;
                p.text(line.label, fx(28), y, { color: WHITE, layer: L.screenText, screen: true });
                p.text(String(line.value), fx(FIELD_W - 28), y, { color: line.value > 0 ? GOLD : DIM, align: "right", layer: L.screenText, screen: true });
            });
            if (flow.tallyShown >= flow.tally.length) {
                p.text(`SCORE ${pad(sim.run.score, 8)}`, CX, 216, { scale: 2, color: WHITE, align: "center", layer: L.screenText, screen: true });
                if (Math.floor(t * 2) % 2) p.text(final ? "PRESS START" : "PRESS START TO LAUNCH", CX, 244, { color: CYAN, align: "center", layer: L.screenText, screen: true });
            }
            return;
        }
        case "ending":
            return drawEnding(p, sim, flow);
        case "entry":
            return drawEntry(p, sim, flow);
        default:
            return;
    }
}

function shade(p: Painter, alpha: number): void {
    p.rect(fx(0), 0, FIELD_W, FIELD_H, 0x05060c, { alpha, layer: L.screen, screen: true });
}

function logo(p: Painter, y: number, t: number): void {
    p.rect(fx(14), y - 10, FIELD_W - 28, 74, 0x05060c, { alpha: 0.55, layer: L.screen, screen: true });
    p.text("STARFALL", CX + 3, y + 3, { scale: 4, color: 0x5c1d12, align: "center", layer: L.screenText, screen: true });
    p.text("STARFALL", CX, y, { scale: 4, color: 0xffb347, align: "center", layer: L.screenText, screen: true });
    p.text("STARFALL", CX, y - 1, { scale: 4, color: 0xfff2a8, align: "center", layer: L.screen, screen: true, alpha: 0.6 });
    // Speed streaks behind RELOAD.
    for (let i = 0; i < 5; i++) {
        const sx = ((t * 260 + i * 70) % 330) - 30;
        const len = 30 + i * 6;
        const a = Math.max(0, sx),
            b = Math.min(FIELD_W, sx + len);
        if (b > a) p.rect(fx(a), y + 36 + i * 4, b - a, 1, CYAN, { alpha: 0.5, layer: L.screen, screen: true });
    }
    p.text("RELOAD", CX + 2, y + 34, { scale: 3, color: 0x0d4a6e, align: "center", layer: L.screenText, screen: true });
    p.text("RELOAD", CX, y + 32, { scale: 3, color: Math.floor(t * 8) % 16 === 0 ? WHITE : CYAN, align: "center", layer: L.screenText, screen: true });
    const shine = ((t * 120) % 500) - 100;
    if (shine > 0 && shine < 200) p.rect(CX - 100 + shine, y - 2, 6, 31, WHITE, { alpha: 0.35, layer: L.screenText, screen: true });
}

function drawAttract(p: Painter, sim: Sim, flow: Flow): void {
    const t = sim.time;
    logo(p, 52, t);
    if (flow.page === 0) {
        p.text("A FOLLOW-UP SORTIE", CX, 150, { color: DIM, align: "center", layer: L.screenText, screen: true });
        p.text("3 AREAS · 4 WEAPON FAMILIES · 1 LAST RELOAD", CX, 162, { color: 0x4a5a82, align: "center", layer: L.screenText, screen: true });
        WEAPONS.forEach((w, i) => {
            const x = CX - 96 + i * 64;
            p.spr("capsule", i, x, 196 + Math.sin(t * 3 + i) * 2, { layer: L.screenText, screen: true });
            p.text(w.name, x, 210, { color: w.color, align: "center", layer: L.screenText, screen: true });
        });
    } else if (flow.page === 1) {
        p.text("BEST PILOTS", CX, 140, { color: GOLD, align: "center", layer: L.screenText, screen: true });
        flow.scores.slice(0, 10).forEach((s, i) => {
            const y = 154 + i * 11;
            const mine = i === flow.lastEntryPlace && Math.floor(t * 6) % 2 === 0;
            const color = mine ? WHITE : i === 0 ? GOLD : i < 3 ? 0xe8eefa : DIM;
            p.text(`${i + 1}`.padStart(2, " "), fx(40), y, { color, layer: L.screenText, screen: true });
            p.text(s.name, fx(64), y, { color, layer: L.screenText, screen: true });
            p.text(pad(s.score, 8), fx(170), y, { color, align: "right", layer: L.screenText, screen: true });
            p.text(s.area >= 4 ? "ALL" : `A${s.area}`, fx(FIELD_W - 40), y, { color, align: "right", layer: L.screenText, screen: true });
        });
    } else {
        p.text("HOW TO SURVIVE", CX, 140, { color: GOLD, align: "center", layer: L.screenText, screen: true });
        const rules = [
            "POWER IS ARMOUR: A HIT COSTS 2 LEVELS.",
            "AT LEVEL 0 A HIT DESTROYS THE SHIP.",
            "SHOT CONTROL RESHAPES YOUR GUN.",
            "GRAZE BULLETS TO RELOAD BOMBS.",
            "CHAIN KILLS FOR UP TO x8 SCORE.",
            "CAPSULES: SAME LETTER = POWER UP.",
            "THE BRIGHT DOT IS YOUR HITBOX.",
        ];
        rules.forEach((r, i) => p.text(r, CX, 156 + i * 12, { color: i < 2 ? 0xff8a86 : 0xa7b8d8, align: "center", layer: L.screenText, screen: true }));
    }
    if (Math.floor(t * 1.6) % 2 === 0) p.text("PRESS START", CX, 268, { scale: 2, color: WHITE, align: "center", layer: L.screenText, screen: true });
    p.text("ENTER · Z · CLICK · GAMEPAD A", CX, 290, { color: 0x4a5a82, align: "center", layer: L.screenText, screen: true });
    if (flow.audioLocked) p.text("CLICK OR PRESS ANY KEY FOR SOUND", CX, 314, { color: 0xff8a86, align: "center", layer: L.screenText, screen: true });
    p.text("F FULLSCREEN", CX, 302, { color: 0x2f3a5a, align: "center", layer: L.screenText, screen: true });
    p.text("© 2026 NGNE GAMES", CX, 340, { color: 0x2f3a5a, align: "center", layer: L.screenText, screen: true });
}

function drawEnding(p: Painter, sim: Sim, flow: Flow): void {
    const lines = [
        "MISSION COMPLETE",
        "",
        "THE SERAPH ENGINE BREAKS APART",
        "OVER THE AURORA.",
        "",
        "ITS LIGHT FALLS LIKE STARS.",
        "",
        "STARFALL RELOAD",
        "",
        "DESIGN · CODE · ART · SOUND",
        "THE NGNE GAMES TEAM",
        "",
        "ENGINE  NGNE",
        "",
        `FINAL SCORE ${pad(sim.run.score, 8)}`,
        "",
        "THANK YOU FOR PLAYING",
    ];
    const scroll = 360 - flow.t * 22;
    lines.forEach((line, i) => {
        const y = scroll + i * 16;
        if (y < -10 || y > 370) return;
        const fade = Math.min(1, y / 40, (360 - y) / 40);
        p.text(line, CX, y, { scale: i === 0 || i === 7 ? 2 : 1, color: i === 0 ? GOLD : i === 7 ? CYAN : WHITE, align: "center", layer: L.screenText, screen: true, alpha: Math.max(0, fade) });
    });
    void sim;
}

function drawEntry(p: Painter, sim: Sim, flow: Flow): void {
    const entry = flow.entry;
    if (!entry) return;
    const t = sim.time;
    shade(p, 0.7);
    p.text("NEW RECORD", CX, 90, { scale: 3, color: GOLD, align: "center", layer: L.screenText, screen: true });
    p.text(`RANK ${entry.place + 1}   ${pad(sim.run.score, 8)}`, CX, 122, { color: WHITE, align: "center", layer: L.screenText, screen: true });
    p.text("ENTER YOUR INITIALS", CX, 140, { color: DIM, align: "center", layer: L.screenText, screen: true });
    for (let i = 0; i < 3; i++) {
        const x = CX - 36 + i * 36;
        const active = i === entry.cursor && !entry.done;
        p.rect(x - 14, 160, 28, 34, active ? CYAN : 0x1c2238, { alpha: active ? 0.3 : 0.8, layer: L.screen, screen: true });
        p.text(ENTRY_CHARS[entry.letters[i]!]!, x, 166, { scale: 4, color: active && Math.floor(t * 4) % 2 ? WHITE : GOLD, align: "center", layer: L.screenText, screen: true });
        if (active) {
            p.text("▲", x, 150, { color: CYAN, align: "center", layer: L.screenText, screen: true });
            p.text("▼", x, 198, { color: CYAN, align: "center", layer: L.screenText, screen: true });
        }
    }
    p.text(entry.done ? "SAVED" : "UP/DOWN LETTER · FIRE NEXT · BOMB BACK", CX, 222, { color: entry.done ? GOLD : 0x4a5a82, align: "center", layer: L.screenText, screen: true });
}
