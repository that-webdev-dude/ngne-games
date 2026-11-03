# Deployment

The collection builds one static artifact in root `dist/`. Pages publication is prepared in `.github/workflows/pages.yml`, is manual-only, and accepts only `main`. No public deployment has been verified yet.

## Destinations

| Item                | Planned URL                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Gallery             | https://that-webdev-dude.github.io/ngne-games/                                                                                          |
| Starfall play       | https://that-webdev-dude.github.io/ngne-games/starfall/                                                                                 |
| Collection source   | https://github.com/that-webdev-dude/ngne-games                                                                                          |
| Starfall source     | https://github.com/that-webdev-dude/ngne-games/tree/main/games/starfall                                                                 |
| Starfall screenshot | https://raw.githubusercontent.com/that-webdev-dude/ngne-games/main/games/starfall/docs/screenshots/midnight-citadel-starfall-engine.png |

This collection is Starfall's sole future deployment home. These links become accepted public targets only after the selected revision is published and checked. Keep operational play/source/screenshot links on these collection destinations; retain genuine historical attribution in provenance files.

## Prerequisites and approvals

- Complete local acceptance for the reviewed revision. Record any outstanding browser, hardware, controller, or audio limitations.
- Obtain separate authorization for pushing the reviewed branch, updating `main`, changing repository/default-branch/Pages settings, and publishing. A local commit, `proceed`, push, or merge alone does not authorize the other actions.
- The repository's default branch must be `main`, contain the workflow, and point to the reviewed revision. Manual dispatch requires the workflow on the default branch. The build and deploy jobs also guard against any ref other than `refs/heads/main`.
- GitHub Actions must be enabled and allow the SHA-pinned official actions used by the workflows. Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions** when that settings change is authorized.
- Configure the `github-pages` environment to allow `main`; preserve any required reviewers or existing protection rules. The person dispatching must have repository write access and satisfy environment approvals.
- CI/build jobs have only `contents: read`. Only the Pages deploy job receives `pages: write` and `id-token: write`. It uses the normal workflow token; no personal token is needed. `configure-pages` has automatic enablement disabled, so the repository's Pages settings must already be ready.

These requirements follow GitHub's [custom Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [manual dispatch](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow) documentation. Do not relax environment protections or expand token permissions to make a failing deployment pass.

## Local checks and artifact

Run from the root with Node.js 24 or newer:

```sh
npm ci
npm run format:check
npm run typecheck
npm test
npm run build
npm run check:campaign
npm run preview -- --port 4173 --strictPort
```

Both workflows install from the root lockfile, check formatting, run tooling/game tests, run `npm run build`, and assert Starfall campaign clears for seeds 17, 41, and 83. Game builds already typecheck game and test code. The bot JSON is written to ignored `.test-output/campaign-bot.json`; headless reachability does not establish rendered, audible, controller, or human acceptance.

Root `build` builds every game before assembling the gallery. Expected output includes:

```text
dist/index.html
dist/style.css
dist/gallery/starfall.png
dist/starfall/index.html
dist/starfall/assets/...
dist/starfall/LICENSE-NGNE.txt
```

Check a copy of this artifact served below `/ngne-games/`, including `/ngne-games/starfall/`, emitted JS/CSS/images/audio, and the license. Relative gallery/game links must work with the trailing slash. Do not upload only `games/starfall/dist/` or a repository root. Fixtures, dependencies, source maps, archives, and local evidence must stay out of the artifact.

CI runs for pull requests into `main` and pushes to `main` or `feature/**`. It uploads scoped check logs and any campaign JSON on failure with seven-day retention. Remote CI remains pending until an authorized push runs it.

## Manual publication

After separate publication approval:

1. Confirm successful CI and the exact reviewed commit on remote `main`. Ensure the workflow on `main` is the reviewed manual-only version.
2. Open **Actions → Deploy NGNE Games to GitHub Pages → Run workflow**, choose **main**, and run it. With GitHub CLI, the equivalent is `gh workflow run pages.yml --ref main`.
3. Check the selected run's commit SHA, all build checks, one `github-pages` artifact uploaded from root `dist/`, environment approvals, and the deployment result. Build and deploy are linked by `needs: build`; failed checks prevent deployment. No workflow publishes on push or pull request.
4. Verify the gallery and direct Starfall URL, thumbnail, keyboard navigation, launch, reload, console, resources, and `starfall/LICENSE-NGNE.txt` at the published origin. Check the source and raw screenshot URLs after `main` is available. Verify existing production browser storage separately from localhost.
5. Record the accepted commit, run, artifact, and URLs. Only then update deployment-status wording in the READMEs. Commit and push those edits under their own authorizations.

The Pages workflow serializes deployments without canceling an active run. It builds its own artifact and deploys that run's output; a green local build or CI artifact alone is not publication evidence.

## Rollback

Retain the accepted commit SHA and download a copy of its Pages artifact before its seven-day retention expires. Keep accepted source/assets/legal notices available; rollback must not depend on a separate Starfall site or repository.

The existing workflow has no selector for an old artifact. The normal rollback is a reviewed source revert on `main`, rechecking the complete collection and manually publishing it under separate commit/push/main/publication authorizations. Do not rewrite history or force-push. Using a retained artifact directly would require a separately reviewed and authorized redeployment path; do not assume re-running an old workflow bypasses its current permissions, environment rules, or approval requirements.

Retain each game's copyright and asset/audio provenance when reverting. A deployment rollback is not authorization to delete local source, captures, or authoring material.
