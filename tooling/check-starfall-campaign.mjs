import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function assertStarfallCampaign(report) {
    assert.ok(Array.isArray(report?.results), "Campaign report must contain results");
    assert.deepEqual(
        report.results.map((result) => result.seed).sort((a, b) => a - b),
        [17, 41, 83],
        "Campaign report must contain each requested seed exactly once",
    );
    for (const result of report.results) {
        const label = `Seed ${result.seed}`;
        assert.equal(result.outcome, "campaign-clear", `${label} did not clear the campaign`);
        assert.equal(result.terminalScreen, "clear", `${label} did not finish on the clear screen`);
        assert.equal(result.stageIndex, 2, `${label} did not reach the final sector`);
        assert.equal(result.progress?.runs, 3, `${label} did not finish exactly three sectors`);
        assert.deepEqual(result.diagnostics, [], `${label} recorded diagnostics`);
        assert.ok(Array.isArray(result.stages), `${label} must contain sector summaries`);
        assert.deepEqual(
            result.stages.map((stage) => stage.stageIndex),
            [0, 1, 2],
            `${label} has incomplete or repeated sectors`,
        );
        for (const stage of result.stages) {
            assert.equal(
                stage.outcome,
                "clear",
                `${label}, sector ${stage.stageIndex} did not clear`,
            );
            assert.equal(stage.bossHealth, 0, `${label}, sector ${stage.stageIndex} boss survived`);
        }
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        assertStarfallCampaign(
            JSON.parse(readFileSync(process.argv[2] ?? ".test-output/campaign-bot.json", "utf8")),
        );
        console.log("Starfall campaign checks passed for seeds 17, 41, and 83.");
    } catch (error) {
        console.error(`Starfall campaign check failed: ${error.message}`);
        process.exitCode = 1;
    }
}
