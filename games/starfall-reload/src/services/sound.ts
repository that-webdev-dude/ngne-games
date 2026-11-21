import type { Audio } from "@ngne/core";
import { MUSIC_IDS, SFX_IDS, renderSfx, type MusicId, type Rendered, type SfxId } from "../audio/synth.ts";

type Scope = ReturnType<Audio["scene"]>;
/**
 * What the game mode means for music: `paused` silences it; `pausable` (play that auto-pauses when
 * the tab is hidden) silences it while the tab is hidden; `none` leaves it alone.
 */
export type MusicPause = "paused" | "pausable" | "none";

const SAMPLE_RATE = 44100;
const MUSIC_VOLUME = 0.42;
const SFX_VOLUME = 0.85;
/** Music fades (seconds) on silencing and restoring; the track keeps running underneath. */
const PAUSE_FADE_OUT = 0.15;
const PAUSE_FADE_IN = 0.4;
/** Minimum spacing between repeats of rapid cues (seconds) so the mix never smears. */
const THROTTLE: Partial<Record<SfxId, number>> = {
    shot: 0.06,
    laser: 0.05,
    halo: 0.08,
    scatter: 0.1,
    enemyShot: 0.07,
    hit: 0.04,
    graze: 0.035,
    explodeS: 0.04,
    chip: 0.03,
};
/** Per-cue playback-rate jitter for frequent sounds (keeps repetition from sounding mechanical). */
const JITTER: Partial<Record<SfxId, number>> = { shot: 0.03, hit: 0.05, enemyShot: 0.04, graze: 0.06, explodeS: 0.06, explodeM: 0.04 };

function toBuffer(r: Pick<Rendered, "sampleRate" | "channels">): AudioBuffer {
    const buffer = new AudioBuffer({ length: r.channels[0]!.length, numberOfChannels: r.channels.length, sampleRate: r.sampleRate });
    r.channels.forEach((c, i) => buffer.copyToChannel(c as Float32Array<ArrayBuffer>, i));
    return buffer;
}

/**
 * Audio bridge between simulation cues and NGNE audio scopes. SFX are synthesised at boot;
 * music is rendered in a worker (title first) and started when ready.
 */
export class Sound {
    private readonly sfx = new Map<SfxId, AudioBuffer>();
    private readonly music = new Map<MusicId, { buffer: AudioBuffer; loop: boolean }>();
    private readonly last = new Map<SfxId, number>();
    private sfxScope: Scope | null = null;
    private musicScope: Scope | null = null;
    private wanted: MusicId | null = null;
    private playing: MusicId | null = null;
    private pause: MusicPause = "none";
    private silenced = false;
    private counter = 0;
    private clock = 0;
    private readonly audio: Audio;

    constructor(audio: Audio) {
        this.audio = audio;
        document.addEventListener("visibilitychange", this.onVisibility);
        for (const id of SFX_IDS) this.sfx.set(id, toBuffer(renderSfx(id, SAMPLE_RATE)));
        try {
            const worker = new Worker(new URL("../audio/music-worker.ts", import.meta.url), { type: "module" });
            worker.onmessage = (event: MessageEvent<{ id: MusicId; sampleRate: number; loop: boolean; channels: Float32Array[] }>) => {
                const d = event.data;
                this.music.set(d.id, { buffer: toBuffer(d), loop: d.loop });
                if (this.wanted === d.id && this.playing !== d.id) this.startMusic(d.id);
            };
            const order: MusicId[] = ["title", "area1", "boss", "clear", "gameOver", "area2", "area3", "finalBoss"];
            worker.postMessage({ order: order.filter((id) => MUSIC_IDS.includes(id)), sampleRate: SAMPLE_RATE });
        } catch (error) {
            console.warn("Starfall Reload: music worker unavailable", error);
        }
    }

    /** Called from a simulation system once per tick with that tick's requests and music pause state. */
    update(dt: number, cues: readonly SfxId[], music: MusicId | "stop" | null, pause: MusicPause): void {
        this.clock += dt;
        // Settle the state first: a track requested on the tick that leaves pause starts at full volume.
        const wasSilenced = this.silenced;
        this.pause = pause;
        this.silenced = this.shouldSilence();
        this.sfxScope ??= this.audio.scene("starfall-reload-sfx");
        for (const id of cues) {
            const gap = THROTTLE[id] ?? 0;
            const last = this.last.get(id) ?? -1;
            if (this.clock - last < gap) continue;
            this.last.set(id, this.clock);
            const buffer = this.sfx.get(id);
            if (!buffer) continue;
            const jitter = JITTER[id] ?? 0;
            this.sfxScope.play({ buffer, volume: SFX_VOLUME, rate: 1 + (Math.random() * 2 - 1) * jitter });
        }
        if (music === "stop") {
            this.wanted = null;
            this.stopMusic(0.6);
        } else if (music && music !== this.wanted) {
            this.wanted = music;
            if (this.music.has(music)) this.startMusic(music);
            else this.stopMusic(0.4);
        }
        if (this.silenced !== wasSilenced) this.fadeMusic();
    }

    /**
     * Frames stop while the tab is hidden, so play silences here instead of waiting for the auto-pause
     * tick. Showing the tab restores nothing: the next tick pauses and the resume fade brings it back.
     */
    private readonly onVisibility = (): void => {
        if (!document.hidden || this.silenced || !this.shouldSilence()) return;
        this.silenced = true;
        this.fadeMusic();
    };

    private shouldSilence(): boolean {
        return this.pause === "paused" || (this.pause === "pausable" && document.hidden);
    }

    private fadeMusic(): void {
        this.musicScope?.fadeTo(this.silenced ? 0 : 1, this.silenced ? PAUSE_FADE_OUT : PAUSE_FADE_IN);
    }

    private startMusic(id: MusicId): void {
        const track = this.music.get(id);
        if (!track) return;
        this.stopMusic(0.35);
        const scope = this.audio.scene(`starfall-reload-music-${++this.counter}`);
        // A track that starts while silenced stays silent until the resume fade.
        if (this.silenced) scope.volume(0);
        scope.play({ buffer: track.buffer, loop: track.loop, volume: MUSIC_VOLUME });
        this.musicScope = scope;
        this.playing = id;
    }

    private stopMusic(fade: number): void {
        const old = this.musicScope;
        this.musicScope = null;
        this.playing = null;
        if (!old) return;
        old.fadeTo(0, fade);
        setTimeout(() => old.dispose(), fade * 1000 + 100);
    }

    dispose(): void {
        document.removeEventListener("visibilitychange", this.onVisibility);
        this.stopMusic(0.01);
        this.sfxScope?.dispose();
        this.sfxScope = null;
    }
}
