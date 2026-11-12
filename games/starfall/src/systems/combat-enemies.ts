import { Enemy, Pose } from "../components/combat.ts";
import { specSocket, splitVolley } from "../bosses/sockets.ts";
import { COMBAT } from "../config/encounters.ts";
import { Kind } from "../config/enemies.ts";
import { VIEW, fromLegacy as w } from "../config/view.ts";
import { spawnEnemy, spawnRepair } from "../entities/combat.ts";
import {
    INTERCEPTOR_PASS,
    INTERCEPTOR_RETURN,
    INTERCEPTOR_RIPPLE,
    INTERCEPTOR_SPLIT,
    InterceptorPattern,
    interceptorPass,
    interceptorPassAge,
    interceptorPassDirection,
    interceptorReturnPass,
    interceptorSplitDirection,
    interceptorSplitDive,
} from "../world/interceptor-pass.ts";
import { fan } from "../world/patterns.ts";
import type { CombatContext } from "./combat-context.ts";

/** World px added to the interceptor y exit so floating-point ties at the 300 legacy-px boundary match main's exit tick. */
export const INTERCEPTOR_EXIT_TOLERANCE = 1e-6;

/** Fire timing (seconds, unchanged): cue = telegraph lead before the shot, reload = cooldown after it. Shared with the renderer. */
export const INTERCEPTOR_TIMING = { cue: 0.35 } as const;
export const GUNSHIP_TIMING = { cue: 0.45, reload: 2.4 } as const;
export const SWEEPER_TIMING = { reload: 0.7 } as const;

/** Shot origins from the native spec muzzles (offsets from the pivot, 640x360 px). */
export const ENEMY_MUZZLES = {
    interceptor: specSocket("interceptor", "muzzle"),
    dart: specSocket("dart", "muzzle"),
    gunship: [specSocket("gunship", "leftMuzzle"), specSocket("gunship", "rightMuzzle")],
} as const;

export function interceptorMuzzle(rotation: number) {
    const [x, y] = ENEMY_MUZZLES.interceptor,
        cos = Math.cos(rotation),
        sin = Math.sin(rotation);
    return [x * cos - y * sin, x * sin + y * cos] as const;
}

