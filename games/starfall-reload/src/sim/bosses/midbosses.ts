import { B, K } from "../../config/enemies.ts";
import { FIELD_W } from "../../config/view.ts";
import type { BossRuntime, Sim } from "../context.ts";
import { ease, every, hpOf, newBoss, posOf, setVulnerable, shoot, spawnRoot, type BossController } from "./common.ts";

function midboss(
    id: string,
    kind: number,
    name: string,
    hp: number,
    entryY: number,
    fight: (sim: Sim, b: BossRuntime, dt: number, x: number, y: number, rage: boolean) => void,
): BossController {
    return {
        id,
        midboss: true,
        limit: 45,
        core: (b) => b.root,
        entryY,
        music: null,
        spawn(sim) {
            const root = spawnRoot(sim, kind, FIELD_W / 2, -50);
            return newBoss(kind, root, name, true, hp);
        },
        move(sim, b, dt) {
            const p = posOf(sim, b.root)!;
            if (b.entering) return { x: ease(p.x, FIELD_W / 2, 2, dt), y: ease(p.y, entryY, 1.8, dt) + 0.4 };
            return { x: FIELD_W / 2 + Math.sin(b.phaseT * 0.7) * 70, y: entryY + Math.sin(b.phaseT * 1.4) * 8 };
        },
        offset: () => ({ x: 0, y: 0 }),
        health: (sim, b) => hpOf(sim, b.root),
        update(sim, b, dt) {
            setVulnerable(sim, b.root, true);
            const p = posOf(sim, b.root)!;
            fight(sim, b, dt, p.x, p.y, hpOf(sim, b.root) < hp * 0.5);
        },
    };
}

/** LANCER — Area 1 gunship: side-gun bursts and a centre fan; rings when damaged. */
export const lancer = midboss("lancer", K.lancer, "LANCER", 420, 70, (sim, b, dt, x, y, rage) => {
    if (every(sim, b, "side", 1.6, dt, 0.8)) {
        for (const side of [-20, 20]) shoot.fan(sim, x + side, y + 12, shoot.aim(sim, x + side, y), 3, 16, 150, B.needle);
    }
    if (every(sim, b, "fan", 2.4, dt, 1.6)) shoot.fan(sim, x, y + 18, 0, 7, 70, 105, B.orange);
    if (rage && every(sim, b, "ring", 2.0, dt)) shoot.ring(sim, x, y, 12, 80, B.violet, b.t);
});

/** BASTION — Area 2 artillery: splitting mortars from three ports, aimed 5-ways. */
export const bastion = midboss("bastion", K.bastion, "BASTION", 560, 74, (sim, b, dt, x, y, rage) => {
    if (every(sim, b, "mortar", 2.8, dt, 1)) {
        const port = Math.floor(b.t / 2.8) % 3;
        const px = x + (port - 1) * 20;
        shoot.one(sim, px, y + 12, shoot.aim(sim, px, y) + (port - 1) * 0.3, 65, B.big, { delay: 1.1, split: 9, speed2: 85 });
    }
    if (every(sim, b, "aimed", rage ? 0.9 : 1.25, dt, 0.4)) shoot.fan(sim, x, y + 14, shoot.aim(sim, x, y), 5, 36, 125, B.pink);
    if (rage && every(sim, b, "spiral", 0.12, dt)) {
        const a = (b.clocks.spin = (b.clocks.spin ?? 0) + 0.31);
        shoot.one(sim, x, y, a, 85, B.violet);
    }
});

/** LANTERN — Area 3 ring platform: four-arm spiral, needle fans, faster when damaged. */
export const lantern = midboss("lantern", K.lantern, "LANTERN", 680, 80, (sim, b, dt, x, y, rage) => {
    if (every(sim, b, "spiral", rage ? 0.1 : 0.14, dt)) {
        const a = (b.clocks.spin = (b.clocks.spin ?? 0) + 0.12);
        for (let i = 0; i < 4; i++) shoot.one(sim, x, y, a + (i * Math.PI) / 2, 80, B.violet);
    }
    if (every(sim, b, "needles", 2.0, dt, 1)) shoot.fan(sim, x, y + 16, shoot.aim(sim, x, y), 5, 40, 165, B.needle);
    if (rage && every(sim, b, "seek", 3.0, dt)) {
        for (let i = 0; i < 8; i++) shoot.one(sim, x, y, (i / 8) * Math.PI * 2, 50, B.gold, { delay: 0.7, speed2: 150 });
    }
});
