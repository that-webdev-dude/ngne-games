import { lerp } from "@ngne/core";
import { Enemy, Pose } from "../components/combat.ts";
import { drawAttackCue, hitColor } from "../bosses/boss.ts";
import { Kind } from "../config/enemies.ts";
import { LAYER } from "../config/layers.ts";
import { rev01Sprite, type NativeSprite } from "../services/rev01-assets.ts";
import { ENEMY_MUZZLES, interceptorMuzzle } from "../systems/combat-enemies.ts";
import { PRESENTATION } from "../ui/presentation.ts";
import { drawNative } from "../ui/sprite.ts";
import {
    InterceptorPattern,
    interceptorPass,
    interceptorPassAge,
    interceptorPassDirection,
    interceptorReturnPass,
} from "../world/interceptor-pass.ts";
import { ORDINARY_SPRITES, ordinaryFrame } from "./enemy-frames.ts";
import type { RenderPassFactory } from "./pass.ts";
import { drawMine } from "./player-fx.ts";

const TOP_HUD_END = PRESENTATION.bands.top.rows[1] + 1;

/**
 * Ordinary enemies as native rev01 frames (spec pivot, one texel per pixel), mines through the player-fx `drawMine`, then the
 * boss's own render (hull, parts, husks, telegraphs, defeat). Boss and part kinds are drawn only by their boss.
 */
export const createEnemyRender: RenderPassFactory = ({ scene, run, session, boss }) => {
    const enemies = scene.world.query(Pose, Enemy);
    const sprites = new Map<number, NativeSprite>(
        Object.entries(ORDINARY_SPRITES).map(([kind, id]) => [Number(kind), rev01Sprite(id!)]),
    );
    return (frame, alpha, legacy) => {
        const reduced = session.settings.reducedMotion;
        enemies.eachChunk((chunk) => {
            const p = chunk.views.pose,
                e = chunk.views.enemy;
            for (let row = 0; row < chunk.count; row++) {
                if (!e.active[row]) continue;
                const x = lerp(p.px[row], p.x[row], alpha),
                    y = lerp(p.py[row], p.y[row], alpha),
                    kind = e.kind[row];
                // Native frame and legacy wrapper both pass through: the player-fx native mine quads must not go through legacy rounding.
                if (kind === Kind.Mine) {
                    drawMine(frame, legacy, x, y, Boolean(e.cue[row]), run.effectClock);
                    continue;
                }
                const sprite = sprites.get(kind);
                if (!sprite) continue;
                const name = ordinaryFrame(
                    kind,
                    {
                        age: e.age[row],
                        cue: e.cue[row],
                        cooldown: e.cooldown[row],
                        fireIndex: e.fireIndex[row],
                    },
                    reduced,
                );
                let bank = 0;
                if (kind === Kind.Interceptor) {
                    const pattern = e.pattern[row],
                        age = e.age[row],
                        direction = interceptorPassDirection(pattern);
                    if (pattern === InterceptorPattern.CrossAndReturn)
                        bank = interceptorReturnPass(age).rotation;
                    else if (direction)
                        bank = interceptorPass(
                            interceptorPassAge(age, pattern),
                            direction,
                        ).rotation;
                }
                const art = sprite.frame(name);
                drawNative(frame, art, x, y, {
                    layer: LAYER.enemy,
                    color: hitColor(e.flash[row], reduced),
                    bank,
                });
                // The interceptor's aim telegraph has no frame in the art: keep the code cue, now at its spec muzzle.
                if (kind === Kind.Interceptor && e.cue[row]) {
                    const [mx, my] = interceptorMuzzle(bank);
                    drawAttackCue(
                        legacy,
                        (bank ? Math.floor(x) : x) + mx,
                        (bank ? Math.floor(y) : y) + my,
                        run.effectClock,
                        reduced,
                    );
                }
                // The first vent cue can start behind the top HUD while the barrels are already visible.
                if (
                    kind === Kind.Gunship &&
                    run.stageIndex === 0 &&
                    e.cue[row] &&
                    e.fireIndex[row] === 0 &&
                    Math.floor(y) - art.pivotY < TOP_HUD_END
                ) {
                    for (const [mx, my] of ENEMY_MUZZLES.gunship)
                        drawAttackCue(
                            legacy,
                            Math.floor(x) + mx,
                            Math.floor(y) + my,
                            run.effectClock,
                            reduced,
                        );
                }
            }
        });
        boss.render(frame, alpha, legacy);
    };
};
