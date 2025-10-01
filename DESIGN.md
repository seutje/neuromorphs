# NeuroMorphs: Modern Web Reinterpretation of Karl Sims’ *Evolved Virtual Creatures* (1994)

## 1) Purpose & Vision
Recreate the spirit of Karl Sims’ 1994 experiments—evolving articulated soft/hard-bodied creatures controlled by neural networks—fully in the browser. Players can watch evolution unfold, manipulate selective pressures, and share seeds/runs. The emphasis is on scientific curiosity, performance, accessibility, and delightful viz.

**Core pillars**
- **Faithful ideas**: block-based morphologies, articulated joints, networked controllers, fitness via task environments (locomotion, swimming, jumping, fighting/pushing blocks).
- **Modern UX**: real-time 3D with cinematic cameras, time controls, replay/ghosting, shareable links, and small social features.
- **Performance-first**: WASM physics, parallel evaluation, compact genomes, deterministic seeds.
- **Explainability**: genome inspector, controller graph viewer, fitness trace, mutation diffs.

---

## 2) High-Level Scope
- **In-scope**: Web app (SPA), evolution engine, physics-based simulation, rendering/UX, persistent runs, import/export, simple leaderboards, deterministic replays.
- **Out-of-scope (v1)**: Multiplayer synchronous co-evolution; fluid simulation; ML backends; mobile AR; full soft-body FEM.

---

## 3) User Stories
- *Viewer*: “I want to watch creatures evolve and scrub through generations.”
- *Tinkerer*: “I want to tweak mutation rates & fitness functions to see different outcomes.”
- *Researcher/Teacher*: “I want reproducible seeds, exportable run data, and visualizations for lectures.”
- *Speedrunner*: “I want a ‘challenge’ (e.g., 10m dash) and compare my best evolved creature against global ghosts.”

---

## 4) Success Metrics
- **Perf**: Evaluate ≥ 256 creatures × 10–20s simulated time per generation at ≥ real-time on mid-range laptops.
- **Determinism**: Given a seed, identical run within ±1% fitness variance.
- **Usability**: New users complete a first evolution run (10 gens) in < 3 minutes without docs.
- **Engagement**: Median session length ≥ 8 minutes; ≥ 50% click genome/brain inspectors.

---

## 5) System Architecture
**Frontend-only (default)** with optional server for leaderboards/storage.

- **Modules**
  - *Core Engine*: evolution loop, genetics, tasks.
  - *Simulation*: physics bridge (WASM), world builder per task.
  - *Rendering*: Three.js scene graph, materials, postFX.
  - *Orchestration*: Web Workers/SharedArrayBuffer for parallel eval.
  - *Persistence*: IndexedDB for run data; optional cloud sync.
  - *UI*: React (or vanilla) + state mgmt (Zustand/Redux) + router.

**Data flow**
- UI → Orchestrator → Workers → Physics/Sim → Fitness → Evolution → New population.
- Renderer reads read-only sim state snapshots (triple-buffered) to avoid lockstep.

---

## 6) Technology Choices
- **3D Rendering**: Three.js (WebGL2), with post-processing (bloom/SSR optional).
- **Physics**: **Rapier** (WASM, Rust) preferred for speed/determinism; fallback **cannon-es** (JS) if WASM unavailable.
- **Parallelism**: Web Workers + SharedArrayBuffer (COOP/COEP headers for cross-origin isolation) for multi-core eval; OffscreenCanvas for headless rendering in workers (optional).
- **Numerics**: Deterministic PRNG (e.g., xoshiro128**), fixed-step integrator.
- **Serialization**: Flat, versioned JSON + optional protobuf-style compact binary for genomes.
- **Storage**: IndexedDB via idb.

---

## 7) Creature Representation (Genome)
Two-layer encoding separates **morphology** from **control**:

### 7.1 Morphology (Compositional Graph of Cuboids)
- **Building block**: axis-aligned cuboid with parameters `{sx, sy, sz}` in local frame.
- **Attachment**: each block may expose up to 6 faces as attachment sites; genome stores adjacency graph.
- **Joints**: articulate parent-child with joint type: `revolute`, `spherical`, `prismatic` (v1: revolute only), with limits & stiffness.
- **Symmetry genes**: optional mirroring along axes to quickly grow bilaterally symmetric forms.
- **Material genes**: density, restitution, friction (bounded ranges).
- **Developmental rules**: Grammar-like expansion (L-systems/graph-rewrite) permits compact genomes to scale.

**Genome snippet (conceptual)**
```json
{
  "nodes": [{"id":0,"size":[0.8,0.6,0.6],"mat":1}, {"id":1,"size":[0.5,0.3,0.3],"mat":2}],
  "edges": [{"parent":0,"child":1,"site":"+X","joint":{"type":"rev","axis":"Y","limit":[-0.6,0.6]}}],
  "sym": {"mirrorX": true}
}
```

