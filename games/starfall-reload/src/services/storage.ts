/** Browser persistence, namespaced for the shared GitHub Pages origin. Every access is guarded. */
const KEYS = { scores: "starfall-reload.scores", settings: "starfall-reload.settings" } as const;

export interface ScoreEntry {
    name: string;
    score: number;
    area: number;
}

export interface Settings {
    muted: boolean;
    crt: boolean;
    calm: boolean;
}

export const DEFAULT_SCORES: readonly ScoreEntry[] = [
    { name: "RYU", score: 800_000, area: 3 },
    { name: "KAI", score: 600_000, area: 3 },
    { name: "VEX", score: 450_000, area: 3 },
    { name: "NOA", score: 320_000, area: 2 },
    { name: "ZED", score: 240_000, area: 2 },
    { name: "IKO", score: 160_000, area: 2 },
    { name: "SOL", score: 110_000, area: 1 },
    { name: "MIR", score: 80_000, area: 1 },
    { name: "JUN", score: 50_000, area: 1 },
    { name: "REL", score: 30_000, area: 1 },
];

const store = (): Storage | null => {
    try {
        return typeof localStorage === "undefined" ? null : localStorage;
    } catch {
        return null;
    }
};

export function loadScores(): ScoreEntry[] {
    try {
        const raw = store()?.getItem(KEYS.scores);
        if (!raw) return DEFAULT_SCORES.map((s) => ({ ...s }));
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error("bad scores");
        const list = parsed
            .filter((e): e is ScoreEntry => !!e && typeof e.name === "string" && Number.isFinite(e.score))
            .map((e) => ({ name: e.name.slice(0, 3).toUpperCase(), score: Math.max(0, Math.floor(e.score)), area: Number(e.area) || 1 }));
        return sortScores(list).slice(0, 10);
    } catch {
        return DEFAULT_SCORES.map((s) => ({ ...s }));
    }
}

export function saveScores(scores: readonly ScoreEntry[]): void {
    try {
        store()?.setItem(KEYS.scores, JSON.stringify(scores.slice(0, 10)));
    } catch {
        /* storage full or blocked: scores stay in memory */
    }
}

export function loadSettings(): Settings {
    const fallback: Settings = { muted: false, crt: true, calm: false };
    try {
        const raw = store()?.getItem(KEYS.settings);
        if (!raw) return fallback;
        const p = JSON.parse(raw) as Partial<Settings>;
        return { muted: p.muted === true, crt: p.crt !== false, calm: p.calm === true };
    } catch {
        return fallback;
    }
}

export function saveSettings(settings: Settings): void {
    try {
        store()?.setItem(KEYS.settings, JSON.stringify(settings));
    } catch {
        /* ignore */
    }
}

export const sortScores = (list: ScoreEntry[]): ScoreEntry[] => list.sort((a, b) => b.score - a.score);

/** Index the score would take in the table, or -1 if it does not qualify. */
export function placeFor(scores: readonly ScoreEntry[], score: number): number {
    if (score <= 0) return -1;
    const index = scores.findIndex((s) => score > s.score);
    if (index >= 0) return index;
    return scores.length < 10 ? scores.length : -1;
}

export function insertScore(scores: readonly ScoreEntry[], entry: ScoreEntry): ScoreEntry[] {
    return sortScores([...scores, entry]).slice(0, 10);
}
