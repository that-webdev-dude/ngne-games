import { Enemy } from "../../ecs/components.ts";
import { B, K } from "../../config/enemies.ts";
import { FIELD_W } from "../../config/view.ts";
import { banner, cue, type BossRuntime, type Sim } from "../context.ts";
import { ring } from "../effects.ts";
import { PHASE_PAUSE, alive, changePhase, ease, holdHp, every, hpOf, newBoss, posOf, setFrame, setVulnerable, shoot, spawnPart, spawnRoot, type BossController } from "./common.ts";

/**
 * CANTOR — Area 2 boss. A fortress-crawler grinding up the avenue. Its four turrets open in
 * alternating pairs: the glow that warns of a volley is also the only time they can be hurt.
 * Three turrets down (or 45 s) opens the central hatch; below 40 % it lays bullet curtains.
 */
const SOCKETS: Record<number, { x: number; y: number }> = {
    1: { x: -44, y: -24 },
    2: { x: 44, y: -24 },
    3: { x: -44, y: 30 },
    4: { x: 44, y: 30 },
};
const CYCLE = 3.4,
    WARN = 0.7,
    OPEN = 2.0;
const CORE_HP = 1150;

export const cantor: BossController = {
    id: "cantor",
    midboss: false,
    entryY: 104,
    music: "boss",
    limit: 110,
    core: (b) => b.root,
    spawn(sim: Sim): BossRuntime {
        const root = spawnRoot(sim, K.cantor, FIELD_W / 2, -90);
        const b = newBoss(K.cantor, root, "CANTOR", false, CORE_HP);
        for (const role of [1, 2, 3, 4]) spawnPart(sim, b, K.cantorTurret, role, FIELD_W / 2 + SOCKETS[role]!.x, -90 + SOCKETS[role]!.y);
        return b;
    },
    move(sim, b, dt) {
        const p = posOf(sim, b.root)!;
        if (b.entering) return { x: p.x, y: ease(p.y, this.entryY, 2.2, dt) + 0.4 };
        const lurch = b.phase === 2 ? Math.sin(b.phaseT * 0.9) * 22 : 0;
        return { x: FIELD_W / 2 + Math.sin(b.t * 0.33) * 30, y: this.entryY + lurch + Math.sin(b.t * 7) * 0.6 };
    },
    offset(role) {
        return SOCKETS[role] ?? { x: 0, y: 0 };
    },
    health(sim, b) {
        return hpOf(sim, b.root);
    },
    update(sim, b, dt) {
        const root = posOf(sim, b.root)!;
        const turrets = b.parts.filter((p) => alive(sim, p.entity));
        // Turret cycle: the near row (3, 4) then the far row (1, 2). Closed turrets retract
        // into the hull, so they neither block shots nor take damage.
        const cycleT = b.t % (CYCLE * 2);
        if (b.phase === 1 && b.phaseT < 5) holdHp(sim, b.root, CORE_HP, 0.4);
        const pairA = cycleT < CYCLE;
        const local = cycleT % CYCLE;
        const warming = local < WARN;
        const open = local >= WARN && local < WARN + OPEN;
        for (const p of turrets) {
            const inPair = pairA ? p.role === 3 || p.role === 4 : p.role === 1 || p.role === 2;
            const active = inPair && open;
            setVulnerable(sim, p.entity, active);
            sim.world.write(p.entity, Enemy, "radius", active ? 11 : 1);
            setFrame(sim, p.entity, active || (inPair && warming && Math.floor(local * 12) % 2 === 0) ? 1 : 0);
            const at = posOf(sim, p.entity);
            if (!at) continue;
            sim.world.write(p.entity, Enemy, "rot", shoot.aim(sim, at.x, at.y));
            if (active && every(sim, b, `t${p.role}`, 0.42, dt)) shoot.one(sim, at.x, at.y + 6, shoot.aim(sim, at.x, at.y), 165, B.needle);
            if (active && every(sim, b, `f${p.role}`, 1.1, dt, 0.5)) shoot.fan(sim, at.x, at.y + 6, shoot.aim(sim, at.x, at.y), 5, 56, 110, B.pink);
        }
        if (b.phase === 0) {
            setVulnerable(sim, b.root, false);
            if (every(sim, b, "mortar", 3.6, dt, 2)) shoot.one(sim, root.x, root.y + 4, shoot.aim(sim, root.x, root.y), 60, B.big, { delay: 1.2, split: 8, speed2: 90 });
            if (turrets.length <= 1 || b.phaseT > 36) {
                changePhase(sim, b, 1, root.x, root.y);
                banner(sim, "HATCH OPEN", "STRIKE THE CORE", "warning", 1.6);
                ring(sim, root.x, root.y, 6, 70, 0.4, 0xff8a86);
                cue(sim, "warning");
            }
            return;
        }
        setVulnerable(sim, b.root, true);
        setFrame(sim, b.root, 0);
        if (b.phaseT < PHASE_PAUSE) return;
        if (b.phase === 1) {
            if (every(sim, b, "rings", 1.4, dt)) {
                const off = (b.clocks.rot = (b.clocks.rot ?? 0) + 0.17);
                shoot.ring(sim, root.x, root.y, 16, 90, B.violet, off);
                shoot.ring(sim, root.x, root.y, 16, 70, B.violet, off + Math.PI / 16);
            }
            if (every(sim, b, "fan", 2.5, dt, 1.2)) shoot.fan(sim, root.x, root.y + 10, shoot.aim(sim, root.x, root.y), 9, 90, 120, B.pink);
            if (hpOf(sim, b.root) < CORE_HP * 0.4) {
                changePhase(sim, b, 2, root.x, root.y);
                banner(sim, "OVERDRIVE", "CANTOR", "warning", 1.2);
                cue(sim, "warning");
            }
            return;
        }
        // Phase 2: falling curtains with a drifting gap, plus aimed orbs.
        if (every(sim, b, "curtain", 0.42, dt)) {
            const gap = FIELD_W / 2 + Math.sin(b.phaseT * 0.8) * 90;
            for (let x = 8; x < FIELD_W; x += 17) {
                if (Math.abs(x - gap) < 30) continue;
                if (Math.abs(x - sim.px) < 30 && Math.abs(root.y + 30 - sim.py) < 40) continue; // never on top of the ship
                shoot.one(sim, x, root.y + 30, 0, 105, B.pink);
            }
        }
        if (every(sim, b, "orb", 2.8, dt, 1)) shoot.one(sim, root.x, root.y, shoot.aim(sim, root.x, root.y), 75, B.big, { delay: 0.9, split: 12, speed2: 100 });
    },
};
