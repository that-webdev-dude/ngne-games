import { AREAS } from "../config/areas.ts";
import { CREDITS, GRAZE, PLAYER, RANK } from "../config/tuning.ts";
import { Ship } from "../ecs/components.ts";
import { FIELD, FIELD_H, FIELD_W, L, VIEW } from "../config/view.ts";
import { WEAPONS } from "../config/weapons.ts";
import { ENTRY_CHARS, hiScore, pauseItems, type Flow } from "../game/flow.ts";
import type { Sim } from "../sim/context.ts";
import { chainMultiplier, chipsForNext } from "../sim/rules.ts";
import { CHAIN } from "../config/tuning.ts";
import type { Painter } from "./painter.ts";

const GOLD = 0xffc94a,
    CYAN = 0x46c8ee,
    DIM = 0x7184ad,
    RED = 0xff3d4f,
    WHITE = 0xffffff;
const CX = VIEW.width / 2;
const LEFT_X = FIELD.left / 2;
const RIGHT_X = FIELD.left + FIELD.width + FIELD.left / 2;

const pad = (n: number, width: number) => String(Math.floor(n)).padStart(width, "0");

/** Side panels: all session information lives here, outside the playfield. */
export function drawPanels(p: Painter, sim: Sim, flow: Flow): void {
    const t = sim.time;
    const run = sim.run;
    const playing = flow.mode !== "attract" && flow.mode !== "ending" && flow.mode !== "entry" && !flow.demo;
    // Panel plates (texture holds both halves).
    p.frame.sprite({ x: LEFT_X, y: 180, width: 176, height: 360, texture: "panels", u: 0, v: 0, uw: 0.5, vh: 1, layer: L.panel, screen: true });
    p.frame.sprite({ x: RIGHT_X, y: 180, width: 176, height: 360, texture: "panels", u: 0.5, v: 0, uw: 0.5, vh: 1, layer: L.panel, screen: true });
    // Neon playfield frame with a travelling glint.
    for (const x of [FIELD.left - 1, FIELD.left + FIELD.width]) {
        p.rect(x - 1, 0, 3, 360, CYAN, 0.18, L.panel, true);
        p.rect(x, 0, 1, 360, CYAN, 0.85, L.panel, true);
        const gy = (t * 140 + (x > 300 ? 180 : 0)) % 420 - 30;
        p.rect(x - 1, gy, 3, 26, WHITE, 0.6, L.panel, true);
    }

    // Left: logo, score, ships, bombs, reload gauge, chain.
    p.text("STARFALL", LEFT_X, 12, { scale: 2, color: GOLD, align: "center", layer: L.panelText, screen: true });
    p.text("R E L O A D", LEFT_X, 32, { color: CYAN, align: "center", layer: L.panelText, screen: true });
    divider(p, 46);
    p.text("1UP", 16, 56, { color: Math.floor(t * 2) % 2 ? RED : 0xff8a86, layer: L.panelText, screen: true });
    p.text(pad(run.score, 8), LEFT_X + 4, 66, { scale: 2, align: "center", layer: L.panelText, screen: true });
    p.text("HI-SCORE", 16, 92, { color: DIM, layer: L.panelText, screen: true });
    p.text(pad(hiScore(flow, sim), 8), 160, 92, { color: GOLD, align: "right", layer: L.panelText, screen: true });
    divider(p, 106);
    p.text("SHIPS", 16, 116, { color: DIM, layer: L.panelText, screen: true });
    const shipOut = !!sim.player && sim.world.has(sim.player) && sim.world.read(sim.player, Ship, "alive") === 1;
    const lives = playing ? Math.max(0, run.lives - (shipOut ? 1 : 0)) : PLAYER.lives - 1;
    for (let i = 0; i < Math.min(lives, 8); i++) p.spr("icon-life", 0, 70 + i * 11, 120, { layer: L.panelText, screen: true });
    p.text("BOMBS", 16, 134, { color: DIM, layer: L.panelText, screen: true });
    for (let i = 0; i < PLAYER.maxBombs; i++)
        p.spr("icon-bomb", 0, 70 + i * 11, 138, { layer: L.panelText, screen: true, alpha: i < run.bombs ? 1 : 0.18 });
    // Reload gauge: graze fills it; a full gauge reloads one bomb.
    p.text("RELOAD", 16, 154, { color: DIM, layer: L.panelText, screen: true });
    const fill = run.grazeMeter / GRAZE.perBomb;
    const barX = 16,
        barY = 165,
        barW = 144;
    p.rect(barX - 1, barY - 1, barW + 2, 8, 0x05060c, 1, L.panelText, true);
    const segs = 18;
    for (let i = 0; i < segs; i++) {
        const on = i / segs < fill;
        p.rect(barX + i * 8, barY, 7, 6, on ? (fill > 0.8 && Math.floor(t * 10) % 2 ? WHITE : CYAN) : 0x1c2238, 1, L.panelText, true);
    }
    p.text("GRAZE " + pad(run.grazeTotal, 4), 160, 154, { color: 0x7fe0ff, align: "right", layer: L.panelText, screen: true });
    // Chain.
    divider(p, 180);
    const mult = chainMultiplier(run.chain);
    p.text("CHAIN", 16, 190, { color: DIM, layer: L.panelText, screen: true });
    p.text(String(run.chain), 70, 186, { scale: 2, color: run.chain > 0 ? WHITE : 0x2f3a5a, layer: L.panelText, screen: true });
    p.text("x" + mult, 160, 186, { scale: 2, color: mult > 1 ? GOLD : 0x2f3a5a, align: "right", layer: L.panelText, screen: true });
    p.rect(16, 204, 144 * Math.max(0, run.chainT / CHAIN.window), 2, mult > 1 ? GOLD : DIM, 0.9, L.panelText, true);
    // Credits and controls.
    divider(p, 216);
    const pad1 = sim.input.usingPad;
    const lines = pad1
        ? ["A  FIRE", "X  SHOT CONTROL", "B  BOMB", "LB FOCUS", "START  PAUSE"]
        : ["Z  FIRE", "X  SHOT CONTROL", "C  BOMB", "SHIFT  FOCUS", "ESC  PAUSE"];
    lines.forEach((line, i) => p.text(line, 16, 226 + i * 11, { color: 0x4a5a82, layer: L.panelText, screen: true }));
    p.text(playing ? `CONTINUES ${run.credits}` : `${CREDITS} CREDITS`, LEFT_X, 300, { color: Math.floor(t * 1.5) % 2 ? GOLD : 0xa87b22, align: "center", layer: L.panelText, screen: true });

    // Right: weapon roster.
    const rx = FIELD.left + FIELD.width + 14;
    p.text("WEAPON", rx, 12, { color: DIM, layer: L.panelText, screen: true });
    p.text(flow.settings.muted ? "MUTE" : "", 626, 12, { color: RED, align: "right", layer: L.panelText, screen: true });
    WEAPONS.forEach((w, i) => {
        const y = 26 + i * 22;
        const active = i === run.weapon;
        if (active) {
            p.rect(rx - 4, y - 3, 152, 20, w.color, 0.16, L.panelText, true);
            p.rect(rx - 4, y - 3, 2, 20, w.color, 1, L.panelText, true);
        }
        p.spr("capsule", i, rx + 8, y + 7, { layer: L.panelText, screen: true, alpha: active ? 1 : 0.45 });
        p.text(w.name, rx + 22, y + 1, { color: active ? WHITE : 0x4a5a82, layer: L.panelText, screen: true });
        if (active) p.text(`${run.mode === 0 ? "A" : "B"} ${w.modes[run.mode]}`, rx + 22, y + 9, { color: w.color, layer: L.panelText, screen: true });
    });
    divider(p, 116, rx - 6);
    p.text("POWER", rx, 124, { color: DIM, layer: L.panelText, screen: true });
    for (let i = 0; i < PLAYER.maxPower; i++) {
        const on = i < run.power;
        p.rect(rx + 44 + i * 24, 123, 20, 9, on ? CYAN : 0x1c2238, 1, L.panelText, true);
        if (on) p.rect(rx + 44 + i * 24, 123, 20, 2, 0xb2f4ff, 1, L.panelText, true);
    }
    const need = chipsForNext(run.power);
    p.rect(rx + 44, 135, 92 * (Number.isFinite(need) ? run.chips / need : 1), 2, Number.isFinite(need) ? 0x7fe0ff : GOLD, 1, L.panelText, true);
    p.text(run.power >= PLAYER.maxPower ? "MAX" : `LV${run.power}`, rx, 134, { color: run.power >= PLAYER.maxPower ? GOLD : 0x4a5a82, layer: L.panelText, screen: true });
    // Danger (rank) meter.
    p.text("DANGER", rx, 148, { color: DIM, layer: L.panelText, screen: true });
    const danger = Math.floor(run.rank);
    for (let i = 0; i <= RANK.max; i++) {
        const on = i <= danger && playing;
        p.rect(rx + 44 + i * 12, 147, 9, 8, on ? (i >= 5 ? RED : i >= 3 ? 0xffb347 : 0xe8c252) : 0x1c2238, 1, L.panelText, true);
    }
    // Area progress track.
    divider(p, 164, rx - 6);
    const area = AREAS[sim.area.index]!;
    p.text(playing ? area.number : "AREA -", rx, 172, { color: DIM, layer: L.panelText, screen: true });
    p.text(playing ? area.name : "STANDBY", rx, 182, { color: WHITE, layer: L.panelText, screen: true });
    const lastEvent = area.events[area.events.length - 1]!.at;
    const progress = playing ? Math.min(1, sim.area.t / lastEvent) : 0;
    p.rect(rx, 196, 144, 3, 0x1c2238, 1, L.panelText, true);
    p.rect(rx, 196, 144 * progress, 3, CYAN, 1, L.panelText, true);
    p.rect(rx + 142, 193, 3, 9, RED, Math.floor(t * 4) % 2 ? 1 : 0.4, L.panelText, true);
    for (let i = 0; i < AREAS.length; i++)
        p.rect(rx + i * 50, 206, 44, 4, i < sim.area.index ? GOLD : i === sim.area.index && playing ? CYAN : 0x1c2238, 1, L.panelText, true);

    // Boss telemetry.
    divider(p, 218, rx - 6);
    if (sim.boss && !sim.boss.entering) {
        p.text("TARGET", rx, 226, { color: RED, layer: L.panelText, screen: true });
        p.text(sim.boss.name, rx, 236, { color: WHITE, layer: L.panelText, screen: true });
        p.text(`PHASE ${sim.boss.phase + 1}`, rx, 246, { color: 0xff8a86, layer: L.panelText, screen: true });
        const left = Math.max(0, Math.ceil((sim.bossCtl?.limit ?? 0) + 4 - sim.boss.t));
        const over = sim.boss.overtime;
        p.text(over ? "NO RETREAT" : `TIME ${String(left).padStart(3, "0")}`, rx, 256, { color: over || left < 15 ? RED : GOLD, layer: L.panelText, screen: true });
    } else {
        p.text("SCANNING", rx, 226, { color: 0x2f3a5a, layer: L.panelText, screen: true });
        for (let i = 0; i < 6; i++) p.rect(rx + ((t * 60 + i * 25) % 144), 238, 1, 10, CYAN, 0.25, L.panelText, true);
    }
    p.text(flow.settings.crt ? "V CRT ON" : "V CRT OFF", rx, 300, { color: 0x2f3a5a, layer: L.panelText, screen: true });
    p.text("M SOUND", rx + 72, 300, { color: 0x2f3a5a, layer: L.panelText, screen: true });
}

