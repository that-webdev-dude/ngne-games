import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertStarfallCampaign } from "../check-starfall-campaign.mjs";

function successfulReport() {
    return {
        results: [17, 41, 83].map((seed) => ({
            seed,
            outcome: "campaign-clear",
            terminalScreen: "clear",
            stageIndex: 2,
            progress: { runs: 3 },
            diagnostics: [],
            stages: [0, 1, 2].map((stageIndex) => ({
                stageIndex,
                outcome: "clear",
                bossHealth: 0,
            })),
        })),
    };
}

test("accepts three complete campaign clears regardless of seed ordering", () => {
    const report = successfulReport();
    report.results.reverse();
    assert.doesNotThrow(() => assertStarfallCampaign(report));
});

test("rejects a failed campaign even if the bot completed its command successfully", () => {
    const report = successfulReport();
    report.results[1].outcome = "dead";
    assert.throws(() => assertStarfallCampaign(report), /Seed 41 did not clear/);
});

test("rejects missing, duplicate, or unexpected seeds", () => {
    for (const seeds of [[17, 41], [17, 41, 41], [17, 41, 84], []]) {
        const report = successfulReport();
        report.results = seeds.map((seed) => ({ ...report.results[0], seed }));
        assert.throws(() => assertStarfallCampaign(report), /each requested seed exactly once/);
    }
});

test("rejects incomplete sectors, surviving bosses, diagnostics, or invalid terminal state", () => {
    for (const change of [
        (result) => {
            result.stages.pop();
        },
        (result) => {
            result.stages[1].stageIndex = 0;
        },
        (result) => {
            result.stages[1].outcome = "dead";
        },
        (result) => {
            result.stages[2].bossHealth = 1;
        },
        (result) => {
            result.diagnostics.push("unexpected diagnostic");
        },
        (result) => {
            result.terminalScreen = "dead";
        },
        (result) => {
            result.stageIndex = 1;
        },
        (result) => {
            result.progress.runs = 4;
        },
    ]) {
        const report = successfulReport();
        change(report.results[0]);
        assert.throws(() => assertStarfallCampaign(report));
    }
});

test("CLI fails for missing evidence instead of reporting a successful campaign", () => {
    const result = spawnSync(
        process.execPath,
        [
            fileURLToPath(new URL("../check-starfall-campaign.mjs", import.meta.url)),
            fileURLToPath(new URL("./missing-campaign-report.json", import.meta.url)),
        ],
        { encoding: "utf8" },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Starfall campaign check failed/);
});
