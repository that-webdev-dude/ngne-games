# Testing

## Automated checks

Use Node.js 24 or newer, from the repository root:

```powershell
npm.cmd run test --workspace=starfall
npm.cmd run build --workspace=starfall
npm.cmd run check:campaign
```

The build checks source/test types and builds the production Vite entry. The campaign bot defaults to seeds 17, 41 and 83 and writes `.test-output/campaign-bot.json`; an output path followed by seeds can be supplied explicitly. Check every stage and campaign result, not just the exit code. The bot uses ordinary movement/fire/Nova inputs with exact entity observations and prediction. It demonstrates reachability, not human difficulty, audible balance or browser/GPU performance.

Generated test output belongs in gitignored `.test-output/`. Build output belongs in gitignored `dist/`.

## Browser fixtures

From the repository root, start `npm.cmd run dev --workspace=starfall -- --port 5173 --strictPort`. Open the routes below at `http://127.0.0.1:5173/`. These fixtures are excluded from the production entry/build.

| Route                                                                    | Purpose                                                                                 |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `/tests/browser-campaign.html`                                           | Rendered bot using production campaign composition.                                     |
| `/tests/browser-boss-review.html`                                        | Targeted boss presentation fixture.                                                     |
| `/tests/browser-integration.html?stage=1&manual=1&calm=0`                | Ordinary production stage beginning, normal controls/rules and sound after interaction. |
| `/tests/browser-integration.html?stage=1&scenario=boss&calm=0&capture=1` | Seeded, frozen presentation using production scenes, renderers and assets.              |

Integration route options:

| Parameter  | Values and behavior                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| `stage`    | `1`, `2`, `3`: Breakwater, Furnace, Citadel.                                                                  |
| `manual`   | `1` starts ordinary play; PLAY STAGE does the same. LOAD PRESET seeds presentation state instead.             |
| `emptyNova` | `1` with `manual=1` holds the Nova meter empty for encounter review. |
| `furnacePass` | With `stage=2&manual=1`, `1` starts at 43 seconds and `finale` starts at 73 seconds, with a fresh hull. |
| `citadelPass` | With `stage=3&manual=1`, `split` starts at 24.5 seconds and `finale` starts at 86.5 seconds, with a fresh hull. |
| `calm`     | `0` normal motion; `1` reduced motion. Manual play also permits changing it in Settings.                      |
| `scenario` | `card`, `play`, `boss`, `pause`, `result`, `settings`, `controls`, `death`, `loss`, `nova`, `dense`, `title`. |
| `capture`  | `1` hides fixture controls and freezes presentation presets. Manual play still advances normally.             |
| `pose`     | `-3` through `3`, default `0`: player bank pose in presets.                                                   |
| `novaTime` | `0` through `0.559` seconds, default `0.23`: preset Nova time.                                                |
| `novaOrigin` | `centre` (320,180), `lower` (320,270; default), `edge` (24,180), `corner` (24,319); Nova preset only. |
| `novaPlayback` | `1` with `scenario=nova`: seeded live review with Nova charged; press B, then move. Uses production input, hit-stop and playback. `capture=1` hides controls but does not freeze this route. |
| `variant`  | Boss presets: `intact`, `parts` (default: damaged hull/one destroyed part), `phase`, `cue`, `defeat`.         |

Presets seed clocks, populations and HP. Their images do not establish ordinary-rules reachability or animation continuity. For a compact presentation matrix, use all three stages × `card`, `play`, `boss`, `pause`, `result` × scales 1 and 2; supplement with normal/calm Nova, dense combat, player poses and menu/death states.

For Nova dissipation, run `node --experimental-strip-types --test --test-name-pattern=nova tests/rev01-player-fx.test.ts`, then the full tests and build. Review `?scenario=nova&novaPlayback=1&novaOrigin=centre&calm=0&capture=1` on the integration route; press B and move with D. Reload for another activation. Repeat with `lower`, `edge`, and `corner` at native 640×360 and integer-scaled 1280×720 presentation. These are seeded positions/populations, but activation and animation use ordinary production systems. Keep the manual route for normal play/reachability checks.