function divider(p: Painter, y: number, x = 10): void {
    p.rect(x, y, 156, 1, 0x2a3354, 1, L.panelText, true);
    p.rect(x, y + 1, 156, 1, 0x05060c, 1, L.panelText, true);
}

const FX0 = FIELD.left;
const CARD_TIME = 3.6;
/** Screen x of a playfield x. */
const fx = (x: number) => FX0 + x;

/** In-playfield overlays: boss bar, banners, popups, flash, area card. Screen space. */
export function drawFieldOverlays(p: Painter, sim: Sim, flow: Flow): void {
    const t = sim.time;
    const fb = sim.feedback;
    // Boss health bar.
    const boss = sim.boss;
    if (boss && !boss.escaped) {
        const k = boss.maxHp > 0 ? Math.max(0, boss.hp / boss.maxHp) : 0;
        const x = fx(12),
            y = 8,
            w = FIELD_W - 24;
        p.text(boss.name, x, y, { color: 0xff8a86, layer: L.fieldText, screen: true });
        p.rect(x, y + 10, w, 5, 0x05060c, 0.85, L.fieldText, true);
        const barColor = boss.dying > 0 ? WHITE : boss.armoured ? 0x5a6a8a : k < 0.3 && Math.floor(t * 8) % 2 ? WHITE : RED;
        p.rect(x + 1, y + 11, (w - 2) * k, 3, barColor, 1, L.fieldText, true);
        if (boss.armoured && !boss.dying) p.text("ARMOURED", x + w, y, { color: 0x7184ad, align: "right", layer: L.fieldText, screen: true });
        for (let i = 1; i < 10; i++) p.rect(x + (w * i) / 10, y + 11, 1, 3, 0x05060c, 0.8, L.fieldText, true);
    }
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
    if (fb.flash > 0) p.rect(fx(0), 0, FIELD_W, FIELD_H, fb.flashColor, Math.min(0.7, fb.flash * (flow.settings.calm ? 0.3 : 0.6)), L.overlay, true);
}

