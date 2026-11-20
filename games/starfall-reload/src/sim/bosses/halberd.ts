import { B, K } from "../../config/enemies.ts";
import { FIELD_W } from "../../config/view.ts";
import { banner, cue, type BossRuntime, type Sim } from "../context.ts";
import { ring } from "../effects.ts";
import { PHASE_PAUSE, alive, changePhase, ease, holdHp, every, hpOf, newBoss, posOf, setFrame, setVulnerable, shoot, spawnPart, spawnRoot, type BossController } from "./common.ts";

/**
 * HALBERD — Area 1 boss. A flying wing whose two gun pods shield the nose core.
 * Phase 0: pods fight, core armoured. Phase 1: core exposed, spiral + needle bursts.
 * Phase 2 (< 35 % core): desperation spirals and splitting orbs.
 */
const POD_L = 1,
    POD_R = 2;
const POD_X = 52,
    POD_Y = 6;
const NOSE_Y = 26;

export const halberd: BossController = {
    id: "halberd",
    midboss: false,
    entryY: 72,
    music: "boss",
    limit: 100,
    core: (b) => b.root,
    spawn(sim: Sim): BossRuntime {
        const root = spawnRoot(sim, K.halberd, FIELD_W / 2, -70);
        const b = newBoss(K.halberd, root, "HALBERD", false, 950);
        spawnPart(sim, b, K.halberdPod, POD_L, FIELD_W / 2 - POD_X, -70 + POD_Y);
        spawnPart(sim, b, K.halberdPod, POD_R, FIELD_W / 2 + POD_X, -70 + POD_Y);
        return b;
    },
    move(sim, b, dt) {
        const p = posOf(sim, b.root)!;
        if (b.entering) return { x: ease(p.x, FIELD_W / 2, 2, dt), y: ease(p.y, this.entryY, 2.4, dt) + 0.4 };
        const sway = b.phase === 0 ? 38 : 56;
        const speed = b.phase === 2 ? 0.75 : 0.5;
        return { x: FIELD_W / 2 + Math.sin(b.phaseT * speed + b.phase) * sway, y: this.entryY + Math.sin(b.t * 1.3) * 5 };
    },
    offset(role) {
        return role === POD_L ? { x: -POD_X, y: POD_Y } : { x: POD_X, y: POD_Y };
    },
    health(sim, b) {
        return hpOf(sim, b.root);
    },
    update(sim, b, dt) {
        const root = posOf(sim, b.root)!;
        const noseX = root.x,
            noseY = root.y + NOSE_Y;
        const pods = b.parts.filter((p) => alive(sim, p.entity));
        for (const p of b.parts) {
            if (!alive(sim, p.entity)) continue;
            setVulnerable(sim, p.entity, true);
            setFrame(sim, p.entity, hpOf(sim, p.entity) < 95 ? 1 : 0);
        }
        if (b.phase === 1 && b.phaseT < 5) holdHp(sim, b.root, 950, 0.35);
        if (b.phase === 0) {
            setVulnerable(sim, b.root, false);
            if (every(sim, b, "pods", 1.5, dt, 0.6)) {
                const flip = (b.clocks.podSide = (b.clocks.podSide ?? 0) + 1) % 2;
                for (const p of pods) {
                    if (pods.length === 2 && (p.role === POD_L ? 0 : 1) !== flip) continue;
                    const at = posOf(sim, p.entity);
                    if (!at) continue;
                    shoot.fan(sim, at.x, at.y + 10, shoot.aim(sim, at.x, at.y), 3, 26, 125, B.pink);
                }
            }
            if (every(sim, b, "nose", 2.8, dt, 1.2)) shoot.ring(sim, noseX, noseY, 14, 82, B.orange, b.t * 0.7);
            if (every(sim, b, "sweep", 4.6, dt, 3)) shoot.fan(sim, noseX, noseY, 0, 7, 80, 150, B.needle);
            if (pods.length === 0 || b.phaseT > 34) {
                changePhase(sim, b, 1, noseX, noseY);
                setVulnerable(sim, b.root, true);
                banner(sim, "CORE EXPOSED", "AIM FOR THE NOSE", "warning", 1.6);
                ring(sim, noseX, noseY, 6, 60, 0.4, 0xff8a86);
                cue(sim, "warning");
            }
            return;
        }
        setVulnerable(sim, b.root, true);
        if (b.phaseT < PHASE_PAUSE) return;
        if (b.phase === 1) {
            if (every(sim, b, "spiral", 0.11, dt)) {
                const a = (b.clocks.spin = (b.clocks.spin ?? 0) + 0.23);
                shoot.one(sim, noseX, noseY, a, 95, B.violet);
                shoot.one(sim, noseX, noseY, a + Math.PI, 95, B.violet);
            }
            if (every(sim, b, "needles", 1.8, dt, 1)) shoot.fan(sim, noseX, noseY, shoot.aim(sim, noseX, noseY), 5, 12, 175, B.needle);
            if (pods.length > 0 && every(sim, b, "pods", 2.2, dt)) {
                for (const p of pods) {
                    const at = posOf(sim, p.entity);
                    if (at) shoot.fan(sim, at.x, at.y + 10, shoot.aim(sim, at.x, at.y), 3, 30, 120, B.pink);
                }
            }
            if (hpOf(sim, b.root) < 950 * 0.35) {
                changePhase(sim, b, 2, noseX, noseY);
                banner(sim, "DESPERATION", "HALBERD", "warning", 1.2);
                cue(sim, "warning");
            }
            return;
        }
        // Phase 2: alternating triple spiral and splitting orbs.
        if (every(sim, b, "spiral", 0.085, dt)) {
            const dir = Math.floor(b.phaseT / 3) % 2 === 0 ? 1 : -1;
            const a = (b.clocks.spin = (b.clocks.spin ?? 0) + 0.19 * dir);
            for (let i = 0; i < 3; i++) shoot.one(sim, noseX, noseY, a + (i * Math.PI * 2) / 3, 100, B.pink);
        }
        if (every(sim, b, "orb", 2.3, dt, 1)) shoot.one(sim, noseX, noseY, shoot.aim(sim, noseX, noseY), 70, B.big, { delay: 1.0, split: 10, speed2: 95 });
    },
};
