# WAHALA! — GitHub + Claude Code + GitHub Pages: Step-by-Step Guide

**Prepared:** 20 October 2026  
**Goal:** Use Claude Code cloud to create an attractive **frontend-only** WAHALA! game playable by a person against AI, shareable as a website, with no application server.

## The short answer

- **Create a completely NEW GitHub repository**, recommended name `wahala-game`. **Do not** use an Accra Life branch or put WAHALA! inside Accra Life.
- Connect Claude Code **to that new repo**. If Claude currently sees only Accra Life, expand its GitHub App repository access to include `wahala-game`.
- The Claude Code cloud task usually works in its own branch and offers a pull request. **You do not have to create a branch yourself.**
- Once the code is merged into `main`, **GitHub Actions builds the Vite frontend and GitHub Pages serves it** at an ordinary URL such as `https://YOUR-USERNAME.github.io/wahala-game/`.
- **No server is needed for AI matches** because all gameplay and bot logic runs locally in each browser. This does NOT provide real human-versus-human network play, which comes later.

## Before starting: important GitHub Pages visibility choice

With **GitHub Free**, GitHub Pages requires a **public repository**. This means other people can inspect or download source code, the Game Bible and reference materials committed to that repository. A public URL does not mean a public multiplayer room. If keeping the game concept/source private is essential, instead use a **private GitHub repository and a static host that can deploy it**, such as a suitably configured Cloudflare Pages or Vercel project, and give Claude Code that instruction. The following steps assume you choose public GitHub Pages for simplicity.

Never upload API tokens, passwords, `.env` secrets or private credentials. Phase 1 needs none.

## Step 1 — Save the project pack on your computer

Download **WAHALA_Claude_Starter_Pack.zip** and unzip it. It includes:

```
WAHALA_Claude_Starter_Pack/
├── README_FIRST.md
├── docs/
│   ├── GAME_DESIGN_BIBLE.md
│   ├── CLAUDE_CODE_BUILD_PROMPT.md
│   └── SETUP_GUIDE.md
└── reference/
    ├── gameplay-still.jpg
    ├── gameplay-video.mp4
    └── video-contact-sheet.jpg
```

- **`docs/GAME_DESIGN_BIBLE.md`** is the authoritative specification. The old plan's four vehicle attacks and online-first plan are obsolete.
- **`docs/CLAUDE_CODE_BUILD_PROMPT.md`** is the instruction for Claude Code.
- `reference/` helps Claude see the desired elevated 3D Lagos style; it is **optional for function**, and should **not** be shipped as game assets in the deployed site. Image/video are visual guidance only.

## Step 2 — Create the new GitHub repository

1. Open **https://github.com/new** and sign in.
2. Owner: choose your own GitHub account.
3. Repository name: **`wahala-game`** (all lower-case, with hyphen).
4. Description: `WAHALA! — Nigerian-inspired browser arcade game (solo AI prototype)`.
5. Visibility: **Public** if using GitHub Free + GitHub Pages. If you want private source, stop and choose another static host later.
6. Check **Add a README file**. A `.gitignore` and licence can be added later by Claude Code. Don't accidentally select a template from another game.
7. Click **Create repository**.

**Do not create a branch of your Accra Life repository.** This is a separate project with separate code, history and deployment.

## Step 3 — Upload the Bible and (optionally) visual references

**Website-only method; no Terminal required:**

1. In the new repo, choose **Add file → Upload files**.
2. Drag the **`docs` folder** from the unzipped starter pack to the upload box, preserving its folder and filenames. GitHub's web upload accepts folders by drag-and-drop. If your phone/browser does not allow folder upload, use a computer, or create the `docs` folder in the repo and upload the three `.md` files while inside it.
3. Optionally upload the `reference` folder (image, short video, contact sheet). The video is a few megabytes, not needed for game logic.
4. Enter commit message `Add WAHALA game Bible and Claude build instructions`.
5. Commit to `main` for this **initial documentation-only import**. If GitHub offers to create a branch/PR instead, complete that PR and merge the docs before proceeding.
6. Confirm files appear at **`docs/GAME_DESIGN_BIBLE.md`** and **`docs/CLAUDE_CODE_BUILD_PROMPT.md`**. Claude's build prompt depends on these exact paths.

