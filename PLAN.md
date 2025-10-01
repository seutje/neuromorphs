
# AI-Agent Implementation Plan — Modern *Evolved Virtual Creatures* (Three.js, No-Build CDN Mode)
> Version: 2.0 • Format: Markdown with checkboxes • Audience: autonomous coding agents & human collaborators  
> **Key Difference**: Designed for zero-build environments. All dependencies (Three.js, Rapier WASM, UI libs) loaded from CDN. Project runs as plain HTML/JS/CSS without bundlers or transpilers.

---

## Phase 0 — Project Skeleton (No Build)
- [x] **P0-01: Basic HTML/JS/CSS Project Skeleton**
  - **Owner:** DevOps Agent
  - **Inputs:** None
  - **Outputs:** `index.html` in project root, `style.css`, `app.js` in `/public`
  - **DoD:** Opening `index.html` in browser runs placeholder app
  - **Dependencies:** —
- [x] **P0-02: Dependency Loading via CDN**
  - **Owner:** Platform Agent
  - **Inputs:** CDN URLs for Three.js, Rapier WASM, UI libs
  - **Outputs:** `<script type="module">` imports in `index.html`
  - **DoD:** Three.js and Rapier load in browser network tab
  - **Dependencies:** P0-01
- [x] **P0-03: Project Configuration (No Transpilation)**
  - **Owner:** Platform Agent
  - **Inputs:** ES Modules only
  - **Outputs:** Flat file tree structure; `README.md` with run instructions
  - **DoD:** No build tool required; runs in Firefox/Chrome latest
  - **Dependencies:** P0-01

---

## Phase 1 — Physics Core (CDN Rapier + Worker)
- [x] **P1-01: Load Rapier WASM from CDN**
  - **Owner:** Physics Agent
  - **Inputs:** `@dimforge/rapier3d-compat` CDN
  - **Outputs:** WASM initialized in Worker
  - **DoD:** Cube drop test shows gravity in console
  - **Dependencies:** P0-02
- [x] **P1-02: Worker Script with ES Modules**
  - **Owner:** Physics Agent
  - **Inputs:** `worker.js` as module worker
  - **Outputs:** Stepper running physics loop
  - **DoD:** Logs position updates from Worker
  - **Dependencies:** P1-01
- [ ] **P1-03: Shared Memory Protocol (optional)**
  - **Owner:** Platform Agent
  - **Inputs:** SharedArrayBuffer via COOP/COEP headers (local server required)
  - **Outputs:** Snapshot arrays passed from worker to main
  - **DoD:** Renderer reads transforms without blocking
  - **Dependencies:** P1-02
  - **Status:** Deferred until cross-origin isolation is required.

---

## Phase 2 — Genome & Morphology
- [ ] **P2-01: Morph Genome Schema (Plain JSON)**
  - **Owner:** Evolution Agent
  - **Outputs:** `morphGenome.js` exporting simple schema
  - **DoD:** JSON validated with inline functions
  - **Dependencies:** P0-03
- [ ] **P2-02: Instantiate Morphology → Physics Bodies**
  - **Owner:** Physics Agent
  - **Inputs:** Genome JSON
  - **Outputs:** Function `spawnCreature(genome)` in worker
  - **DoD:** Simple 2-block creature appears in simulation
  - **Dependencies:** P1-02, P2-01
- [ ] **P2-03: Morph Preview in Three.js**
  - **Owner:** UI Agent
  - **Inputs:** Genome JSON
  - **Outputs:** Three.js Meshes representing blocks
  - **DoD:** Preview grid shows 10+ morphs at 60fps
  - **Dependencies:** P2-01, P0-02

---

## Phase 3 — Controllers (Neurocontrollers)
- [ ] **P3-01: Controller Schema (JSON)**
  - **Owner:** Control Agent
  - **Outputs:** `ctrlGenome.js` with node/edge structure
  - **DoD:** Unit test: add node/edge, serialize, deserialize
  - **Dependencies:** P0-03
