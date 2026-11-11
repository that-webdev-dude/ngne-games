export const INTERCEPTOR_PASS = {
    fireAt: 2.6,
    cue: 0.55,
    peelAt: 2.85,
    exitAt: 5.25,
    descent: 64,
} as const;

export const INTERCEPTOR_RIPPLE = {
    spacingY: 6,
    delay: 0.2,
    speed: 1.4,
} as const;

export const InterceptorPattern = {
    Aimed: 0,
    Quiet: 1,
    FromLeft: 2,
    FromRight: 3,
    ForwardFromLeft: 4,
    ForwardFromRight: 5,
    RippleFromRight: 6,
} as const;

export function interceptorPassDirection(pattern: number): number {
    if (pattern === InterceptorPattern.FromLeft || pattern === InterceptorPattern.ForwardFromLeft)
        return 1;
    if (
        pattern === InterceptorPattern.FromRight ||
        pattern === InterceptorPattern.ForwardFromRight ||
        pattern === InterceptorPattern.RippleFromRight
    )
        return -1;
    return 0;
}

export function interceptorPassAge(age: number, pattern: number): number {
    return pattern === InterceptorPattern.RippleFromRight
        ? Math.max(0, age) * INTERCEPTOR_RIPPLE.speed
        : age;
}

/** Horizontal offset in logical pixels and heading relative to the sprite's downward nose. */
export function interceptorPass(age: number, direction: number) {
    const { fireAt, peelAt, exitAt, descent } = INTERCEPTOR_PASS;
    const approach = 220,
        peel = 350;
    let offset = approach,
        vx = 0;
    if (age < fireAt) {
        const arcRate = Math.PI / (2 * fireAt),
            arc = age * arcRate;
        offset = approach * Math.sin(arc);
        vx = approach * arcRate * Math.cos(arc);
    } else if (age > peelAt) {
        const duration = exitAt - peelAt,
            progress = Math.min(1, (age - peelAt) / duration);
        offset -= peel * progress ** 2;
        vx = (-2 * peel * progress) / duration;
    }
    return { x: direction * offset, rotation: Math.atan2(-direction * vx, descent) };
}