**Alternative if upload folders is fiddly:** On a computer, clone the repo using GitHub Desktop or Git, copy the unzipped `docs` and `reference` folders into the repo, commit and push. Do not upload the `.zip` by itself expecting Claude to automatically extract it.

## Step 4 — Give Claude Code access to the NEW repository

If Claude Code cloud only offers your existing **Accra Life** project, its GitHub permissions probably cover only that repository. **Do not change Accra Life or give Claude a branch there.**

1. Open **https://claude.ai/code** and sign into the account you use for Claude Code cloud.
2. Open the repository selector beneath the task input. If `wahala-game` is already there, select it and skip permissions changes.
3. If it is missing, follow Claude Code's **Connect GitHub / Manage repository access** path. On GitHub you can also visit **Settings → Applications → Installed GitHub Apps → Claude (or the Anthropic app) → Configure**, then change **Repository access** to include **`wahala-game`**. The app display name and screens can vary.
4. Grant access only to WAHALA! if you prefer least privilege. Keep Accra Life accessible only if you need it for its own separate work.
5. Return to Claude Code, refresh/select `wahala-game` and start from its **main** branch. You don't have to create a work branch by hand; cloud tasks create their own branch/workspace.

**Note:** A plain Claude chat GitHub connector that can *read files* is not necessarily the same as the **Claude Code cloud repository authorisation** needed to push code and create PRs. Use the Code interface and its GitHub setup.

## Step 5 — Submit the Claude Code build prompt

1. Open the file **`docs/CLAUDE_CODE_BUILD_PROMPT.md`** and paste the content between **BEGIN COPY-PASTE PROMPT** and **END COPY-PASTE PROMPT** into your new Claude Code task. If Claude Code can access the file directly in the repo, a shorter equivalent is:

   > Read `docs/GAME_DESIGN_BIBLE.md` and follow `docs/CLAUDE_CODE_BUILD_PROMPT.md`, beginning with Stage A immediately. Build a real functioning browser-only AI game with tests and GitHub Pages deployment support. Do not write a plan-only response or implement any multiplayer server. Commit progress and report what actually works.

2. Confirm the selected repo is **`wahala-game`**, not Accra Life.
3. Choose the normal edit/implementation mode (not Plan-only) when ready for Claude to write code.
4. Let Claude work. It can create a feature branch and propose a pull request. Check the output for implementation results, code quality, test results, deployed Pages workflow, and a list of unfinished items.
5. **DO NOT merge blindly** if tests fail or core generator gameplay is a mock-up. Ask Claude to fix it on the branch first.

## Step 6 — Merge the working prototype

1. In GitHub, open the **Pull requests** tab and open Claude's completed PR.
2. Review `Files changed`, the summary and any checks. There should be actual TypeScript gameplay logic, a Three.js arena, controls, tests, and `.github/workflows/deploy.yml` (or equivalent).
3. After critical checks pass, click **Merge pull request** to bring it into `main`.
4. If conflict warnings appear, have Claude resolve them; don't force-merge over unrelated changes.

## Step 7 — Turn on GitHub Pages

1. Open your `wahala-game` repository's **Settings** tab → **Pages**.
2. Under **Build and deployment**, set **Source = GitHub Actions** (NOT "Deploy from a branch" when using a compiled Vite application with the supplied workflow).
3. Ensure Claude has created `.github/workflows/deploy.yml` that installs dependencies, runs the build, uploads the `dist/` directory and deploys it to Pages. For Vite project sites, its `base` should match **`/wahala-game/`** when using the default GitHub Pages project URL.
4. Go to the repo's **Actions** tab. Open the latest deployment and wait for a successful run. If a deployment was merged before you enabled Pages, trigger the workflow via **Run workflow** if available or have Claude push a new change.
5. Find the published link in **Settings → Pages** or the successful deployment job. For a standard public repo it will resemble:

   `https://YOUR-GITHUB-USERNAME.github.io/wahala-game/`

   Replace `YOUR-GITHUB-USERNAME` with your actual username. This is a **URL pattern**, not a claim the site is already live.
