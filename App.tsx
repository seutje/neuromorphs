
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Pause, FastForward, RefreshCw, Settings, Share2, Trophy, Activity, MousePointer2, PenTool } from 'lucide-react';
import { Individual, GenerationStats, SimulationConfig } from './types';
import { generateIndividual, evolvePopulation, setSeed } from './services/genetics';
import { WorldView } from './components/WorldView';
import { StatsPanel } from './components/StatsPanel';
import { BrainVisualizer, MorphologyVisualizer } from './components/Visualizers';
import { SettingsPane } from './components/SettingsPane';
import { EditorCanvas } from './components/EditorCanvas';
import { EditorPropertiesPanel } from './components/EditorPropertiesPanel';
import { BlockNode, JointType } from './types';

// Initial Config
const INITIAL_CONFIG: SimulationConfig = {
  populationSize: 250,
  mutationRate: 0.3,
  simulationSpeed: 10,
  epochDuration: 60, // Seconds
  task: 'LOCOMOTION',
  seed: Math.floor(Math.random() * 100000),
};

function App() {
  // Application State
  const [isPlaying, setIsPlaying] = useState(true);
  const [config, setConfig] = useState<SimulationConfig>(INITIAL_CONFIG);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'SIMULATION' | 'EDITOR'>('SIMULATION');

  // Simulation Data
  const [generation, setGeneration] = useState(0);
  const [population, setPopulation] = useState<Individual[]>([]);
  const [editedGenome, setEditedGenome] = useState<Individual['genome'] | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null);

  // Tracking State
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bestIndividual, setBestIndividual] = useState<Individual | null>(null);

  const [history, setHistory] = useState<GenerationStats[]>([]);

  // Timer State
  const [timeLeft, setTimeLeft] = useState(INITIAL_CONFIG.epochDuration);

  // Refs for simulation loop
  const generationCounterRef = useRef(0);
  const lastFrameTimeRef = useRef<number>(0);
  const epochTimeAccumulatorRef = useRef<number>(0);
  const requestRef = useRef<number>(0);
  const lastTimerUpdateRef = useRef<number>(0);

  // Derived State
  const selectedIndividual = population.find(p => p.id === selectedId) || null;

  // Initialize Simulation
  useEffect(() => {
    startRun(INITIAL_CONFIG);
  }, []);

  const startRun = (runConfig: SimulationConfig) => {
    // SEED THE RNG
    setSeed(runConfig.seed);

    const initialPop: Individual[] = [];
    for (let i = 0; i < runConfig.populationSize; i++) {
      initialPop.push(generateIndividual(0, i));
    }
    setPopulation(initialPop);
    setBestIndividual(initialPop[0]);
    setSelectedId(initialPop[0].id);
    setGeneration(0);
    setHistory([]);
    setTimeLeft(runConfig.epochDuration);

    // Reset Refs
    generationCounterRef.current = 0;
    lastFrameTimeRef.current = Date.now();
    epochTimeAccumulatorRef.current = 0;
    lastTimerUpdateRef.current = Date.now();
  };

  const handleSettingsApply = (newConfig: SimulationConfig) => {
    setConfig(newConfig);
    setIsSettingsOpen(false);
    setIsPlaying(false);
    startRun(newConfig);
  };

  // Fitness Callback from Physics Engine
  const handleFitnessUpdate = useCallback((fitnessMap: Record<string, number>) => {
    setPopulation(prevPop => {
      let changed = false;
      const newPop = prevPop.map(ind => {
        const newFit = fitnessMap[ind.id];
        if (newFit !== undefined && Math.abs(newFit - ind.fitness) > 0.001) {
          changed = true;
          return { ...ind, fitness: newFit };
        }
        return ind;
      });
      return changed ? newPop : prevPop;
    });
  }, []);

  // Evolution Loop
  const stepGeneration = useCallback(() => {
    setPopulation(prevPop => {
      const currentGen = generationCounterRef.current;

      // Run Evolution Service
      const { newPop, stats } = evolvePopulation(prevPop, currentGen, config.mutationRate);

      // Update History
      setHistory(prev => [
        ...prev,
        {
          generation: currentGen,
          maxFitness: stats.max,
          avgFitness: stats.avg,
          speciesCount: 4
        }
      ].slice(-50));

      const best = prevPop.reduce((prev, current) => (prev.fitness > current.fitness) ? prev : current);
      setBestIndividual(best);

      if (newPop.length > 0) {
        setSelectedId(newPop[0].id);
      }

      generationCounterRef.current += 1;
      setGeneration(generationCounterRef.current);

      return newPop;
    });
  }, [config.mutationRate]);

  // Game Loop Handler
  useEffect(() => {
    const animate = () => {
      const now = Date.now();
      let dt = now - lastFrameTimeRef.current;

      // Prevent huge jumps if tab was inactive or just started
      if (dt > 500) dt = 16;

      lastFrameTimeRef.current = now;

      // Calculate simulated time delta (in seconds)
      const dtSeconds = dt / 1000;
      const simDt = dtSeconds * config.simulationSpeed;

      epochTimeAccumulatorRef.current += simDt;

      // Update UI Timer (throttled)
      if (now - lastTimerUpdateRef.current > 100) {
        const remaining = Math.max(0, config.epochDuration - epochTimeAccumulatorRef.current);
        setTimeLeft(remaining);
        lastTimerUpdateRef.current = now;
      }

      // Check Epoch End
      if (epochTimeAccumulatorRef.current >= config.epochDuration) {
        stepGeneration();
        epochTimeAccumulatorRef.current = 0;
        setTimeLeft(config.epochDuration);
      }

      requestRef.current = requestAnimationFrame(animate);
    };

    if (isPlaying) {
      lastFrameTimeRef.current = Date.now();
      lastTimerUpdateRef.current = Date.now();
      requestRef.current = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(requestRef.current);
    }

    return () => {
      cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, config.simulationSpeed, config.epochDuration, stepGeneration]);

  const handleSpeedChange = () => {
    const speeds = [1, 2, 5, 10];
    const idx = speeds.indexOf(config.simulationSpeed);
    setConfig({ ...config, simulationSpeed: speeds[(idx + 1) % speeds.length] });
  };

  const handleCreatureSelect = (id: string) => {
    setSelectedId(id);
  };

  const handleEnterEditor = () => {
    setIsPlaying(false);
    // If we have a selected creature, edit that one, otherwise use the best, or generate a new one
    const template = selectedIndividual || bestIndividual || population[0];
    if (template) {
      // Deep clone to avoid mutating simulation state directly
      setEditedGenome(JSON.parse(JSON.stringify(template.genome)));
    } else {
      // Fallback if population is empty (shouldn't happen usually)
      setEditedGenome(generateIndividual(0, 0).genome);
    }
    setViewMode('EDITOR');
  };

  const handleStartSimulationFromEditor = () => {
    if (!editedGenome) return;

    // Create a config for the new run
    const runConfig = { ...config, seed: Math.floor(Math.random() * 10000) }; // New seed for variety

    // Custom start run logic for edited creature
    setSeed(runConfig.seed);

    const initialPop: Individual[] = [];
    for (let i = 0; i < runConfig.populationSize; i++) {
      // Create individuals based on the edited genome
      // We can add slight mutations here if we want diversity, or keep them identical
      const ind = generateIndividual(0, i);
      ind.genome = JSON.parse(JSON.stringify(editedGenome)); // Clone the edited genome
      // Optionally mutate slightly:
      // mutate(ind.genome, config.mutationRate); 
      initialPop.push(ind);
    }

    setPopulation(initialPop);
    setBestIndividual(initialPop[0]);
    setSelectedId(initialPop[0].id);
    setGeneration(0);
    setHistory([]);
    setTimeLeft(runConfig.epochDuration);

    // Reset Refs
    generationCounterRef.current = 0;
    lastFrameTimeRef.current = Date.now();
    epochTimeAccumulatorRef.current = 0;
    lastTimerUpdateRef.current = Date.now();

    setViewMode('SIMULATION');
  };

  // Editor Handlers
  const handleUpdateBlock = (blockId: number, updates: Partial<BlockNode>) => {
    if (!editedGenome) return;
    const newMorphology = editedGenome.morphology.map(b =>
      b.id === blockId ? { ...b, ...updates } : b
    );
    setEditedGenome({ ...editedGenome, morphology: newMorphology });
  };

  const handleAddChild = (parentId: number, face: number) => {
    if (!editedGenome) return;
    const newId = Math.max(...editedGenome.morphology.map(b => b.id)) + 1;

    // Randomize Properties (Tuned to match default generation)
    const randomSize = () => 0.4 + Math.random() * 0.4; // 0.4 to 0.8 (more controlled)
    const randomColor = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
    const randomJointType = Math.random() > 0.6 ? JointType.REVOLUTE : JointType.SPHERICAL; // Bias towards Revolute
    const randomSpeed = 2 + Math.random() * 4; // 2 to 6
    const randomPhase = Math.random() * Math.PI * 2;
    const randomAmp = 0.5 + Math.random() * 0.5; // 0.5 to 1.0

    const newBlock: BlockNode = {
      id: newId,
      size: [randomSize(), randomSize(), randomSize()],
      color: randomColor,
      parentId: parentId,
      attachFace: face,
      jointType: randomJointType,
      jointParams: { speed: randomSpeed, phase: randomPhase, amp: randomAmp }
    };

    setEditedGenome({ ...editedGenome, morphology: [...editedGenome.morphology, newBlock] });
    setSelectedBlockId(newId);
  };

  const handleDeleteBlock = (blockId: number) => {
    if (!editedGenome) return;
    // Recursive delete
    const toDelete = new Set<number>();
    const findChildren = (id: number) => {
      toDelete.add(id);
      editedGenome.morphology.filter(b => b.parentId === id).forEach(child => findChildren(child.id));
    };
    findChildren(blockId);

    const newMorphology = editedGenome.morphology.filter(b => !toDelete.has(b.id));
    setEditedGenome({ ...editedGenome, morphology: newMorphology });
    setSelectedBlockId(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-emerald-500/30">

      <SettingsPane
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        onApply={handleSettingsApply}
      />

      {/* Header */}
      <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-950/50 backdrop-blur sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Activity className="text-emerald-400 w-6 h-6" />
          <h1 className="text-xl font-bold tracking-tight text-white">
            Neuro<span className="text-emerald-400">Morphs</span>
            <span className="text-xs ml-2 font-normal text-slate-500 px-2 py-0.5 border border-slate-800 rounded-full">v1.0.2</span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <h2 className="text-md font-bold tracking-tight text-white">
            Inspired by <a href="https://www.karlsims.com/evolved-virtual-creatures.html" target="_blank" className="text-emerald-400">Karl Sims</a>
          </h2>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-6 mr-8 text-sm font-mono text-slate-400">
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-widest opacity-50">Seed</span>
              <span className="text-white font-bold text-lg">{config.seed}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-widest opacity-50">Generation</span>
              <span className="text-white font-bold text-lg">{generation}</span>
            </div>
            <div className="flex flex-col items-end w-24">
              <span className="text-[10px] uppercase tracking-widest opacity-50">Next Epoch</span>
              <span className="text-emerald-400 font-bold text-lg text-right">{timeLeft.toFixed(1)}s</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-widest opacity-50">Population</span>
              <span className="text-white font-bold text-lg">{population.length}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-widest opacity-50">Max Fitness</span>
              <span className="text-emerald-400 font-bold text-lg">{bestIndividual?.fitness.toFixed(2) || '0.00'}m</span>
            </div>
          </div>

          <button
            onClick={handleEnterEditor}
            className={`p-2 hover:bg-slate-800 rounded-full transition-colors ${viewMode === 'EDITOR' ? 'text-emerald-400 bg-slate-800' : 'text-slate-400 hover:text-white'}`}
            title="Creature Editor"
          >
            <PenTool className="w-5 h-5" />
          </button>

          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white transition-colors"
            title="Simulation Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Grid Layout */}
      <main className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 h-[calc(100vh-64px)] overflow-hidden">

        {/* Left Column: Viewport & Timeline (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-6 h-full overflow-y-auto lg:overflow-hidden">

          {/* 3D Viewport Container */}
          <div className="flex-1 min-h-[400px] bg-slate-900 rounded-xl border border-slate-800 relative flex flex-col group">
            {viewMode === 'SIMULATION' ? (
              <>
                <WorldView
                  population={population}
                  selectedId={selectedId}
                  onSelectId={handleCreatureSelect}
                  onFitnessUpdate={handleFitnessUpdate}
                  simulationSpeed={config.simulationSpeed}
                  isPlaying={isPlaying}
                  generation={generation}
                />

                {/* Hint overlay */}
                <div className="absolute top-4 left-4 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="bg-slate-950/50 backdrop-blur text-xs text-slate-400 px-2 py-1 rounded border border-slate-800 flex items-center gap-2">
                    <MousePointer2 className="w-3 h-3" />
                    <span>Click creature to track • Drag to rotate • Scroll to zoom</span>
                  </div>
                </div>

                {/* Playback Controls Overlay */}
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-slate-950/90 border border-slate-700 rounded-full px-6 py-3 flex items-center gap-6 shadow-2xl backdrop-blur-md z-20">
                  <button
                    onClick={() => {
                      startRun(config);
                      setIsPlaying(false);
                    }}
                    className="text-slate-400 hover:text-white transition-transform hover:scale-110"
                    title="Reset"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>

                  <button
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="bg-white text-slate-950 w-12 h-12 rounded-full flex items-center justify-center hover:bg-emerald-400 transition-all shadow-lg hover:shadow-emerald-500/50"
                  >
                    {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
                  </button>

                  <button
                    onClick={handleSpeedChange}
                    className="text-slate-400 hover:text-white flex items-center gap-1 font-mono text-sm font-bold w-12"
                  >
                    <FastForward className="w-4 h-4" />
                    {config.simulationSpeed}x
                  </button>
                </div>
              </>
            ) : (
              editedGenome && (
                <EditorCanvas
                  genome={editedGenome}
                  selectedBlockId={selectedBlockId}
                  onSelectBlock={setSelectedBlockId}
                />
              )
            )}
          </div>

          {/* Charts Panel */}
          <div className="h-64 bg-slate-900 rounded-xl border border-slate-800 p-4 shadow-lg">
            <StatsPanel history={history} />
          </div>
        </div>

        {/* Right Column: Inspectors (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4 h-full overflow-y-auto pr-2 custom-scrollbar">

          {/* Selected Creature Card OR Editor Properties */}
          {viewMode === 'EDITOR' && editedGenome ? (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 shadow-lg flex-1 overflow-hidden">
              <EditorPropertiesPanel
                genome={editedGenome}
                selectedBlockId={selectedBlockId}
                onUpdateBlock={handleUpdateBlock}
                onAddChild={handleAddChild}
                onDeleteBlock={handleDeleteBlock}
                onStartSimulation={handleStartSimulationFromEditor}
              />
            </div>
          ) : (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 shadow-lg">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-slate-100 font-semibold flex items-center gap-2">
                    {selectedIndividual?.id === bestIndividual?.id && <Trophy className="w-4 h-4 text-yellow-500" />}
                    {selectedIndividual?.id === bestIndividual?.id ? 'Dominant Species' : 'Selected Specimen'}
                  </h2>
                  <p className="text-slate-500 text-xs font-mono mt-1">
                    ID: {selectedIndividual?.id || 'PENDING...'}
                  </p>
                </div>
                {selectedIndividual && (
                  <span className={`text-xs px-2 py-1 rounded border font-mono ${selectedIndividual.id === bestIndividual?.id
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                    {selectedIndividual.id === bestIndividual?.id ? 'Leader' : 'Tracking'}
                  </span>
                )}
              </div>

              {/* Inspectors */}
              {selectedIndividual && (
                <div className="space-y-4">
                  <MorphologyVisualizer genome={selectedIndividual.genome} />
                  <BrainVisualizer genome={selectedIndividual.genome} active={isPlaying} />

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-950 p-3 rounded border border-slate-800">
                      <div className="text-[10px] uppercase text-slate-500 font-bold">Block Count</div>
                      <div className="text-xl text-white font-mono">{selectedIndividual.genome.morphology.length}</div>
                    </div>
                    <div className="bg-slate-950 p-3 rounded border border-slate-800">
                      <div className="text-[10px] uppercase text-slate-500 font-bold">Brain Size</div>
                      <div className="text-xl text-white font-mono">
                        {selectedIndividual.genome.brain.nodes.length}N / {selectedIndividual.genome.brain.connections.length}C
                      </div>
                    </div>
                    <div className="col-span-2 bg-slate-950 p-3 rounded border border-slate-800">
                      <div className="text-[10px] uppercase text-slate-500 font-bold">Current Fitness</div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-xl text-white font-mono transition-all">{selectedIndividual.fitness.toFixed(2)}</span>
                        <span className="text-xs text-slate-500">meters</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!selectedIndividual && (
                <div className="h-48 flex items-center justify-center text-slate-600 text-sm">
                  Initialize simulation to view data
                </div>
              )}
            </div>
          )}

          {/* Leaderboard / Previous Runs */}
          {viewMode === 'SIMULATION' && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 flex-1 min-h-[200px]">
              <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider mb-4">
                Leaderboard (Live)
              </h3>
              <div className="space-y-2">
                {[...population]
                  .sort((a, b) => b.fitness - a.fitness)
                  .slice(0, 3)
                  .map((ind, rank) => (
                    <div
                      key={ind.id}
                      onClick={() => handleCreatureSelect(ind.id)}
                      className={`flex items-center justify-between p-2 rounded border transition-colors cursor-pointer group ${ind.id === selectedId ? 'bg-slate-800 border-slate-600' : 'bg-slate-950/50 border-slate-800/50 hover:border-slate-700'
                        }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`font-mono text-xs w-6 h-6 flex items-center justify-center rounded-full ${rank === 0 ? 'bg-yellow-500/20 text-yellow-500' : 'bg-slate-800 text-slate-400'}`}>
                          #{rank + 1}
                        </span>
                        <div className="flex flex-col">
                          <span className="text-xs text-slate-300 font-mono group-hover:text-emerald-400 transition-colors truncate w-24">
                            {ind.id}
                          </span>
                        </div>
                      </div>
                      <span className="font-mono text-sm text-emerald-500">
                        {ind.fitness.toFixed(2)}m
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}

export default App;
