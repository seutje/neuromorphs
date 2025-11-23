# NeuroMorphs

**NeuroMorphs** is a browser-based evolution simulation inspired by Karl Sims' "Evolved Virtual Creatures". It uses a genetic algorithm to evolve 3D block-based creatures that learn to walk, run, or crawl within a physics simulation.

## 🚀 Getting Started

### Prerequisites
- **Node.js** (v16 or higher)

### Installation & Running

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Start the development server:**
    ```bash
    npm run dev
    ```

3.  **Open your browser:**
    Navigate to `http://localhost:5173` (or the URL shown in your terminal).

---

## 🧠 How It Works

NeuroMorphs combines three core systems: **Morphology Generation**, **Physics Simulation**, and **Evolutionary Optimization**.

### 1. Creature Morphology (Genotype)
Each creature is defined by a **Genome** which acts as a blueprint for its body and control system.
- **Recursive Block Structure**: Creatures start with a root block. Child blocks are recursively attached to the faces (X, Y, Z) of parent blocks.
- **Joints**: Blocks are connected via physical joints.
    - **Revolute Joints**: Hinge-like movement (1 Degree of Freedom).
    - **Spherical Joints**: Ball-and-socket movement (3 Degrees of Freedom).
- **Genetics**: Properties like block size, color, joint type, and motor limits are encoded in the genome and subject to mutation.

### 2. Physics Simulation (Phenotype)
The simulation is powered by **Rapier3D** (via `@dimforge/rapier3d-compat`) and rendered with **Three.js**.
- **Rigid Body Dynamics**: Each block is a dynamic rigid body with mass, friction, and restitution.
- **Neural Network Control**: Joints are driven by a **Recurrent Neural Network (RNN)** evolved alongside the morphology.
    - **Sensors (Inputs)**:
        - **Ground Contact**: Detects if the creature is touching the floor.
        - **Joint Angle**: Proprioception of current joint angles.
        - **Velocity**: Forward velocity sensing.
        - **Oscillator**: A central clock signal (`sin(time)`) to enable rhythmic behavior.
    - **Brain Architecture**: A graph of neurons and synapses with `tanh` activation functions. The network topology (nodes & connections) is evolved.
    - **Actuators (Outputs)**: Output neurons drive the target angle of each joint.
    - *Fallback*: If no neural output is present for a joint, it falls back to a simple sine-wave oscillator.

### 3. Evolutionary Algorithm
The system uses a standard genetic algorithm to optimize creatures for **Locomotion** (distance traveled).

1.  **Population Initialization**: A random population of creatures is generated with random morphologies and motor parameters.
2.  **Evaluation (The Epoch)**:
    - All creatures are simulated simultaneously in parallel lanes.
    - **Fitness Function**: $Fitness = Max(Position_X)$. Creatures that move further along the track get higher scores.
    - **Disqualification**: Creatures that explode (velocity > threshold) or fall off the map are penalized.
3.  **Selection & Reproduction**:
    - **Elitism**: The top 10% of performers are copied directly to the next generation.
    - **Tournament Selection**: Two random creatures are picked, and the better one becomes a parent.
    - **Mutation**: Offspring genomes are mutated:
        - *Parameter Mutation*: Tweaking joint speed, phase, or block size.
        - *Structural Mutation*: Adding or removing blocks (growth/pruning).
4.  **Next Generation**: The new population replaces the old one, and the cycle repeats.

---

## 🛠️ Tech Stack

- **Frontend Framework**: React (Vite)
- **3D Rendering**: Three.js / React Three Fiber concepts (implemented in vanilla Three.js for performance)
- **Physics Engine**: Rapier3D (WASM-based for high performance)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React

## 📂 Project Structure

- `components/WorldView.tsx`: The core simulation loop. Handles Three.js scene setup, Rapier physics stepping, and synchronizing visuals with physics bodies.
- `services/genetics.ts`: Contains the genetic algorithm logic (crossover, mutation, genome generation).
- `types.ts`: TypeScript definitions for Genomes, Individuals, and Neural Networks.
