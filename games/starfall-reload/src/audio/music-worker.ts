import { MUSIC_IDS, renderMusic, type MusicId } from "./synth.ts";

/** Renders music tracks off the main thread, in the order requested, and transfers the samples. */
interface WorkerScope {
    onmessage: ((event: MessageEvent<{ order: MusicId[]; sampleRate: number }>) => void) | null;
    postMessage(message: unknown, transfer: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;
const queue: MusicId[] = [];
let busy = false;

scope.onmessage = (event) => {
    for (const id of event.data.order) if (MUSIC_IDS.includes(id) && !queue.includes(id)) queue.push(id);
    if (!busy) void drain(event.data.sampleRate);
};

async function drain(sampleRate: number): Promise<void> {
    busy = true;
    while (queue.length) {
        const id = queue.shift()!;
        const r = renderMusic(id, sampleRate);
        scope.postMessage({ id, sampleRate: r.sampleRate, loop: r.loop, channels: r.channels }, r.channels.map((c) => c.buffer as ArrayBuffer));
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    busy = false;
}