function drawBanner(p: Painter, text: string, sub: string, style: string, bt: number, life: number, t: number): void {
    const fade = Math.min(1, bt * 8, (life - bt) * 5);
    if (style === "warning" && text === "WARNING") {
        // Hazard bands, blinking title and a wireframe target box.
        const cy = 150;
        const open = Math.min(1, bt * 3);
        const h = 70 * open;
        p.rect(fx(0), cy - h / 2, FIELD_W, h, 0x2a0410, 0.75 * fade, L.fieldText, true);
        for (const y of [cy - h / 2, cy + h / 2 - 6]) {
            for (let x = -12; x < FIELD_W + 12; x += 12) {
                const sx = x + ((t * 60) % 12);
                if (sx < 0 || sx > FIELD_W - 6) continue;
                p.rect(fx(sx), y, 6, 6, RED, fade, L.fieldText, true);
            }
        }
        if (Math.floor(bt * 4) % 2 === 0) p.text("WARNING", CX, cy - 14, { scale: 3, color: RED, align: "center", layer: L.fieldText, screen: true, alpha: fade });
        p.text(sub, CX, cy + 12, { color: 0xffd6d6, align: "center", layer: L.fieldText, screen: true, alpha: fade });
        // Grid scan lines sweeping down the band.
        const scan = (bt * 120) % h;
        p.rect(fx(0), cy - h / 2 + scan, FIELD_W, 1, 0xff8a86, 0.5 * fade, L.fieldText, true);
        return;
    }
    if (style === "warning") {
        p.rect(fx(0), 96, FIELD_W, 34, 0x2a0410, 0.3 * fade, L.fieldText, true);
        p.rect(fx(0), 96, FIELD_W, 1, RED, fade, L.fieldText, true);
        p.rect(fx(0), 129, FIELD_W, 1, RED, fade, L.fieldText, true);
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
    p.rect(fx(0), 0, FIELD_W, bar, 0x000000, 0.85 * fade, L.fieldText, true);
    p.rect(fx(0), FIELD_H - bar, FIELD_W, bar, 0x000000, 0.85 * fade, L.fieldText, true);
    const y = 112;
    p.rect(fx(16), y - 6, FIELD_W - 32, 96, 0x05060c, 0.6 * fade, L.fieldText, true);
    p.rect(fx(16), y - 6, 3, 96, GOLD, fade, L.fieldText, true);
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
    p.rect(fx(0), FIELD_H - 40, FIELD_W, 11, 0x5a0a1c, fade, L.fieldText, true);
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
                if (active) p.rect(CX - 70, 156 + i * 18, 140, 13, CYAN, 0.2, L.screen, true);
                p.text((active ? "▶ " : "  ") + item, CX, 159 + i * 18, { color: active ? WHITE : DIM, align: "center", layer: L.screenText, screen: true });
            });
            p.text("ESC / START TO RESUME", CX, 230, { color: 0x4a5a82, align: "center", layer: L.screenText, screen: true });
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
    p.rect(fx(0), 0, FIELD_W, FIELD_H, 0x05060c, alpha, L.screen, true);
}