export function installCombatEnemies({
    scene,
    run,
    sound,
    stage,
    hostiles,
    boss,
}: CombatContext): void {
    const enemies = scene.world.query(Pose, Enemy),
        { emit } = hostiles;
    function spawnInterceptors(count: number, x: number, pattern: number) {
        const banking = interceptorPassDirection(pattern) !== 0,
            returning = pattern === InterceptorPattern.CrossAndReturn,
            ripple = pattern === InterceptorPattern.RippleFromRight;
        for (let i = 0; i < count; i++) {
            const slot = i - (count - 1) / 2,
                delay = ripple ? i * INTERCEPTOR_RIPPLE.delay : 0;
            let cooldown = 1.8 + i * 0.13;
            if (banking) cooldown = INTERCEPTOR_PASS.fireAt;
            if (ripple) cooldown = INTERCEPTOR_PASS.fireAt / INTERCEPTOR_RIPPLE.speed + delay;
            if (returning) cooldown = INTERCEPTOR_RETURN.fireAt;
            spawnEnemy(
                scene.world,
                run,
                Kind.Interceptor,
                x + slot * (returning ? 32 : w(27)),
                returning
                    ? 59 - slot * 6
                    : w(-22) - (ripple ? i * INTERCEPTOR_RIPPLE.spacingY : Math.abs(slot) * w(14)),
                { pattern, cooldown, age: -delay },
            );
        }
    }
    let warning = false;
    scene.system(({ dt }) => {
        if (run.phase === "dead" || run.phase === "clear") return;
        if (run.seconds >= stage.bossAt - 4 && !warning) {
            warning = true;
            run.banner = `WARNING / ${stage.boss.name}`;
            run.bannerTime = 4;
            run.bannerKind = "sector";
            hostiles.clear({ enemies: true });
            run.waveIndex = stage.encounters.length;
        }
        if (run.phase === "waves" && run.seconds >= stage.bossAt) {
            run.phase = "boss";
            run.bossHealth = run.bossMax = stage.boss.hp;
            run.banner = stage.boss.name;
            run.bannerTime = 3;
            run.bannerKind = "sector";
            sound.boss();
            boss.spawn();
        }
        while (
            run.waveIndex < stage.encounters.length &&
            stage.encounters[run.waveIndex].at <= run.seconds
        ) {
            const event = stage.encounters[run.waveIndex];
            if (enemies.size + event.count > COMBAT.enemyCap) break;
            run.waveIndex++;
            if (event.kind === "repair") {
                spawnRepair(scene.world, event.side, w(-10));
                continue;
            }
            if (event.kind === "interceptor") {
                if (event.bankFrom === "both") {
                    const leftCount = Math.ceil(event.count / 2);
                    spawnInterceptors(leftCount, event.side, InterceptorPattern.ForwardFromLeft);
                    spawnInterceptors(
                        event.count - leftCount,
                        VIEW.width - event.side,
                        InterceptorPattern.ForwardFromRight,
                    );
                } else if (event.bankFrom === "split-dive") {
                    for (let i = 0; i < event.count; i++) {
                        const wing = i % 2 ? 1 : -1,
                            rank = Math.floor(i / 2);
                        spawnEnemy(
                            scene.world,
                            run,
                            Kind.Interceptor,
                            event.side + wing * (13 + rank * 9),
                            -26 - rank * 18,
                            {
                                pattern:
                                    wing < 0
                                        ? InterceptorPattern.SplitLeft
                                        : InterceptorPattern.SplitRight,
                                cooldown: INTERCEPTOR_SPLIT.fireAt,
                            },
                        );
                    }
                } else {
                    const pattern = event.bankFrom
                        ? {
                              left: InterceptorPattern.FromLeft,
                              right: InterceptorPattern.FromRight,
                              "right-ripple": InterceptorPattern.RippleFromRight,
                              "right-return": InterceptorPattern.CrossAndReturn,
                          }[event.bankFrom]
                        : InterceptorPattern.Aimed;
                    spawnInterceptors(event.count, event.side, pattern);
                }
                continue;
            }
            for (let i = 0; i < event.count; i++) {
                if (event.kind === "gunship")
                    spawnEnemy(scene.world, run, Kind.Gunship, event.side, w(-25), {
                        cooldown: event.firstVolley,
                    });
                if (event.kind === "sweeper")
                    spawnEnemy(
                        scene.world,
                        run,
                        Kind.Sweeper,
                        event.side ? w(505) + i * w(40) : w(-25) - i * w(40),
                        (event.laneY ?? w(92)) + i * w(46),
                        { vx: event.side ? -w(65) : w(65), cooldown: 0.8 + i * 0.3 },
                    );
                if (event.kind === "minelayer" || event.kind === "warden")
                    spawnEnemy(
                        scene.world,
                        run,
                        event.kind === "minelayer" ? Kind.Minelayer : Kind.Warden,
                        event.side + i * w(50),
                        w(-24),
                        { cooldown: 2.7 + i * 0.4 },
                    );
            }
        }
        enemies.eachChunk((chunk) => {
            const p = chunk.views.pose,
                e = chunk.views.enemy;
            for (let row = 0; row < chunk.count; row++) {
                if (!e.active[row] || e.hp[row] <= 0) continue;
                p.px[row] = p.x[row];
                p.py[row] = p.y[row];
                e.age[row] += dt;
                e.flash[row] = Math.max(0, e.flash[row] - dt);
                const kind = e.kind[row],
                    age = e.age[row];
                if (kind === Kind.Interceptor) {
                    const pattern = e.pattern[row],
                        returning = pattern === InterceptorPattern.CrossAndReturn,
                        split = interceptorSplitDirection(pattern),
                        direction = interceptorPassDirection(pattern),
                        passAge = interceptorPassAge(age, pattern);
                    if (direction && passAge >= INTERCEPTOR_PASS.exitAt) {
                        e.active[row] = 0;
                        scene.world.despawn(chunk.entityAt(row));
                        continue;
                    }
                    const bank = direction ? interceptorPass(passAge, direction) : undefined;
                    let rotation = bank?.rotation ?? 0;
                    if (returning || split) {
                        const path = returning ? interceptorReturnPass : interceptorSplitDive;
                        const pass = path(age, split);
                        p.x[row] = e.originX[row] + pass.x;
                        p.y[row] += pass.y - path(age - dt, split).y;
                        rotation = pass.rotation;
                        const pastLeft = split < 0 && p.x[row] < -24,
                            pastRight =
                                (split > 0 || (returning && age >= INTERCEPTOR_RETURN.returnAt)) &&
                                p.x[row] > VIEW.width + 24;
                        if (pastLeft || pastRight) {
                            e.active[row] = 0;
                            scene.world.despawn(chunk.entityAt(row));
                            continue;
                        }
                    } else {
                        const travelTime =
                            pattern === InterceptorPattern.RippleFromRight
                                ? Math.min(dt, Math.max(0, age)) * INTERCEPTOR_RIPPLE.speed
                                : dt;
                        p.x[row] = e.originX[row] + (bank?.x ?? Math.sin(age * 1.6) * w(19));
                        p.y[row] += travelTime * (bank ? INTERCEPTOR_PASS.descent : w(40));
                    }
                    if (returning || split || bank || pattern === InterceptorPattern.Aimed) {
                        const cueLead = returning
                            ? INTERCEPTOR_RETURN.cue
                            : split
                              ? INTERCEPTOR_SPLIT.cue
                              : bank
                                ? INTERCEPTOR_PASS.cue
                                : INTERCEPTOR_TIMING.cue;
                        // The clock keeps running after the single shot (fireIndex 1) so the renderer can time the fire frame.
                        e.cooldown[row] -= dt;
                        if (e.fireIndex[row] === 0) {
                            if (e.cooldown[row] < cueLead && !e.cue[row]) {
                                e.cue[row] = 1;
                                if (!split) {
                                    const forward =
                                        pattern === InterceptorPattern.ForwardFromLeft ||
                                        pattern === InterceptorPattern.ForwardFromRight ||
                                        pattern === InterceptorPattern.RippleFromRight;
                                    e.targetAngle[row] = returning
                                        ? INTERCEPTOR_RETURN.heading
                                        : forward
                                          ? Math.PI / 2
                                          : Math.atan2(run.y - p.y[row], run.x - p.x[row]);
                                }
                            }
                            if (e.cooldown[row] <= 0) {
                                const [mx, my] = interceptorMuzzle(rotation);
                                emit(
                                    p.x[row] + mx,
                                    p.y[row] + my,
                                    fan(
                                        split ? rotation + Math.PI / 2 : e.targetAngle[row],
                                        1,
                                        0,
                                        returning
                                            ? INTERCEPTOR_RETURN.shotSpeed
                                            : split
                                              ? INTERCEPTOR_SPLIT.shotSpeed
                                              : w(62),
                                    ),
                                    0xff747d,
                                );
                                e.fireIndex[row]++;
                                e.cue[row] = 0;
                            }
                        }
                    }
                    if (returning || split) continue;
                } else if (kind === Kind.Gunship) {
                    p.y[row] += dt * w(p.y[row] < w(67) ? 28 : age > 12 ? 38 : 5);
                    p.x[row] = e.originX[row] + Math.sin(age * 0.8) * w(24);
                    e.cooldown[row] -= dt;
                    if (e.cooldown[row] < GUNSHIP_TIMING.cue && !e.cue[row]) {
                        e.cue[row] = 1;
                        e.targetAngle[row] = Math.atan2(run.y - p.y[row], run.x - p.x[row]);
                    }
                    if (e.cooldown[row] <= 0) {
                        // One 5-shot volley shared by both barrels (no extra shots); fireIndex counts volleys for the fire frame.
                        for (const volley of splitVolley(
                            fan(e.targetAngle[row], 5, (56 * Math.PI) / 180, w(58)),
                            ENEMY_MUZZLES.gunship,
                        ))
                            emit(
                                p.x[row] + volley.origin[0],
                                p.y[row] + volley.origin[1],
                                volley.shots,
                                0xff9b70,
                            );
                        e.cooldown[row] = GUNSHIP_TIMING.reload;
                        e.cue[row] = 0;
                        e.fireIndex[row]++;
                    }
                } else if (kind === Kind.Sweeper) {
                    p.x[row] += e.vx[row] * dt;
                    p.y[row] += Math.sin(age * 3) * dt * w(8);
                    e.cooldown[row] -= dt;
                    if (e.cooldown[row] <= 0) {
                        const fires = Math.hypot(run.x - p.x[row], run.y - p.y[row]) > w(45);
                        if (fires) {
                            const [mx, my] = ENEMY_MUZZLES.dart;
                            emit(
                                p.x[row] + mx,
                                p.y[row] + my,
                                fan(Math.PI / 2, 3, (32 * Math.PI) / 180, w(48)),
                                0xf78caf,
                            );
                        }
                        // The dart has no telegraph; its cue marks whether this reload began with a shot (fire frame), not a skipped one.
                        e.cue[row] = fires ? 1 : 0;
                        e.cooldown[row] = SWEEPER_TIMING.reload;
                    }
                }
                // Interceptor rows land exactly on y 300 (legacy px) at a tick; main's sum sits ~2e-13 below (stays alive),
                // the x4/3 sum ~3e-12 above. The tolerance keeps that tie alive as on main (1e-6 px; steps are 0.67 px).
                const exitY =
                    kind === Kind.Interceptor ? w(300) + INTERCEPTOR_EXIT_TOLERANCE : w(300);
                if (
                    (kind === Kind.Interceptor || kind === Kind.Gunship || kind === Kind.Sweeper) &&
                    (p.y[row] > exitY || p.x[row] < w(-100) || p.x[row] > w(580))
                ) {
                    e.active[row] = 0;
                    scene.world.despawn(chunk.entityAt(row));
                }
            }
        });
    });
}
