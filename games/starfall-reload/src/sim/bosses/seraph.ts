import { B, K } from "../../config/enemies.ts";
import { FIELD_W } from "../../config/view.ts";
import { banner, cue, flash, type BossRuntime, type Sim } from "../context.ts";
import { ring } from "../effects.ts";
import { PHASE_PAUSE, alive, changePhase, ease, holdHp, every, hpOf, newBoss, posOf, setFrame, setVulnerable, shoot, spawnPart, spawnRoot, type BossController } from "./common.ts";

/**
 * SERAPH ENGINE — final boss. An orbital engine with two blades and a shuttered core.
 * Phase 0: blades sweep curving blades of bullets; the core opens on a rhythm.
 * Phase 1: flower spirals with pause-and-re-aim rings. Phase 2: drifting curtains.
 * Phase 3 "LAST RELOAD": counter-rotating spirals until the core breaks.
 */
const CORE = 1,
    WING_L = 2,
    WING_R = 3;
const CORE_HP = 1800;

export const seraph: BossController = {
    id: "seraph",
    midboss: false,
    entryY: 86,
    music: "finalBoss",
    limit: 150,
    core: (b) => b.parts.find((p) => p.role === CORE)!.entity,
    onTimeout(sim, b) {
        const at = posOf(sim, this.core(b));
        if (at && b.phase < 3) nextPhase(sim, b, at.x, at.y, 3, "LAST RELOAD");
    },
    spawn(sim: Sim): BossRuntime {
        const root = spawnRoot(sim, K.seraph, FIELD_W / 2, -90);
        const b = newBoss(K.seraph, root, "SERAPH ENGINE", false, CORE_HP);
        spawnPart(sim, b, K.seraphCore, CORE, FIELD_W / 2, -90);
        spawnPart(sim, b, K.seraphWing, WING_L, FIELD_W / 2 - 104, -80);
        spawnPart(sim, b, K.seraphWing, WING_R, FIELD_W / 2 + 104, -80);
        return b;
    },
    move(sim, b, dt) {
        const p = posOf(sim, b.root)!;
        if (b.entering) return { x: p.x, y: ease(p.y, this.entryY, 1.4, dt) + 0.4 };
        if (b.phase === 3) return { x: FIELD_W / 2 + Math.sin(b.phaseT * 0.9) * 50, y: this.entryY + Math.sin(b.phaseT * 1.8) * 16 };
        return { x: FIELD_W / 2 + Math.sin(b.t * 0.4) * (b.phase === 0 ? 12 : 30), y: this.entryY + Math.sin(b.t * 0.9) * 6 };
    },
    offset(role, b) {
        if (role === CORE) return { x: 0, y: 2 };
        const spread = 104 + Math.sin(b.t * 1.6) * 3;
        return { x: role === WING_L ? -spread : spread, y: 10 + Math.sin(b.t * 2 + role) * 3 };
    },
    health(sim, b) {
        return hpOf(sim, b.parts.find((p) => p.role === CORE)!.entity);
    },
    update(sim, b, dt) {
        const core = b.parts.find((p) => p.role === CORE)!.entity;
        // Phase floors: shutters absorb most damage early; later phases last at least 6 s.
        if (b.phase === 0) holdHp(sim, core, CORE_HP, 0.85);
        else if (b.phase === 1 && b.phaseT < 6) holdHp(sim, core, CORE_HP, 0.62);
        else if (b.phase === 2 && b.phaseT < 6) holdHp(sim, core, CORE_HP, 0.3);
        const at = posOf(sim, core);
        if (!at) return;
        const coreHp = hpOf(sim, core);
        const wings = b.parts.filter((p) => p.role !== CORE && alive(sim, p.entity));
        for (const w of wings) setVulnerable(sim, w.entity, true);

        if (b.phase === 0) {
            // Core rhythm: 2.5 s shut, 3.5 s open.
            const open = b.phaseT % 6 > 2.5;
            setVulnerable(sim, core, open);
            setFrame(sim, core, open ? 1 : 0);
            if (open && every(sim, b, "coreRing", 0.95, dt)) shoot.ring(sim, at.x, at.y, 14, 80, B.pink, b.t);
            for (const w of wings) {
                const wp = posOf(sim, w.entity);
                if (!wp) continue;
                const side = w.role === WING_L ? -1 : 1;
                if (every(sim, b, `fan${w.role}`, 1.65, dt, w.role === WING_L ? 0 : 0.67))
                    shoot.fan(sim, wp.x, wp.y + 20, shoot.aim(sim, wp.x, wp.y), 5, 44, 150, B.needle);
                if (every(sim, b, `blade${w.role}`, 3.2, dt, w.role === WING_L ? 1.2 : 2.8)) {
                    for (let i = 0; i < 12; i++)
                        shoot.one(sim, wp.x, wp.y + 24, side * -0.35 + i * 0.012 * side, 70 + i * 9, B.pink, { turn: side * 0.55 });
                }
            }
            if (wings.length === 0 || b.phaseT > 36) {
                changePhase(sim, b, 1, at.x, at.y);
                banner(sim, "CORE UNSEALED", "SERAPH ENGINE", "warning", 1.6);
                cue(sim, "warning");
                ring(sim, at.x, at.y, 6, 90, 0.5, 0xe6a8ff);
            }
            return;
        }
        setVulnerable(sim, core, true);
        setFrame(sim, core, 1);
        if (b.phaseT < PHASE_PAUSE) return;
        if (b.phase === 1) {
            if (every(sim, b, "flower", 0.075, dt)) {
                const dir = Math.floor(b.phaseT / 2.4) % 2 === 0 ? 1 : -1;
                const a = (b.clocks.spin = (b.clocks.spin ?? 0) + 0.2 * dir);
                for (let i = 0; i < 3; i++) shoot.one(sim, at.x, at.y, a + (i * Math.PI * 2) / 3, 92, B.pink);
            }
            if (every(sim, b, "seek", 2.6, dt, 1.4)) {
                for (let i = 0; i < 12; i++) shoot.one(sim, at.x, at.y, (i / 12) * Math.PI * 2, 55, B.gold, { delay: 0.85, speed2: 165 });
            }
            if (coreHp < CORE_HP * 0.62) nextPhase(sim, b, at.x, at.y, 2, "TERMINAL MODE");
            return;
        }
        if (b.phase === 2) {
            if (every(sim, b, "curtain", 0.5, dt)) {
                const gap = FIELD_W / 2 + Math.sin(b.phaseT * 0.95) * 95;
                for (let x = 6; x < FIELD_W; x += 15) {
                    if (Math.abs(x - gap) < 26) continue;
                    if (Math.abs(x - sim.px) < 30 && Math.abs(at.y + 26 - sim.py) < 40) continue; // never on top of the ship
                    shoot.one(sim, x, at.y + 26, 0, 96, B.pink);
                }
            }
            if (every(sim, b, "needles", 1.15, dt, 0.5)) shoot.fan(sim, at.x, at.y, shoot.aim(sim, at.x, at.y), 3, 10, 190, B.needle);
            if (every(sim, b, "orb", 3.6, dt, 2)) shoot.one(sim, at.x, at.y, shoot.aim(sim, at.x, at.y), 70, B.big, { delay: 1.0, split: 12, speed2: 95 });
            if (coreHp < CORE_HP * 0.3) nextPhase(sim, b, at.x, at.y, 3, "LAST RELOAD");
            return;
        }
        // Phase 3: counter-rotating spirals + periodic rings.
        if (every(sim, b, "spiralA", 0.055, dt)) {
            const a = (b.clocks.a = (b.clocks.a ?? 0) + 0.17);
            const c = (b.clocks.c = (b.clocks.c ?? 0) - 0.13);
            shoot.one(sim, at.x, at.y, a, 100, B.orange);
            shoot.one(sim, at.x, at.y, a + Math.PI, 100, B.orange);
            shoot.one(sim, at.x, at.y, c, 80, B.pink);
        }
        if (every(sim, b, "rings", 1.7, dt)) shoot.ring(sim, at.x, at.y, 20, 120, B.orange, b.phaseT);
    },
};

function nextPhase(sim: Sim, b: BossRuntime, x: number, y: number, phase: number, title: string): void {
    changePhase(sim, b, phase, x, y);
    flash(sim, 0.5, 0xe6a8ff);
    ring(sim, x, y, 8, 160, 0.5, 0xe6a8ff);
    banner(sim, title, "SERAPH ENGINE", "warning", 1.6);
    cue(sim, "warning");
}
