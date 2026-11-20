import { lerp } from "@ngne/core";
import { EF, Pose, Wall } from "../ecs/components.ts";
import { ITEM } from "../ecs/spawn.ts";
import { AREAS } from "../config/areas.ts";
import { B, K, spec } from "../config/enemies.ts";
import { FIELD_H, FIELD_W, L } from "../config/view.ts";
import { WEAPONS } from "../config/weapons.ts";
import type { Sim } from "../sim/context.ts";
import { FX } from "../sim/effects.ts";
import { STYLE } from "../sim/weapons.ts";
import { AVENUES, TILE_H, TILE_W } from "./backdrops.ts";
import type { Painter } from "./painter.ts";

const BULLET_SPRITE = ["b-pink", "b-orange", "b-violet", "b-needle", "b-big", "b-gold"];
const BULLET_GLOW = [0xff4fa0, 0xff8a2a, 0xb35cff, 0xff6fae, 0xff3355, 0xffd23a];
const SHOT_SPRITE = ["s-vulcan", "s-rail", "s-seek", "s-bead", "s-shell", "s-frag", "s-twin"];

/** Tiled, vertically scrolling backdrop layer in world coordinates. */
function tile(p: Painter, texture: string, offset: number, layer: number, alpha = 1, color = 0xffffff): void {
    const o = ((offset % TILE_H) + TILE_H) % TILE_H;
    for (let top = o - TILE_H; top < FIELD_H; top += TILE_H)
        p.frame.sprite({ x: TILE_W / 2, y: Math.round(top) + TILE_H / 2, width: TILE_W, height: TILE_H, texture, layer, alpha, color });
}

export function drawBackdrop(p: Painter, sim: Sim, areaIndex: number, distance: number): void {
    const area = AREAS[areaIndex]!;
    const t = sim.time;
    switch (area.backdrop) {
        case "cirrus":
            tile(p, "bg-cirrus-far", distance * 0.3, L.sky);
            tile(p, "bg-cirrus-clouds", distance, L.skyMid);
            tile(p, "bg-cirrus-wisps", distance * 2.4 + 140, L.wisps, 0.55);
            break;
        case "grid": {
            tile(p, "bg-grid-city", distance, L.sky);
            // Traffic: light pairs running along the avenues.
            for (let a = 0; a < AVENUES.length; a++) {
                const x = AVENUES[a]!;
                for (let k = 0; k < 7; k++) {
                    const up = (a + k) % 2 === 0;
                    const phase = (k * 97 + a * 53) % TILE_H;
                    const speed = 40 + ((k * 13) % 30);
                    const y = (((phase + distance + (up ? -t * speed : t * speed)) % (FIELD_H + 20)) + FIELD_H + 20) % (FIELD_H + 20) - 10;
                    const lx = x + (up ? -1.5 : 1.5);
                    p.rect(lx, y, 1, 2, up ? 0xfff0b8 : 0xff3d4f, 1, L.skyMid);
                    p.rect(lx - 1, y - 1, 3, 4, up ? 0xffb347 : 0x92203a, 0.25, L.skyMid);
                }
            }
            tile(p, "bg-grid-haze", distance * 1.8, L.wisps, 0.3, 0xa0a0ff);
            break;
        }
        case "aurora": {
            // The Earth falls away as the area climbs; stars take over near the engine.
            const climb = Math.min(1, sim.area.t / 80);
            tile(p, "bg-aurora-stars", distance * 0.12, L.sky);
            tile(p, "bg-aurora-earth", distance * 0.5, L.skyMid, 1 - climb * 0.85);
            break;
        }
    }
}

const ip = (prev: number, cur: number, alpha: number) => lerp(prev, cur, alpha);

