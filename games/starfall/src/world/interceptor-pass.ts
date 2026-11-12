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

const CROSS_SPEED = 182,
    CROSS_TIME = 3.15,
    TURN_RADIUS = 45,
    RETURN_ANGLE = (17 * Math.PI) / 180,
    TURN_ANGLE = Math.PI - RETURN_ANGLE,
    RETURN_AT = CROSS_TIME + (TURN_RADIUS * TURN_ANGLE) / CROSS_SPEED;

export const INTERCEPTOR_RETURN = {
    returnAt: RETURN_AT,
    fireAt: RETURN_AT + 0.57,
    cue: 0.55,
    heading: RETURN_ANGLE,
    shotSpeed: 205,
} as const;

const SPLIT_SPEED = 108,
    SPLIT_STRAIGHT_TIME = 0.92,
    SPLIT_TURN_RADIUS = 162,
    SPLIT_EXIT_TIME = SPLIT_STRAIGHT_TIME + ((Math.PI / 2) * SPLIT_TURN_RADIUS) / SPLIT_SPEED;

export const INTERCEPTOR_SPLIT = {
    fireAt: 2.15,
    cue: 0.65,
    shotSpeed: 155,
} as const;

export const InterceptorPattern = {
    Aimed: 0,
    Quiet: 1,
    FromLeft: 2,
    FromRight: 3,
    ForwardFromLeft: 4,
    ForwardFromRight: 5,
    RippleFromRight: 6,
    CrossAndReturn: 7,
    SplitLeft: 8,
    SplitRight: 9,
} as const;

export function interceptorSplitDirection(pattern: number): number {
    if (pattern === InterceptorPattern.SplitLeft) return -1;
    if (pattern === InterceptorPattern.SplitRight) return 1;
    return 0;
}

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

/** Offsets from the entry point. The circular hook is tangent to both straight legs. */
export function interceptorReturnPass(age: number) {
    if (age <= CROSS_TIME) return { x: -CROSS_SPEED * age, y: 0, rotation: Math.PI / 2 };
    const turn = Math.min(TURN_ANGLE, ((age - CROSS_TIME) * CROSS_SPEED) / TURN_RADIUS),
        distance = Math.max(0, age - RETURN_AT) * CROSS_SPEED;
    return {
        x:
            -CROSS_SPEED * CROSS_TIME -
            TURN_RADIUS * Math.sin(turn) +
            distance * Math.cos(RETURN_ANGLE),
        y: TURN_RADIUS * (1 - Math.cos(turn)) + distance * Math.sin(RETURN_ANGLE),
        rotation: Math.PI / 2 - turn,
    };
}

/** Enter nose-down, then bank outward continuously until the nose is parallel to the exit. */
export function interceptorSplitDive(age: number, direction: number) {
    const turn = Math.min(
        Math.PI / 2,
        (Math.max(0, age - SPLIT_STRAIGHT_TIME) * SPLIT_SPEED) / SPLIT_TURN_RADIUS,
    );
    const exitAge = Math.max(0, age - SPLIT_EXIT_TIME);
    return {
        x:
            direction *
            (SPLIT_TURN_RADIUS * (1 - Math.cos(turn)) + SPLIT_SPEED * exitAge + 55 * exitAge ** 2),
        y: SPLIT_SPEED * Math.min(age, SPLIT_STRAIGHT_TIME) + SPLIT_TURN_RADIUS * Math.sin(turn),
        rotation: -direction * turn,
    };
}