The expected progression is a coherent r95 ring (150 ms), a thinner r160 ring (200 ms), broken r235 arcs (250 ms), and sparse r320 remnants (300 ms). Edge/corner origins also show the outward tail at 350/410/470 ms. Use `novaTime` at those values without `novaPlayback` for frozen inspection; repeat `calm=1` to check the separate static cue. Inspect the live transition as well as stills, keep a recording or frame sequence, and report browser results separately from deterministic tests. Check the stationary trigger origin while moving, transparent interior, layering, and tile joins.

The diagnostic panel reports `LOADING`, `READY` after actual production GPU rendering, or `ERROR`. Confirm `NORMAL RULES / ordinary stage beginning` for play checks; presets say `SEEDED PRESENTATION / not reachability evidence`. Check backing size `[640,360]`, DPR, actual CSS dimensions and integer scale `k`. Nonfatal overload/dropped-tick diagnostics are recorded separately from fatal errors; retain both when reporting problems. Adapter identity is unavailable through the public API.

H toggles diagnostics. O or SAVE FRAME exports the next rendered GPU canvas as a native 640×360 PNG; check the export count, errors and downloaded file. The fixture does not reconstruct that image from metadata. Hide diagnostics before judging presentation.

For production smoke, run `npm.cmd run build`, then `npm.cmd run preview -- --port 4173 --strictPort`. Check title → launch → held fire → pause → return to title, and inspect the error overlay/browser console. A brief smoke does not establish a full rendered campaign clear.

## Manual checks

### Orbital Breakwater banking passes

1. Open `/tests/browser-integration.html?stage=1&manual=1&calm=0&emptyNova=1`. Confirm `READY`, `EMPTY NOVA / ordinary stage beginning`, and `novaCharge: 0` in diagnostics. Press H to hide the panel. The stage runs at normal speed and uses ordinary steering, fire, and collision. Reload to replay from launch.
2. Start near the middle at the default height. Around 4–5 seconds, look for the left formation banking inward and the amber muzzle cues before it straightens and fires. Hold Space after the volley so all four ships can show the cue, then steer right across the lower field as the shots approach. Watch the surviving interceptors peel back out through the left edge.
3. Return to the middle by 8 seconds. Around 9–11 seconds, watch the left gunship's glowing vents and fan while the mirrored interceptor formation banks in from the right. Hold Space after the interceptor volley. Compare a long left dodge with a shorter move left followed by a climb into the gap. Return toward the middle after the leading fan passes so the gunship's next volley does not catch you waiting there. Watch the surviving interceptors leave on the right.
4. Record the cue you saw before each volley, your route and hull change, and how the gunship affected your second crossing. Confirm the muzzle flash and projectile origins on both passes. Use the ordinary manual route to continue to Gatebreaker's warning at 86 seconds and arrival at 90 seconds. Record campaign-bot outcomes separately.

For a timed replay from the default position, hold D for about 0.6 seconds at 5.55, then A for about 0.6 seconds at 7.00 to recenter. Compare holding A for 0.6 seconds at 11.55 with tapping A for about 0.3 seconds at 11.25, W for 0.3 seconds at 11.85, and D for 0.45 seconds at 12.55. Use the diagnostics clock if you need fractional seconds.

### Orbital Breakwater sweeper crossing

1. Use the same empty-Nova route. Reach 28 seconds near the lower middle with the right-hand gunship alive. An upper sweeper enters from the left, then a lower sweeper enters from the right.
2. Watch the gunship's vents and the lower sweeper's first spreads. From near the lower middle, compare crossing right around 31 seconds with waiting until around 32 seconds, after those spreads have moved farther down. Hold Space as you cross and aim up the right-hand lane. Adjust for the bullets you see if your starting position changes.
3. Record which shot or ship made you wait or change course, and whether the gap was readable in time to use it. Note any hull change during the crossing.

### Orbital Breakwater staggered interceptor pairs

1. Use the empty-Nova route and approach 43 seconds near the lower middle. The right pair banks in first and fires around 43.6 seconds. Watch for the second pair entering from the left before the first finishes peeling away.
2. From the default height and near centre, try a short move left after the right pair fires. The left pair locks its aim around 44.9 seconds and fires around 45.4. Compare waiting in the new position with moving back right after the second volley. Keep an eye on any remaining sweeper shots and the gunship entering from the left.
3. For a timed comparison, hold A for about 0.2 seconds at 44.1, then hold D for about 0.47 seconds at 45.65 on the return attempt. Record whether you read both muzzle cues and whether the second pair made you move again.

