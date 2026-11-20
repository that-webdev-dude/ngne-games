import "./style.css";
import { BrowserGame } from "@ngne/core";
import { VIEW } from "./config/view.ts";
import { cabinetScene, type CabinetState, type CabinetView } from "./scenes/cabinet.ts";
import { installDisplay, toggleFullscreen } from "./services/display.ts";
import { Sound } from "./services/sound.ts";
import { loadSettings } from "./services/storage.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#game")!;
const crt = document.querySelector<HTMLElement>("#crt")!;
const boot = document.querySelector<HTMLElement>("#boot")!;
const errors = document.querySelector<HTMLPreElement>("#error")!;

function report(error: unknown): void {
    if (!(error instanceof Error)) return;
    errors.hidden = false;
    const detail = error instanceof AggregateError ? `${error.message}\n${error.errors.map(String).join("\n")}` : error.message;
    if (!errors.textContent?.includes(detail)) errors.textContent += `${errors.textContent ? "\n" : ""}${detail}`;
}

const settings = loadSettings();
const view: CabinetView = { flow: null, sim: null };
let lastLabel = 0;
let audioUnlocked = false;
const unlockAudio = () => {
    void app.audio
        .unlock()
        .then(() => (audioUnlocked = true))
        .catch(report);
};
/** Dev-server only: one-shot native 640×360 frame capture (resolved from afterFrame). */
let captureRequest: ((blob: Blob) => void) | null = null;
/** Dev-server only: ?timer=1 drives frames from timers (for hidden automation panes). */
const timerScheduler =
    import.meta.env.DEV && new URLSearchParams(location.search).has("timer")
        ? {
              request: (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16) as unknown as number,
              cancel: (id: number) => window.clearTimeout(id),
          }
        : undefined;
const app = new BrowserGame<CabinetState, never>({
    ...(timerScheduler ? { scheduler: timerScheduler } : {}),
    canvas,
    ...VIEW,
    seed: "STARFALL-RELOAD",
    state: {},
    transition: (state) => state,
    clear: 0x05060c,
    diagnostic: report,
    afterFrame: (stats) => {
        if (captureRequest) {
            const done = captureRequest;
            captureRequest = null;
            const copy = new OffscreenCanvas(VIEW.width, VIEW.height);
            copy.getContext("2d")!.drawImage(canvas, 0, 0);
            void copy.convertToBlob({ type: "image/png" }).then(done);
        }
        app.audio.muted = settings.muted;
        crt.classList.toggle("off", !settings.crt);
        const flow = view.flow,
            sim = view.sim;
        if (!flow || !sim) return;
        flow.audioLocked = !audioUnlocked;
        canvas.dataset.screen = flow.mode;
        if (performance.now() - lastLabel < 250) return;
        lastLabel = performance.now();
        canvas.dataset.fps = String(Math.round(stats.fps));
        canvas.setAttribute(
            "aria-label",
            `Starfall Reload. ${flow.mode}. Area ${sim.area.index + 1}. Score ${sim.run.score}. Ships ${sim.run.lives}. Bombs ${sim.run.bombs}. Power ${sim.run.power}. ` +
                "Move with arrows, WASD or the left stick. Fire Z or gamepad A. Shot control X or gamepad X. Bomb C or gamepad B. Focus Shift or LB. Pause Escape or Start. Fullscreen F.",
        );
    },
});

const sound = new Sound(app.audio);
if (import.meta.env.DEV)
    Object.assign(window, {
        __reload: { view, app, capture: () => new Promise<Blob>((resolve) => (captureRequest = resolve)) },
    });
const releaseDisplay = installDisplay(canvas, crt);

const START_KEYS = new Set(["Enter", "KeyZ", "KeyJ", "Space"]);
const onKey = (event: KeyboardEvent) => {
    unlockAudio();
    if (event.code === "KeyF" && !event.repeat) toggleFullscreen();
    // Starting from the attract screen takes the whole display, like a cabinet.
    if (START_KEYS.has(event.code) && view.flow?.mode === "attract" && !document.fullscreenElement) toggleFullscreen();
};
const onPointer = () => {
    unlockAudio();
    canvas.focus({ preventScroll: true });
    if (view.flow?.mode === "attract" && !document.fullscreenElement) toggleFullscreen();
};
window.addEventListener("keydown", onKey);
canvas.addEventListener("pointerdown", onPointer);
window.addEventListener("focus", () => canvas.focus({ preventScroll: true }));
const autoPause = () => {
    if (view.flow) view.flow.autoPause = true;
};
window.addEventListener("blur", autoPause);
document.addEventListener("visibilitychange", () => document.hidden && autoPause());
window.addEventListener(
    "pagehide",
    () => {
        releaseDisplay();
        window.removeEventListener("keydown", onKey);
        canvas.removeEventListener("pointerdown", onPointer);
        sound.dispose();
        void app.dispose().catch(report);
    },
    { once: true },
);

/** Dev-server only: ?area=1..3&at=SECONDS&power=0..4&weapon=0..3 jumps straight into play. */
function debugStart() {
    if (!import.meta.env.DEV) return null;
    const q = new URLSearchParams(location.search);
    if (!q.has("area")) return null;
    return {
        area: Math.max(0, Math.min(2, Number(q.get("area")) - 1 || 0)),
        at: Number(q.get("at")) || 0,
        power: Math.max(0, Math.min(4, Number(q.get("power") ?? 0) || 0)),
        weapon: Math.max(0, Math.min(3, Number(q.get("weapon") ?? 0) || 0)),
    };
}

try {
    const prepared = await app.game.prepare(cabinetScene({ settings, sound, view, debug: debugStart(), pilot: import.meta.env.DEV && new URLSearchParams(location.search).has("pilot") }), { key: "cabinet" });
    await app.start(prepared);
    canvas.focus({ preventScroll: true });
    boot.classList.add("done");
    setTimeout(() => boot.remove(), 600);
    canvas.dataset.ready = "true";
} catch (error) {
    boot.classList.add("failed");
    report(error);
}
