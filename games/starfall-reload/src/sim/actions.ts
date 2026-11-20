import type { InputSnapshot } from "@ngne/core";
import { PLAYER } from "../config/tuning.ts";

/**
 * Logical controls derived from one input snapshot. Keyboard uses event.code names; the
 * standard gamepad mapping arrives as Pad<i> buttons and axes[0..3].
 */
export interface Actions {
    /** Movement vector, each axis in [-1, 1], magnitude ≤ 1. */
    mx: number;
    my: number;
    fire: boolean;
    focus: boolean;
    shiftPressed: boolean;
    bombPressed: boolean;
    pausePressed: boolean;
    confirmPressed: boolean;
    /** Start only (Enter / gamepad Start): spends credits, so fire cannot trigger it. */
    startPressed: boolean;
    backPressed: boolean;
    upPressed: boolean;
    downPressed: boolean;
    leftPressed: boolean;
    rightPressed: boolean;
    anyPressed: boolean;
    mutePressed: boolean;
    crtPressed: boolean;
    pointerPressed: boolean;
    usingPad: boolean;
}

export const BINDINGS = {
    left: ["ArrowLeft", "KeyA", "Pad14"],
    right: ["ArrowRight", "KeyD", "Pad15"],
    up: ["ArrowUp", "KeyW", "Pad12"],
    down: ["ArrowDown", "KeyS", "Pad13"],
    fire: ["KeyZ", "KeyJ", "Space", "Pad0", "Pad7"],
    shift: ["KeyX", "KeyK", "Pad2", "Pad5"],
    bomb: ["KeyC", "KeyL", "Pad1", "Pad3"],
    focus: ["ShiftLeft", "ShiftRight", "Pad4", "Pad6"],
    pause: ["Escape", "KeyP", "Pad9", "Pad8"],
    confirm: ["Enter", "KeyZ", "KeyJ", "Space", "Pad0", "Pad9"],
    start: ["Enter", "Pad9"],
    back: ["Escape", "KeyX", "KeyC", "KeyL", "Backspace", "Pad1"],
    mute: ["KeyM"],
    crt: ["KeyV"],
} as const;

const any = (list: readonly string[], keys: readonly string[]): boolean => {
    for (const key of keys) if (list.includes(key)) return true;
    return false;
};

/** Edge of an analog axis crossing 0.5 counts as a menu press (stick navigation). */
export interface StickMemory {
    x: number;
    y: number;
}

export function readActions(input: InputSnapshot, memory: StickMemory): Actions {
    const held = input.held;
    const pressed = input.pressed;
    let mx = (any(held, BINDINGS.right) ? 1 : 0) - (any(held, BINDINGS.left) ? 1 : 0);
    let my = (any(held, BINDINGS.down) ? 1 : 0) - (any(held, BINDINGS.up) ? 1 : 0);
    const ax = input.axes[0] ?? 0;
    const ay = input.axes[1] ?? 0;
    const stick = Math.hypot(ax, ay);
    let usingPad = held.some((k) => k.startsWith("Pad"));
    if (stick > PLAYER.deadZone) {
        usingPad = true;
        // Rescale so the dead zone edge is 0 and fullTilt is 1, preserving direction.
        const scaled = Math.min(1, (stick - PLAYER.deadZone) / (PLAYER.fullTilt - PLAYER.deadZone));
        mx = (ax / stick) * scaled;
        my = (ay / stick) * scaled;
    } else {
        const length = Math.hypot(mx, my);
        if (length > 1) {
            mx /= length;
            my /= length;
        }
    }
    const stickLeft = ax < -0.5 && memory.x >= -0.5;
    const stickRight = ax > 0.5 && memory.x <= 0.5;
    const stickUp = ay < -0.5 && memory.y >= -0.5;
    const stickDown = ay > 0.5 && memory.y <= 0.5;
    memory.x = ax;
    memory.y = ay;
    const pointerPressed = input.pointer.completed.length > 0;
    return {
        mx,
        my,
        fire: any(held, BINDINGS.fire),
        focus: any(held, BINDINGS.focus),
        shiftPressed: any(pressed, BINDINGS.shift),
        bombPressed: any(pressed, BINDINGS.bomb),
        pausePressed: any(pressed, BINDINGS.pause),
        confirmPressed: any(pressed, BINDINGS.confirm) || pointerPressed,
        startPressed: any(pressed, BINDINGS.start) || pointerPressed,
        backPressed: any(pressed, BINDINGS.back),
        upPressed: any(pressed, BINDINGS.up) || stickUp,
        downPressed: any(pressed, BINDINGS.down) || stickDown,
        leftPressed: any(pressed, BINDINGS.left) || stickLeft,
        rightPressed: any(pressed, BINDINGS.right) || stickRight,
        anyPressed: pressed.length > 0 || pointerPressed,
        mutePressed: any(pressed, BINDINGS.mute),
        crtPressed: any(pressed, BINDINGS.crt),
        pointerPressed,
        usingPad,
    };
}

export const noActions = (): Actions => ({
    mx: 0,
    my: 0,
    fire: false,
    focus: false,
    shiftPressed: false,
    bombPressed: false,
    pausePressed: false,
    confirmPressed: false,
    startPressed: false,
    backPressed: false,
    upPressed: false,
    downPressed: false,
    leftPressed: false,
    rightPressed: false,
    anyPressed: false,
    mutePressed: false,
    crtPressed: false,
    pointerPressed: false,
    usingPad: false,
});

/** Edge-triggered actions that must survive hitstop: merged into the next ordinary tick. */
export function latchEdges(into: Actions, from: Actions): void {
    into.bombPressed ||= from.bombPressed;
    into.shiftPressed ||= from.shiftPressed;
    into.pausePressed ||= from.pausePressed;
    into.confirmPressed ||= from.confirmPressed;
    into.startPressed ||= from.startPressed;
    into.backPressed ||= from.backPressed;
    into.upPressed ||= from.upPressed;
    into.downPressed ||= from.downPressed;
    into.leftPressed ||= from.leftPressed;
    into.rightPressed ||= from.rightPressed;
    into.mutePressed ||= from.mutePressed;
    into.crtPressed ||= from.crtPressed;
}