/** Draws every gameplay entity for this frame. Reads simulation state only. */
export function drawWorld(p: Painter, sim: Sim, alpha: number, shadows: boolean): void {
    const t = sim.time;
    const blink = Math.floor(t * 30) % 2 === 0;

    // Enemies (and boss parts).
    sim.q.enemies.eachChunk((chunk) => {
        const pose = chunk.views.pose;
        const e = chunk.views.enemy;
        for (let row = 0, n = chunk.count; row < n; row++) {
            const kind = e.kind[row]!;
            const s = spec(kind);
            const x = ip(pose.px[row]!, pose.x[row]!, alpha);
            const y = ip(pose.py[row]!, pose.y[row]!, alpha);
            const ground = (e.flags[row]! & EF.ground) !== 0;
            const isBoss = s.size === "boss" || e.part[row]! > 0;
            const layer = kind === K.seraph || kind === K.halberd || kind === K.cantor ? L.boss : e.part[row]! > 0 ? L.bossPart : ground ? L.ground : L.enemy;
            const frames = p.atlas.frames(s.sprite) || 1;
            let frame = e.frame[row]!;
            if (s.frameTime > 0 && frames > 1) frame = Math.floor(e.age[row]! / s.frameTime + row) % frames;
            if (kind === K.rockL || kind === K.rockS) frame = e.frame[row]!;
            const flashing = e.flash[row]! > 0 && e.hp[row]! > 0;
            const dying = e.hp[row]! <= 0 && isBoss;
            const rot = kind === K.rockL || kind === K.rockS ? e.rot[row]! : 0;
            const mirror = kind === K.seraphWing && e.part[row] === 2 ? -1 : 1;
            if (shadows && !ground && !isBoss) p.spr(s.sprite, frame, x + 9, y + 15, { layer: L.airShadow, flash: true, color: 0x000000, alpha: 0.32, rotation: rot });
            if (shadows && (kind === K.halberd || kind === K.lancer)) p.spr(s.sprite, frame, x + 16, y + 28, { layer: L.airShadow, flash: true, color: 0x000000, alpha: 0.3 });
            p.spr(s.sprite, frame, x, y, { layer, rotation: rot, sx: mirror, flash: flashing || (dying && blink), color: dying && !blink ? 0xff9a8a : 0xffffff });
            if (kind === K.turret) p.spr("turret-barrel", 0, x, y, { layer: L.groundTop, rotation: Math.PI - e.rot[row]!, flash: flashing });
            if (kind === K.cantorTurret && e.frame[row] === 1) p.spr("glow", 0, x, y, { layer: L.bossPart, color: 0xff3d4f, alpha: 0.35 + 0.15 * Math.sin(t * 20), sx: 1.1, sy: 1.1 });
            if (kind === K.seraphCore && e.frame[row] === 1) p.spr("glow", 0, x, y, { layer: L.bossPart, color: 0xe6a8ff, alpha: 0.4 + 0.2 * Math.sin(t * 9), sx: 1.8, sy: 1.8 });
            if (kind === K.sentry) p.spr("glow-s", 0, x, y, { layer: L.enemy, color: 0xff3d4f, alpha: 0.3 + 0.25 * Math.sin(t * 8 + row) });
        }
    });

    // Barrier walls: dotted telegraph while warming, then a live beam.
    sim.q.walls.eachChunk((chunk) => {
        const wall = chunk.views.wall;
        for (let row = 0, n = chunk.count; row < n; row++) {
            const self = chunk.entityAt(row);
            const l = sim.world.read(self, Wall, "left"),
                r = sim.world.read(self, Wall, "right");
            if (!l || !r || !sim.world.has(l) || !sim.world.has(r)) continue;
            const lx = sim.world.read(l, Pose, "x") ?? 0,
                ly = sim.world.read(l, Pose, "y") ?? 0,
                rx = sim.world.read(r, Pose, "x") ?? 0;
            const warm = wall.warm[row]!;
            if (warm < 1) {
                if (Math.floor(t * 16) % 2 === 0) for (let x = lx + 8; x < rx - 8; x += 6) p.rect(x, ly - 0.5, 3, 1, 0xa964d2, 0.8, L.groundTop);
            } else {
                const pulse = 0.75 + 0.25 * Math.sin(t * 30 + row);
                const w = rx - lx - 12;
                p.rect(lx + 6, ly - 5, w, 10, 0x6f37a0, 0.3 * pulse, L.groundTop);
                p.rect(lx + 6, ly - 2.5, w, 5, 0xa964d2, 0.8 * pulse, L.groundTop);
                p.rect(lx + 6, ly - 1, w, 2, 0xffffff, 1, L.groundTop);
                // Crackle: short bright arcs crawling along the beam.
                for (let k = 0; k < 4; k++) {
                    const cx = lx + 6 + (((t * 90 + k * 37 + row * 13) % w) + w) % w;
                    p.rect(cx, ly - 3 + (k % 3), 3, 1, 0xe6a8ff, 1, L.groundTop);
                }
            }
        }
    });

    // Items.
    sim.q.items.eachChunk((chunk) => {
        const pose = chunk.views.pose;
        const item = chunk.views.item;
        for (let row = 0, n = chunk.count; row < n; row++) {
            const x = ip(pose.px[row]!, pose.x[row]!, alpha),
                y = ip(pose.py[row]!, pose.y[row]!, alpha);
            const age = item.age[row]!;
            switch (item.kind[row]) {
                case ITEM.chip:
                    p.spr("chip", Math.floor(age * 10) % 2, x, y, { layer: L.pickup });
                    break;
                case ITEM.capsule: {
                    const letter = item.letter[row]!;
                    p.spr("glow", 0, x, y, { layer: L.pickup, color: WEAPONS[letter]!.color, alpha: 0.35 + 0.15 * Math.sin(age * 8), sx: 1.1, sy: 1.1 });
                    p.spr("capsule", letter, x, y, { layer: L.pickup });
                    break;
                }
                case ITEM.bomb:
                    p.spr("glow-s", 0, x, y, { layer: L.pickup, color: 0xffb347, alpha: 0.5 });
                    p.spr("bomb-pickup", Math.floor(age * 5) % 2, x, y, { layer: L.pickup });
                    break;
                case ITEM.oneup:
                    p.spr("glow", 0, x, y, { layer: L.pickup, color: 0xe8c252, alpha: 0.45 });
                    p.spr("oneup", 0, x, y, { layer: L.pickup });
                    break;
            }
        }
    });

    // Player shots.
    sim.q.shots.eachChunk((chunk) => {
        const pose = chunk.views.pose;
        const motion = chunk.views.motion;
        const shot = chunk.views.shot;
        for (let row = 0, n = chunk.count; row < n; row++) {
            const x = ip(pose.px[row]!, pose.x[row]!, alpha),
                y = ip(pose.py[row]!, pose.y[row]!, alpha);
            const style = shot.style[row]!;
            const rot = style === STYLE.seek || style === STYLE.vulcan || style === STYLE.fragment ? Math.atan2(motion.vx[row]!, -motion.vy[row]!) : 0;
            p.spr(SHOT_SPRITE[style]!, 0, x, y, { layer: L.shot, rotation: rot, alpha: 0.95 });
            if (style === STYLE.rail) p.spr("glow-s", 0, x, y, { layer: L.shot, color: 0x46c8ee, alpha: 0.35, sx: 0.8, sy: 2 });
        }
    });

    // Player ship, flames, satellites.
    const ship = sim.player;
    if (ship) {
        sim.q.ships.eachChunk((chunk) => {
            const pose = chunk.views.pose;
            const s = chunk.views.ship;
            for (let row = 0, n = chunk.count; row < n; row++) {
                if (!s.alive[row]) continue;
                const x = ip(pose.px[row]!, pose.x[row]!, alpha),
                    y = ip(pose.py[row]!, pose.y[row]!, alpha);
                const invuln = s.invuln[row]! > 0;
                if (invuln && s.entering[row]! <= 0 && Math.floor(t * 20) % 3 === 0) continue;
                const bankFrame = Math.max(0, Math.min(4, Math.round(s.bank[row]! * 2) + 2));
                const flame = Math.floor(t * 20) % 2;
                if (shadows) p.spr("player", bankFrame, x + 10, y + 18, { layer: L.airShadow, flash: true, color: 0x000000, alpha: 0.3 });
                p.spr("player-flame", flame, x - 5, y + 20, { layer: L.player });
                p.spr("player-flame", 1 - flame, x + 5, y + 20, { layer: L.player });
                p.spr("glow-s", 0, x, y + 16, { layer: L.player, color: 0xffb347, alpha: 0.4 });
                p.spr("player", bankFrame, x, y, { layer: L.player });
                if (sim.input.focus) {
                    p.spr("glow-s", 0, x, y, { layer: L.bullet, color: 0xff4fa0, alpha: 0.55, sx: 0.6, sy: 0.6 });
                    p.rect(x - 1.5, y - 1.5, 3, 3, 0xffffff, 1, L.bullet);
                } else p.rect(x - 1, y - 1, 2, 2, 0xffffff, 0.85, L.player);
            }
        });
        sim.q.halos.eachChunk((chunk) => {
            const pose = chunk.views.pose;
            for (let row = 0, n = chunk.count; row < n; row++) {
                const x = ip(pose.px[row]!, pose.x[row]!, alpha),
                    y = ip(pose.py[row]!, pose.y[row]!, alpha);
                p.spr("glow-s", 0, x, y, { layer: L.player, color: 0x9bf27a, alpha: 0.5 });
                p.spr("halo", Math.floor(t * 6 + row) % 2, x, y, { layer: L.player });
            }
        });
    }

    // Hostile bullets: soft halo under a crisp, dark-rimmed core.
    sim.q.bullets.eachChunk((chunk) => {
        const pose = chunk.views.pose;
        const motion = chunk.views.motion;
        const bullet = chunk.views.bullet;
        for (let row = 0, n = chunk.count; row < n; row++) {
            const x = ip(pose.px[row]!, pose.x[row]!, alpha),
                y = ip(pose.py[row]!, pose.y[row]!, alpha);
            const kind = bullet.kind[row]!;
            const big = kind === B.big;
            const age = bullet.age[row]!;
            const spawnScale = age < 0.08 ? 0.4 + age * 7.5 : 1;
            p.spr(big ? "glow" : "glow-s", 0, x, y, { layer: L.bulletGlow, color: BULLET_GLOW[kind]!, alpha: 0.45, sx: spawnScale, sy: spawnScale });
            const rot = kind === B.needle ? Math.atan2(-motion.vx[row]!, motion.vy[row]!) : 0;
            const pulse = big && bullet.split[row]! > 0 ? 1 + 0.15 * Math.sin(age * 30) : 1;
            p.spr(BULLET_SPRITE[kind]!, 0, x, y, { layer: L.bullet, rotation: rot, sx: spawnScale * pulse, sy: spawnScale * pulse });
        }
    });

    // Particles.
    sim.q.fx.eachChunk((chunk) => {
        const pose = chunk.views.pose;
        const f = chunk.views.fx;
        for (let row = 0, n = chunk.count; row < n; row++) {
            const x = ip(pose.px[row]!, pose.x[row]!, alpha),
                y = ip(pose.py[row]!, pose.y[row]!, alpha);
            const k = f.age[row]! / f.life[row]!;
            const size = f.size[row]!,
                size2 = f.size2[row]!;
            const color = f.color[row]!;
            const layer = f.layer[row]! || L.fx;
            switch (f.kind[row]) {
                case FX.spark: {
                    const len = size2 * (1 - k);
                    const a = Math.atan2(f.vy[row]!, f.vx[row]!);
                    p.line(x, y, x - Math.cos(a) * len, y - Math.sin(a) * len, size, color, 1 - k * 0.5, layer);
                    break;
                }
                case FX.explosion: {
                    const frames = p.atlas.frames("explosion");
                    const fr = Math.min(frames - 1, Math.floor(k * frames));
                    const scale = size / 48;
                    p.spr("explosion", fr, x, y, { layer, rotation: Math.round(f.rot[row]! / (Math.PI / 2)) * (Math.PI / 2), sx: scale, sy: scale });
                    break;
                }
                case FX.smoke: {
                    const s = (size + (size2 - size) * k) / 32;
                    p.spr("smoke", 0, x, y, { layer: L.fx, alpha: 0.6 * (1 - k), sx: s, sy: s });
                    break;
                }
                case FX.ring: {
                    const s = (size + (size2 - size) * Math.sqrt(k)) / 32;
                    p.spr(size2 > 120 ? "ring" : "ring-thin", 0, x, y, { layer, color, alpha: 1 - k, sx: s, sy: s });
                    break;
                }
                case FX.glow: {
                    const s = (size + (size2 - size) * k) / 32;
                    p.spr("glow", 0, x, y, { layer, color, alpha: 1 - k, sx: s, sy: s });
                    break;
                }
                case FX.debris:
                    p.frame.sprite({ x, y, width: size, height: size, rotation: f.rot[row]!, color, alpha: 1 - k * k, layer, texture: p.atlas.id, ...pxUv(p) });
                    break;
                case FX.muzzle: {
                    const s = (size * (1 - k * 0.5)) / 16;
                    p.spr("glow-s", 0, x, y, { layer, color, alpha: 0.9, sx: s, sy: s });
                    p.rect(x - 1, y - 2, 2, 4, 0xffffff, 1, layer);
                    break;
                }
                case FX.twinkle:
                    p.spr("star", 0, x, y, { layer, color, alpha: 1 - k, sx: 1 - k * 0.6, sy: 1 - k * 0.6 });
                    break;
            }
        }
    });

    // Bomb shock front.
    const run = sim.run;
    if (run.bombT > 0) {
        const s = Math.min(run.bombR, 460) / 32;
        p.spr("ring", 0, run.bombX, run.bombY, { layer: L.overlay, color: 0xfff0b8, alpha: Math.min(1, run.bombT * 2), sx: s, sy: s });
        p.rect(0, 0, FIELD_W, FIELD_H, 0xffb347, Math.min(0.25, run.bombT * 0.3), L.overlay);
    }
}

function pxUv(p: Painter) {
    const r = p.atlas.get("px");
    return { u: r.u + r.uw * 0.25, v: r.v + r.vh * 0.25, uw: r.uw * 0.5, vh: r.vh * 0.5 };
}