### Orbital Breakwater synchronized interceptor volley

1. Use the empty-Nova route. Around 59 seconds, move up along the middle of the field to get above the gunship's low shots. At 60 seconds, watch for three interceptors banking in from each side and the two sweepers entering from the left.
2. Around 62 seconds, look for both trios' muzzle cues. They straighten and fire together around 62.6. Climb between the two groups of shots, keeping near the middle as the interceptors peel away. For a timed attempt from the default height, hold W for about 0.55 seconds at 59, then again for about 0.36 seconds at 62.2.
3. Record whether you could pick out the wider centre gap before the shots reached you, and whether the gunship or sweeper fire changed your approach. If you take damage, note which projectile hit you.

### Orbital Breakwater final interceptor ripple

1. Use the empty-Nova route and approach 81 seconds near the lower middle. Watch the six interceptors bank in from the right in a diagonal line. Their muzzle cues and shots progress from the inside ship to the outside ship. The first shot fires around 82.9 seconds and the last around 83.9.
2. Let the first shot fire, then move just left of its lane. Watch the sweeper spread while you hold that position. For a timed attempt from the default height and near centre, hold A for about 0.2 seconds at 83.15, then S for about 0.25 seconds at 84.5. Hold Space after the first move.
3. Check that you can read the order of the shots, the interceptors clear the right edge before the warning at 86 seconds, and Gatebreaker enters at 90 seconds.

### Orbital Breakwater cue and pacing review

1. Use the ordinary Sector 1 manual route. Around 24.5 seconds, watch the gunship entering on the right. Two amber muzzle glows should be visible below the top HUD before its first fan. The opening gunship still cues with its visible vents.
2. Around 79–86 seconds, check whether the single sweeper leaves enough room to read the final interceptor ripple while both gunships are active. The warning still clears the field at 86 seconds.
3. At Gatebreaker's first curtain cue, around 96.6 seconds, look for two thin lines framing the safe lane. Check whether you can read the edges while watching the player ship. If you clear the boss, note the time from Gatebreaker's entry to defeat and from the second turret's destruction to defeat.

### Furnace Belt encounter sequence

1. Start at `/tests/browser-integration.html?stage=2&manual=1&calm=0`. Play from launch with normal Nova. The first aimed bank comes from the right at 2 seconds. The left mine starts bursting around 8 seconds, before a lower sweeper from the right and a bank from the left close in. Check whether you can keep firing while changing sides.
2. At 18 and 19.8 seconds, watch the right pair and then the left pair lock their shots. Move after the first lock and adjust again when the Warden marks a lane. The pairs shoot around 20.6 and 22.4 seconds. Note whether the beam changes your second dodge.
3. At 29 seconds, let the crossing ships hook and fire around 33.4 seconds. The first right-side mine bursts around 32.3, while the gunship continues firing from the left. Compare that escape route with the 51-second pass, where the new mine is on the left.
4. At 66.5 seconds, watch for two groups of four banking inward. They fire straight down together around 69.1. If you wait in the centre gap, the Warden can charge a beam through it as the volley reaches the lower field. Leave the marked lane before it goes live and look for room between the parallel shots. Note whether the right mine changes your choice.
5. For a quick replay of the ending, open `/tests/browser-integration.html?stage=2&manual=1&calm=0&emptyNova=1&furnacePass=finale` and confirm the 73-second checkpoint. The final ripple starts its approach at 88 seconds and fires from the inside out around 89.9–90.9. Try moving left of the first shot while watching the left mine ring and the right gunship's fan. Verify the last ships exit before the 96-second warning and Kiln Serpent enters at 100.

Record which overlaps made you change direction, where you spent Nova, and which cues you could read while dodging. Record the full run and the checkpoint attempts separately.

### Furnace Belt 51-second crossing and return