function logo(p: Painter, y: number, t: number): void {
    p.rect(fx(14), y - 10, FIELD_W - 28, 74, 0x05060c, 0.55, L.screen, true);
    p.text("STARFALL", CX + 3, y + 3, { scale: 4, color: 0x5c1d12, align: "center", layer: L.screenText, screen: true });
    p.text("STARFALL", CX, y, { scale: 4, color: 0xffb347, align: "center", layer: L.screenText, screen: true });
    p.text("STARFALL", CX, y - 1, { scale: 4, color: 0xfff2a8, align: "center", layer: L.screen, screen: true, alpha: 0.6 });
    // Speed streaks behind RELOAD.
    for (let i = 0; i < 5; i++) {
        const sx = ((t * 260 + i * 70) % 330) - 30;
        const len = 30 + i * 6;
        const a = Math.max(0, sx),
            b = Math.min(FIELD_W, sx + len);
        if (b > a) p.rect(fx(a), y + 36 + i * 4, b - a, 1, CYAN, 0.5, L.screen, true);
    }
    p.text("RELOAD", CX + 2, y + 34, { scale: 3, color: 0x0d4a6e, align: "center", layer: L.screenText, screen: true });
    p.text("RELOAD", CX, y + 32, { scale: 3, color: Math.floor(t * 8) % 16 === 0 ? WHITE : CYAN, align: "center", layer: L.screenText, screen: true });
    const shine = ((t * 120) % 500) - 100;
    if (shine > 0 && shine < 200) p.rect(CX - 100 + shine, y - 2, 6, 31, WHITE, 0.35, L.screenText, true);
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
        p.rect(x - 14, 160, 28, 34, active ? CYAN : 0x1c2238, active ? 0.3 : 0.8, L.screen, true);
        p.text(ENTRY_CHARS[entry.letters[i]!]!, x, 166, { scale: 4, color: active && Math.floor(t * 4) % 2 ? WHITE : GOLD, align: "center", layer: L.screenText, screen: true });
        if (active) {
            p.text("▲", x, 150, { color: CYAN, align: "center", layer: L.screenText, screen: true });
            p.text("▼", x, 198, { color: CYAN, align: "center", layer: L.screenText, screen: true });
        }
    }
    p.text(entry.done ? "SAVED" : "UP/DOWN LETTER · FIRE NEXT · BOMB BACK", CX, 222, { color: entry.done ? GOLD : 0x4a5a82, align: "center", layer: L.screenText, screen: true });
}