### 7.2 Controller (Neurocontroller)
- **Graph**: weighted directed graph with node types: sensors, neurons (tanh/relu/sigmoid), oscillators (CPG), and actuators.
- **Sensors**: joint angle/velocity, foot contact, COM velocity, global time, task-specific sensors (e.g., target direction).
- **Actuators**: per joint desired target angle/velocity/torque.
- **Update**: fixed Δt (e.g., 10–20ms) with clamped outputs.
- **Encoding**: NEAT-like innovation tracking for add-node/add-connection, or compact CPPN generating weights topologically.

---

## 8) Fitness Tasks
Each task defines a world, sensors subset, and objective:
- **Land locomotion**: maximize forward COM distance over T seconds; penalties for energy and falls.
- **Swim (v2)**: simplified drag model; no full fluid dynamics.
- **Jump**: maximize peak height.
- **Push/Box**: push a block beyond a line.
- **Novelty search (optional)**: behavioral diversity score.

Fitness = `w1*distance - w2*energy - w3*contacts_penalty + bonus(task-specific)`.

---

## 9) Evolutionary Algorithm
- **Population**: N = 128–512.
- **Initialization**: minimal seed morphologies (single block + two limbs) with random small controllers.
- **Selection**: tournament (k=3) or rank-based; optional elitism (e=2–4).
- **Variation**:
  - *Mutation*: add/remove block; change block size; add/remove joint; perturb joint limits; add/remove neuron/edge; weight jitter; oscillator params; symmetry toggle.
  - *Crossover*: one- or two-point genome crossover with innovation alignment.
- **Speciation**: compatibility distance across morphology+controller to protect innovation; per-species niches.
- **Evaluation**: K rollouts with random seeds for robustness, take mean fitness.
- **Replacement**: generational or steady-state.
- **Restart heuristics**: if stagnation > G gens, increase mutation or inject novelty.

---

## 10) Simulation & Time
- **Integrator**: fixed-step physics (e.g., 120 Hz); control loop at 50 Hz; rendering at vsync.
- **Time scaling**: 1×, 2×, 4×, 8× via physics substeps without changing control Δt.
- **Batch eval**: M workers simulate subsets of the population headlessly; only best/selected are visualized.
- **Determinism**: lockstep stepping; avoid time-based randomness; seeded PRNG per individual.

---

## 11) Rendering & Visual Design
- **Three.js scene**: ground plane, HDRI skybox, shadow-casting directional light + fill lights.
- **Materials**: distinct hues per limb; joint axes glyphs (toggleable); contact decals.
- **Cameras**: follow best creature, free orbit, cinematic rails; slow-mo toggle.
- **PostFX**: mild bloom, SSAO (optional), motion blur in replays.
- **Debug**: wireframe, center-of-mass marker, joint limit cones, sensor ray gizmos.

---

## 12) UI / UX
- **Home**: preset challenges; ‘Start Evolution’ CTA; showcase of community seeds.
- **Run view**: grid of top-N from current gen; click to focus; HUD with fitness/time; inspector drawer.
- **Inspectors**:
  - *Genome*: morphology graph tree; list of joints/limits/materials.
  - *Brain*: node-link diagram; activation heat over time; step-through.
  - *Mutations*: diff from parent.
  - *Fitness trace*: line chart per generation; confidence shading.
- **Controls**: pause/play, time scale, reset seed, export/share, switch task, adjust EA params (safe bounds).
- **Accessibility**: keyboard nav, colorblind-safe palettes, reduced-motion mode, captions for tutorials.

---

## 13) Data Model (Top-level)
```
Run {
  id, seed, createdAt, version,
  settings: { task, populationSize, mutationRates, physics, time },
  generations: [ Generation {...} ],
  bestIndividuals: [ {gen, genomeHash, fitness, artifactPtr} ],
}

Generation {
  index, population: [ IndividualRef ], stats: { mean, max, min, std },
}

Individual {
  genome (morph+controller),
  fitness: {score, components, rngSeed},
  artifacts: { replay: binary, snapshot: json },
}
```

---

## 14) Determinism & Reproducibility
- Seed everything: EA sampling, mutation jitter, environment jitters.
- Version genomes with schemaID; include engine version in exports.
- Replay: store control outputs @ control Δt and physics external forces to guarantee identical playback even if physics diverges.

---

## 15) Performance Strategy
- **Parallel**: split population across workers; keep physics and controller updates entirely inside workers.
- **Memory**: SoA buffers for joint states; shared Float32Arrays for results.
- **WASM**: prefer Rapier WASM build; pool worlds to avoid reallocations.
- **Culling**: only render focus individual at full fidelity; others as low-poly or thumbnails.
- **Profiling**: in-app perf panel: ms/frame, heap, worker utilization.

---

## 16) Security & Privacy
- Cross-origin isolation for SharedArrayBuffer; strict CSP; no third-party iframes.
- Persist only local runs by default; opt-in for cloud/leaderboards.
- Sanitize shared JSON; validate versions; clamp parameters to avoid DoS via huge sims.

---