1. Open `/tests/browser-integration.html?stage=2&manual=1&calm=0&emptyNova=1&furnacePass=1`. Confirm `READY`, the 43-second checkpoint, and `novaCharge: 0`. Press H to hide diagnostics for the visual check. Reload to repeat. The checkpoint includes the 44-second interceptors and 45-second sweepers. Omit `furnacePass=1` to play from launch.
2. Stay centred and hold Space until about 50.25 seconds, then release it to see all five ships. Watch them cross from the right at 51 seconds. Around 54–55 seconds, watch the noses rotate through a down-facing turn at the left edge, then look for the amber muzzle cues on the descending return. The five shots should leave the muzzles diagonally down-right together around 55.4 seconds. Watch the ships leave through the right edge by 58.5 seconds.
3. For a timed dodge, hold W for about 0.35 seconds at 52.65 to move up beneath the crossing. As the ships turn, hold S for about 0.25 seconds at 54.3, then hold A for about 0.73 seconds at 54.85. Stay low on the left through the first mine burst around 56.5. On a second attempt, shorten the A hold to 0.5 seconds, then hold W for 0.25 seconds at about 57.0 to try climbing under the mine. Watch where the ring crosses that route.
4. Record pass or fail for the turn cue, muzzle alignment, clean exit, and escape route. Note hull at 51 and 59 seconds, whether the mine changed where you could climb, and what hit you if you took damage. To check the end of the sector, continue to the warning at 96 seconds and Kiln Serpent's arrival at 100 seconds.

### Midnight Citadel from launch

1. Open `/tests/browser-integration.html?stage=3&manual=1&calm=0`. Confirm `READY` and `NORMAL RULES / ordinary stage beginning`. Use standard Nova (B) and ordinary steering and fire. Press H to hide diagnostics.
2. Read the left bank around 4 seconds and the later right bank around 6.5. Try a right dodge, then move back left after the second lock. Watch the left mine ring and the low sweeper from the right before choosing where to hold. Around 17.6, look for the gap in the first synchronized volley and watch how the right gunship's fan cuts across that gap.
3. Around 28.2, watch the split dive shoot outward. After a short lull, compare the return passes at 34.25 and 73. The first hooks below a Warden lock and fires around 38.7, while the second fires around 77.4 with a low sweeper and right-side mines in the way. Note which lanes the supports take away.
4. Use the repair at 46 to regroup. Around 53–54, read the right ripple from inside to outside. At 64.6, compare the tighter centre seam with the first synchronized volley. Look for a seam between adjacent shots if the lower sweeper or the left gunship crosses your original route.
5. Play through the six-ship split and Warden lock, then the right ripple and last aimed pair. Check that the 106-second warning clears the field and the Starfall Engine enters at 110.

Record each cue you acted on, what made you change course, where you spent Nova, and the cause of each hull loss. Note any stretch where you could repeat the same dodge or where the pace sagged. Record browser observations separately from `check:campaign` results.

### Midnight Citadel split dive with Nova empty

1. Open `/tests/browser-integration.html?stage=3&manual=1&calm=0&emptyNova=1&citadelPass=split`. Confirm the 24.5-second checkpoint and `novaCharge: 0`. Leave Space released to see all four ships. This checkpoint omits earlier encounters.
2. Stay at the default height. Hold A for about 0.65 seconds starting near 24.65 to set up left of centre. At 26, watch the ships enter in a compact formation. As they fan out, look for amber at the outward-facing muzzles around 27.5. Move right for about 0.6 seconds once you see it. Aim to be near centre when the shots pass through your former lane.
3. Watch the four muzzle flashes around 28.2 and confirm the shots follow each nose. Follow the hulls until both wings clear the side edges around 30.6. On another attempt, stay in the left lane after the cue and record what happens.

### Midnight Citadel finale with Nova empty

1. Open `/tests/browser-integration.html?stage=3&manual=1&calm=0&emptyNova=1&citadelPass=finale`. Confirm the 86.5-second checkpoint and `novaCharge: 0`. This starts before the gunship, mine and sweeper that feed the overlap. Keep Space released to retain all three threats.
2. Start at the default height near centre. Around 93.9, use a short A hold (about 0.23 seconds) to slip left of the low sweeper spread. Stay inside the split's two wings and watch the outward volley around 95.15.
3. When the Warden's dashed lane appears around 96.15, move right for about 0.30 seconds, stopping just right of centre. For a timed check, start the move around 96.44. The beam goes live around 96.95. Around 99, move up-left as the right-hand ripple starts firing and the Warden prepares the next beam. Aim to get left of the first ripple column (x314 in the 640-pixel view). Check the gunship fan before crossing again. Continue through the last aimed pair and the warning.
4. Compare with a run where you hold your lane through the beam warning. Record hull before the split, after the beam, after the ripple, and at Engine entry. For each hit, record whether it came from a ship, beam, mine ring, sweeper spread, gunship fan or interceptor shot.