- [ ] **P3-02: Sensors in Physics Worker**
  - **Owner:** Physics Agent
  - **Inputs:** Physics state
  - **Outputs:** JSON sensor data (angles, velocities, contacts)
  - **DoD:** Console logs stable sensor outputs
  - **Dependencies:** P1-02
- [ ] **P3-03: Controller Runtime**
  - **Owner:** Control Agent
  - **Inputs:** Genome + Sensors
  - **Outputs:** Actuator commands per joint
  - **DoD:** Oscillatory movement visible in sim
  - **Dependencies:** P3-01, P3-02

---

## Phase 4 — Evolutionary Algorithm (EA)
- [ ] **P4-01: Simple EA Loop (Selection, Mutation, Evaluation)**
  - **Owner:** Evolution Agent
  - **Inputs:** JSON genomes
  - **Outputs:** Next-gen population
  - **DoD:** Runs 10 generations in <1min, logs fitness
  - **Dependencies:** P2, P3
- [ ] **P4-02: Mutation Functions**
  - **Owner:** Evolution Agent
  - **Outputs:** Add limb, resize block, jitter weight
  - **DoD:** Mutated genome passes schema validation
  - **Dependencies:** P2-01, P3-01
- [ ] **P4-03: Fitness Function (Locomotion)**
  - **Owner:** Task Agent
  - **Inputs:** COM displacement
  - **Outputs:** Fitness score
  - **DoD:** Faster movers score higher consistently
  - **Dependencies:** P3-03

---

## Phase 5 — UI/UX (Pure HTML/CSS/JS + CDN)
- [ ] **P5-01: Basic UI Panels**
  - **Owner:** UI Agent
  - **Inputs:** HTML templates
  - **Outputs:** Start button, progress bar, stats area
  - **DoD:** Run starts/stops via button
  - **Dependencies:** P0-01
- [ ] **P5-02: Creature Viewer**
  - **Owner:** UI Agent
  - **Inputs:** Renderer linked to simulation
  - **Outputs:** Follow-cam, orbit controls
  - **DoD:** Best creature visible in focus mode
  - **Dependencies:** P2-03, P1-03
- [ ] **P5-03: Config Controls**
  - **Owner:** UI Agent
  - **Inputs:** HTML forms
  - **Outputs:** Adjust mutation rates, pop size
  - **DoD:** Changes apply to next run
  - **Dependencies:** P4-01

---

## Phase 6 — Replays & Persistence (Local Only)
- [ ] **P6-01: Replay Recorder**
  - **Owner:** Orchestration Agent
  - **Inputs:** Control outputs
  - **Outputs:** ArrayBuffer of replay frames
  - **DoD:** Playback matches original run
  - **Dependencies:** P3-03
- [ ] **P6-02: Local Storage for Runs**
  - **Owner:** Platform Agent
  - **Outputs:** Save/load JSON of genomes + fitness
  - **DoD:** Reload page → run resumes
  - **Dependencies:** P4-01, P6-01

---

## Phase 7 — QA & Release
- [ ] **P7-01: Cross-Browser Test (Chrome, Firefox, Safari)**
  - **Owner:** QA Agent
  - **Outputs:** Report of compatibility issues
  - **DoD:** Works in all evergreen browsers
  - **Dependencies:** All prior phases
- [ ] **P7-02: Accessibility Pass**
  - **Owner:** UI Agent
  - **Outputs:** Keyboard controls, ARIA labels
  - **DoD:** Basic screen reader navigation
  - **Dependencies:** P5
- [ ] **P7-03: Documentation**
  - **Owner:** Docs Agent
  - **Outputs:** `README.md`, quickstart instructions
  - **DoD:** New user runs first evolution in <3 min
  - **Dependencies:** P0..P6

---

## Notes
- No build step: all ES modules must be supported directly in browser.
- If workers require cross-origin isolation (for SAB), serve via npm on port 8000 with headers.
- Performance goal: 128 creatures × 10s at near real-time on laptop.

