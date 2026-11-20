import { VIEW } from "../config/view.ts";

export interface Fit {
    /** Device pixels per logical pixel. */
    scale: number;
    integer: boolean;
    cssWidth: number;
    cssHeight: number;
    cssLeft: number;
    cssTop: number;
}

/**
 * Fills the window with the 640×360 cabinet. Integer scaling is kept whenever it wastes less
 * than 12 % of the screen; otherwise the view is fitted exactly (contract P2).
 */
export function fitView(deviceW: number, deviceH: number, dpr: number): Fit {
    const exact = Math.min(deviceW / VIEW.width, deviceH / VIEW.height);
    const whole = Math.floor(exact);
    const integer = whole >= 1 && whole / exact >= 0.88;
    const scale = integer ? whole : exact;
    const w = Math.round(VIEW.width * scale),
        h = Math.round(VIEW.height * scale);
    return {
        scale,
        integer,
        cssWidth: w / dpr,
        cssHeight: h / dpr,
        cssLeft: Math.floor((deviceW - w) / 2) / dpr,
        cssTop: Math.floor((deviceH - h) / 2) / dpr,
    };
}

/** Sizes the canvas and its CRT overlay to the window; returns an uninstaller. */
export function installDisplay(canvas: HTMLCanvasElement, overlay: HTMLElement): () => void {
    let device: { w: number; h: number } | null = null;
    const apply = () => {
        const dpr = window.devicePixelRatio || 1;
        const w = device?.w ?? Math.round(window.innerWidth * dpr);
        const h = device?.h ?? Math.round(window.innerHeight * dpr);
        const fit = fitView(w, h, dpr);
        for (const el of [canvas, overlay]) {
            el.style.width = `${fit.cssWidth}px`;
            el.style.height = `${fit.cssHeight}px`;
            el.style.left = `${fit.cssLeft}px`;
            el.style.top = `${fit.cssTop}px`;
        }
        // One scanline per logical row.
        overlay.style.setProperty("--row", `${fit.cssHeight / VIEW.height}px`);
        canvas.dataset.scale = fit.scale.toFixed(2);
    };
    const observer = new ResizeObserver((entries) => {
        const box = entries[0]?.devicePixelContentBoxSize?.[0];
        device = box ? { w: box.inlineSize, h: box.blockSize } : null;
        apply();
    });
    try {
        observer.observe(document.body, { box: "device-pixel-content-box" });
    } catch {
        observer.observe(document.body);
    }
    window.addEventListener("resize", apply);
    document.addEventListener("fullscreenchange", apply);
    apply();
    return () => {
        observer.disconnect();
        window.removeEventListener("resize", apply);
        document.removeEventListener("fullscreenchange", apply);
    };
}

export function toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
}
