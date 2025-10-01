# Repository Guidelines

## Project Structure & Module Organization
Project runs as a static site: keep `index.html` at the root and load all logic via ESM modules in `public/`. Use `public/app.js` as the orchestration entry, `public/ui/` for DOM panels, and `public/render/` for Three.js scene code. Keep physics worker modules in `workers/physics.worker.js` (module worker) and share schemas/models from `genomes/` so UI and worker stay in sync. Docs such as `DESIGN.md`, `PLAN.md`, and future architecture notes belong either in the root or `/docs/` once it exists.

## Build, Test, and Development Commands
- `python3 -m http.server 8080` — serves the repository as-is; open `http://localhost:8080/index.html`.
- `npm run serve` — alias the command above once `package.json` lands, adding COOP/COEP headers when SharedArrayBuffer is required.
- `node --test tests/*.test.js` — executes deterministic unit tests for genomes, mutations, and controller math.
- `npm run lint` — runs ESLint with the shared config; always resolve warnings before committing.

## Coding Style & Naming Conventions
Use 2-space indentation for HTML, JS, and CSS. Prefer named ESM exports and keep modules focused (<200 lines). Follow `camelCase` for functions/variables, `PascalCase` for classes, and `kebab-case` for filenames. Format with Prettier (invoked via `npm run lint -- --fix`) to maintain consistent spacing and quotes.

## Testing Guidelines
Author tests as pure ESM modules in `tests/`, naming files `*.test.js` to mirror source paths. Fix the random seed inside each test and load fixtures from `fixtures/*.json` when comparing genomes or replays. Target ≥80% coverage on evolution-critical modules and attach coverage output or manual steps to each PR.

Always add unit tests alongside new functionality and include regression tests whenever you fix a bug to prevent regressions.

## Commit & Pull Request Guidelines
Current history is minimal, so adopt Conventional Commits (`feat:`, `fix:`, `docs:`) written in the imperative mood ≤72 characters. Reference issues with `Refs #id` in the body, and describe behavioural changes plus manual/automated test evidence in the PR template. Include screenshots or short clips for UI updates and tag domain reviewers (engine, UI, physics) explicitly.

## Security & Configuration Tips
Serve files with COOP/COEP headers whenever SharedArrayBuffer is enabled; document the server recipe in `docs/dev-server.md`. Pin Rapier and other CDN URLs to exact versions and avoid committing generated WASM binaries. Keep exported seeds and replays deterministic so shared links stay reproducible across machines.