## 17) Accessibility & Internationalization
- Full keyboard support; semantic HTML wrappers over canvas; ARIA live regions for status.
- Reduced-motion and high-contrast themes.
- i18n with ICU message format; initial locales: EN + (add others as needed).

---

## 18) Risks & Mitigations
- **Non-deterministic physics** → Fixed-step, deterministic seeds, replay artifacts.
- **Slow evolution on mobile** → Lower population mode; cloud eval (future); precomputed showcase.
- **Brittle genomes** → Speciation, novelty, constrained mutators.
- **User confusion** → Guided presets, tooltips, tutorial run.

---

## 19) Testing Strategy
- **Unit**: genome ops, mutation invariants (no orphan limbs), controller math determinism.
- **Property tests**: constraints (no intersecting blocks; joint limits sane).
- **Golden tests**: replay checksums for known seeds across versions.
- **Perf tests**: population × steps benchmark CI; alert on regressions.
- **UX tests**: first-run funnel; a11y audit via axe.

---

## 20) Telemetry (Opt-in)
- Anonymized counters: task selections, avg gen count, crash reports, perf metrics.
- Never capture genomes or replays without explicit consent.

---

## 21) Deliverables & Milestones
**M0 – Spike (2 weeks)**
- Rapier in worker; single creature prototype; Three.js renderer; deterministic stepping.

**M1 – Minimal Evolution (3–4 weeks)**
- Genome (morph + simple CPG), mutation, selection; task: land locomotion; basic UI.

**M2 – Inspectors & Replays (3 weeks)**
- Brain/Genome inspectors; replay recording & deterministic playback; export/import.

**M3 – Tasks & Polish (3–5 weeks)**
- Add Jump & Push tasks; camera work; postFX; tutorial; presets.

**M4 – Sharing & Leaderboards (2 weeks)**
- Seeded challenges; web share links; optional server for submissions.

---

## 22) API/Module Interfaces (Sketch)
```ts
// engine/types.ts
export type Seed = number;
export interface EvolutionConfig {
  popSize: number; elitism: number; mutation: MutationRates; selection: SelectionCfg;
  task: TaskId; physics: PhysicsCfg; time: { simHz: number; ctrlHz: number };
}

export interface Genome { morph: MorphGenome; ctrl: CtrlGenome; version: string }
export interface Individual { id: number; genome: Genome; seed: Seed }

export interface FitnessResult {
  score: number; components: Record<string, number>; duration: number;
}

// engine/evolve.ts
export function evolveGen(pop: Individual[], cfg: EvolutionConfig, rng: PRNG): Promise<{pop: Individual[], stats: GenStats}>;

// sim/worker.ts (in Worker)
self.onmessage = (msg) => { /* receive batch of individuals, run sim, post FitnessResult[] + optional replays */ };
```

---

## 23) Visual Style Guide
- Calm neutral background, saturated creature colors.
- Soft shadows, rounded UI chips, monospace for code-like inspectors, light/dark themes.
- Motion language: ease-in-out 250ms; reduced-motion disables nonessential transitions.

---

## 24) Future Extensions
- **Soft bodies** via position-based dynamics (PBD) or Voxels + MPM (heavy).
- **Co-evolution** predator/prey & adversarial tasks.
- **Interactive selection** where users “like” phenotypes to bias fitness.
- **Neuroevolution upgrades**: HyperNEAT/CPPN for compositional symmetry; learned mutation schedules.
- **VR mode** via WebXR.

---

## 25) Open Questions
- Best compromise between Rapier determinism vs. performance across browsers?
- NEAT vs. CPPN for weight generation given in-browser constraints?
- How to sandbox user-shared genomes to avoid malicious payloads (size/time caps already help)?

---

## 26) Acceptance Criteria (V1)
- Start a fresh run, watch at least 50 generations evolve without crashes.
- Given a public seed `S` and config `C`, two users get fitness within ±1% on the top genome after 20 gens.
- Export/import produces identical replay checksums.
- Locomotion task produces mean distance ≥ 3m within 40 generations on a mid-range laptop.

---

## 27) Licensing & Credits
- Credit Karl Sims’ original 1994 work.
- Third-party libs under permissive licenses (MIT/Apache-2), list in About modal.

---

## 28) Appendix: Mutation Operators (Examples)
- **Morph**: add limb; delete terminal limb; resize limb (bounded factor 0.5–1.5); change joint axis; widen joint limits; flip mirror flag.
- **Ctrl**: add neuron; add connection; remove connection; jitter weight (Gaussian σ=0.1); change activation; tweak oscillator frequency/phase.
- **Rates (default)**: p(add-limb)=0.05; p(delete-limb)=0.02; p(resize)=0.10; p(add-conn)=0.1; p(weight-jitter)=0.2.

---

## 29) Appendix: Deterministic Replay Format (Sketch)
```
Replay {
  version,
  seed,
  dt_ctrl,
  frames: [ { t, jointTargets:[...], externalForces:[...] } ]
}
```