6. Open the URL on your **Mac, your phone and preferably another person's phone**. Confirm a full game starts, bot movement/attacks really work, and touch controls are usable.

**If you see a blank screen:** Ask Claude to check Vite's deployment `base` and asset URLs. If you see 404, inspect Actions logs and Pages source. **If the site is working but two friends see separate games, that is expected:** multiplayer isn't built yet.

## Step 8 — Test, give feedback and continue incrementally

Start with **one complete playable arena** and several real matches. Test:

- Can you dodge your own generator after placing it? Are bomb sources obvious?
- Are AI Easy/Medium/Hard meaningfully different?
- Do power-ups feel fun and understandable?
- Does Okada really protect from every lethal event once?
- Can you use vehicle entry selection with **touch, keyboard and controller**?
- Do vehicles trigger generators and have accumulating blast damage?
- Do remote activation, carry's one-time +1s and Kill Switch work as designed?
- When the last two competitors die simultaneously, does it draw?
- Are the controls responsive on a mid-range phone and keyboard laptop?

Send Claude bug reports with **what you did, what happened, what should happen, phone/browser if relevant**, and video/screenshot. Ask for focussed repairs on fresh branches/PRs. Record feedback in `docs/PLAYTEST_NOTES.md`.

## Can Claude Code build the whole game in one go?

**It can produce a substantial first version from a single detailed task, but don't treat one task as a guarantee of a polished complete game.** This is more than a simple frontend: it needs deterministic game rules, tile movement, explosions, AI, special vehicle pathfinding, responsive controls, 3D render, power-ups, audio and correctness testing. We have deliberately **three development checkpoints inside Phase 1**:

- **A — Playable baseline:** one arena, 1 human + AI, generators, collisions, rounds, draws, responsive controls and static deployment.
- **B — WAHALA! signature mechanics:** three vehicles, Okada, carry/remote/disarm/kick/punch, improved AI and other pickups.
- **C — Enjoyable game quality:** animation, comical hits, sound, Pidgin crowd, music, input polish and mobile performance.

**Recommended workflow:** Submit the master prompt once and ask Claude to execute A → B → C with commits. If it completes A but not B/C within a session, **keep the working branch and continue via the supplied continuation prompt**. Don't ask it to implement full online multiplayer or all 10 arenas now. You can start independent visual/audio work in parallel after the gameplay interfaces stabilize, but avoid multiple agents simultaneously editing core simulation files.

## Should you send images or videos?

**Yes, helpful but not required.** The original Gemini still/video already convey the visual mood much better than words alone: elevated 3D Lagos environment, clear characters, audience, Danfo, concrete grid and market clutter. Upload the picture and video contact sheet to the GitHub `reference/` folder so the Claude Code cloud task can see them; the original short MP4 is also included in this pack.

Tell Claude explicitly:

- Copy **stylistic direction**, not literal impossible fire, health bars or copyrighted design.
- **Generate/use original game art and sound**. Do not add the Gemini screenshot as a giant fake "gameplay" background.
- A readable, playable low-poly scene is better than a gorgeous static demo.

## What I need from you next

**First action:** Create **`wahala-game`** on GitHub and tell me when it exists (and whether you chose Public or Private). Then we can go through uploading the Game Bible, granting Claude Code access, starting the build, and reviewing the PR **one step at a time**. No need for any API credentials for this offline phase.

---

### Verified references (current as of 20 October 2026)

- GitHub Pages / static hosting: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- GitHub Pages with Actions: https://docs.github.com/en/get-started/start-your-journey/deploying-your-website-automatically
- Vite static deploy / `base`: https://vite.dev/guide/static-deploy.html
- GitHub web uploads: https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository
- Claude Code cloud / work branches: https://support.claude.com/en/articles/12618689-use-claude-code-in-the-cloud
- Claude Code cloud onboarding: https://code.claude.com/docs/en/web-quickstart