### Full-stage review

For each stage, play at scales 2 and 3 with reduced motion both off and on. Use the manual route above with the corresponding stage number. Target browser content areas of 1280×720 or 1920×1080 **device pixels**; Windows scaling changes CSS pixels, so verify DPR and reported `k`. Smaller than 640×360 device pixels clips the centred 1× canvas.

Use movement, held primary fire, Nova, damage/repair, pause, pointer navigation, Settings, Controls, retry and results. Repeat movement/fire/Nova/pause on a physical gamepad if available; record unavailable hardware explicitly. Listen to music/effects and their mix through play and pause.

| Stage                 | Checks                                                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1: Orbital Breakwater | Seven bank poses retain core/exhaust/muzzle alignment; Gatebreaker turrets show firing/disabled states; collision feel and primary cadence are acceptable. |
| 2: Furnace Belt       | Mines, pickups and beam warnings remain legible; Kiln links/rotation/damaged head read consistently; destroyed segment husks neither collide nor fire.     |
| 3: Midnight Citadel   | Engine phases, attached emitters, disabled machinery and defeat remain distinct during dense patterns; final result and replay work.                       |

Across all stages, inspect crisp pixels, letterboxing, text/card/result readability, menu hit areas and low-hull cues. Threats, lanes and the player core must remain readable over HUD/Nova/explosions. Reduced motion should provide understandable static cues without blinking. Check that the menu footer sits above the dimmed HUD band.

Record stage, scale, DPR, reduced-motion setting, device/browser, gamepad availability and pass/fail details. Physical scaling, gamepad behavior, audible balance, accessibility and human play feel still need owner/device acceptance; automated checks and screenshots do not establish those results.

## Current integration decisions

- Runtime PNGs come from `src/assets/sprites/` and `src/assets/backgrounds/`. Metadata and specified gameplay values come from `src/assets/spec.json`. Tests use these same assets, so the authoring archive is optional for builds and tests. Per-pose player muzzle sockets determine actual shot origins. Hostile shot, mine-release and boss-part sockets determine spawn and collider geometry.
- Nova clears hostile bullets and both charging and active beams, keeps friendly shots, and briefly suppresses new hostile fire. It grants at least 0.5 seconds of protection and recharges in 15 seconds. Enemy, boss and attached-part HP stay intact, and Nova awards no destruction rewards. Mine fuses run normally: a mine due to detonate during suppression expires without emitting its burst, and a mine still on its fuse remains a threat.
- Nova plays 11 frames over 560 ms; `fade-3` is excluded from playback/upload. Beam lane widths are 15/13 px for Engine/Warden, mine radius is 6, low hull means hull ≤ 1, and the stage card lasts 2.6 seconds.
- Nova's source PNG retains the original artwork. `packNovaAtlas` applies the spec's binary dissipation cutout once during loading. Thinning begins at r160, breakup at r235, and increasingly sparse arcs continue to r695. The former r500-only/off-screen fade staging is superseded. Retained colors and source coordinates are exact. The resulting atlas is 2048×224 with 396 occupied tiles. Playback uses a fixed origin and a separate reduced-motion cue.
- Plasma hold/charge/release gameplay is unimplemented and its HUD bar stays empty. Charge controls, damage/resource/boss rules, optional tall mode and further title redesign remain owner decisions.
- Runtime backgrounds retain the 17% tint and starfield, so raw art can appear brighter than the game.

## Known limitations

- A pause tap during Nova hit-stop can be consumed; repeating it after the freeze pauses. This predates the revised-art integration.
- Interceptor/Kiln head attack cues retain code-drawn elements. The damaged Gatebreaker core composites existing art, Kiln section fans retain head-relative origins, and the title wordmark remains small at native font size.
- Artwork regeneration requires the original authoring archive; exported runtime assets alone do not include its generators, palette or validation tools. The archive's historical palette sampler requires removed legacy inputs.
