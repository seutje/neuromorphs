# Neuromorphs Playground

Neuromorphs is a zero-build browser playground for evolving virtual creatures. The initial project skeleton
runs entirely from static HTML, CSS, and JavaScript files served from the repository root. Future phases will
layer in physics workers, genome schemas, evolutionary loops, and UI tooling.

## Quickstart

1. **Install prerequisites**: Any modern browser (Chrome 120+, Firefox 120+, Safari 17+) and Python 3.10+ for
   the ad-hoc dev server.
2. **Start a local server** from the project root:

   ```bash
   python3 -m http.server 8080
   ```

3. **Open the playground** at [http://localhost:8080/index.html](http://localhost:8080/index.html).
4. **Verify the placeholder scene**: A glowing cube should spin inside the canvas, and the status message should
   confirm that Three.js and Rapier initialized successfully.

## Project Layout

```
index.html         # Entry point that wires up CDN ESM modules
style.css          # Global site styling (dark/light friendly)
public/app.js      # App orchestration and placeholder Three.js + Rapier init
```

Additional modules will live under `public/` (UI panels, render helpers) and worker scripts under `workers/`
as the plan advances to later phases.

## CDN Dependencies

- [Three.js](https://threejs.org/) via jsDelivr ESM bundle
- [Rapier 3D Compat](https://rapier.rs/) WebAssembly build via jsDelivr

Both dependencies load at runtime through native ES Module imports inside `public/app.js`, so no bundler or
transpilation step is required.

## Browser Support

The project targets evergreen browsers with native ES Module and WebAssembly support. SharedArrayBuffer features
may require running the dev server with COOP/COEP headers in later phases; instructions will be added once those
features land.
