# Neuromorphs Playground

Neuromorphs is a zero-build browser playground for evolving virtual creatures. The prototype ships as static
HTML, CSS, and JavaScript, but already includes a deterministic evolution loop, local persistence for recent
runs, and a Web Worker that hosts Rapier physics so the main thread can focus on rendering.

## Current Capabilities

- **Interactive viewer** powered by Three.js with orbit/follow camera modes and a live simulation toggle.
- **Synthetic evolution demo** that mutates morph and controller genomes, evaluates fitness, and streams
  progress updates into the UI.
- **Run persistence** that serializes the last evolution run and replay trace into `localStorage`, enabling
  resume-and-review flows across page reloads.
- **Physics worker scaffold** that boots a Rapier world off the main thread and responds to play/pause/replay
  messages from the UI.

## Quickstart

1. **Install prerequisites**
   - Modern browser (Chrome 120+, Firefox 120+, Safari 17+).
   - [Node.js](https://nodejs.org/) 18+ for the optional dev server and running tests.
2. **Install dev dependencies** (needed for the dev server and tests):

   ```bash
   npm install
   ```

3. **Start a local server** from the project root. Either:
   - Run the zero-config Python server:

     ```bash
     python3 -m http.server 8080
     ```

   - Or use the Node-powered server with COOP/COEP headers pre-configured:

     ```bash
     npm run serve
     ```

4. **Open the playground** at [http://localhost:8080/index.html](http://localhost:8080/index.html).
5. **Start an evolution run** with the sidebar controls to watch genomes mutate and stats update in real time.

## Running Tests

Unit tests are written with Jest and live under `tests/`. After installing dev dependencies, run:

```bash
npm test
```

## Project Layout

```
index.html              # Main entry point wiring import maps and UI skeleton
style.css               # Global site styling
public/app.js           # App orchestration, evolution control, and persistence wiring
public/evolution/       # Evolution engine, fitness metrics, genomes, and RNG helpers
public/render/          # Three.js viewer composition and view controls
public/ui/              # DOM panels for evolution controls and stats readout
public/persistence/     # Local storage adapters for runs and replay data
workers/physics.worker.js # Rapier-driven worker for background simulation hooks
genomes/                # Canonical genome schemas shared across UI/worker/tests
scripts/dev-server.mjs  # Static file server with COOP/COEP headers for SharedArrayBuffer use
tests/                  # Jest specs covering genomes, evolution, and persistence utilities
```

## CDN Dependencies

- [Three.js](https://threejs.org/) via jsDelivr import map
- [@dimforge/rapier3d-compat](https://rapier.rs/) WebAssembly build served from jsDelivr inside the physics worker

Both dependencies load at runtime through native ES module imports, so no bundler or transpilation step is
required.
