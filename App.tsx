import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Pause, FastForward, RefreshCw, Settings, Share2, Trophy, Activity, MousePointer2, PenTool, Brain, Box } from 'lucide-react';
import { Individual, GenerationStats, SimulationConfig, SceneType } from './types';
import { generateIndividual, evolvePopulation, setSeed, mutateGenome } from './services/genetics';
import { WorldView } from './components/WorldView';
import { StatsPanel } from './components/StatsPanel';
import { BrainVisualizer, MorphologyVisualizer } from './components/Visualizers';
import { SettingsPane } from './components/SettingsPane';
import { EditorCanvas } from './components/EditorCanvas';
import { EditorPropertiesPanel } from './components/EditorPropertiesPanel';
import { BrainEditorCanvas } from './components/BrainEditorCanvas';
import { BrainPropertiesPanel } from './components/BrainPropertiesPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { BlockNode, JointType, Genome, NodeType, NeuralNode, NeuralConnection } from './types';
import { findOpenPosition } from './services/brainLayout';

// Initial Config
const INITIAL_CONFIG: SimulationConfig = {
  populationSize: 250,
  mutationRate: 0.3,
  simulationSpeed: 10,
  epochDuration: 60, // Seconds
  task: 'LOCOMOTION',
  seed: Math.floor(Math.random() * 100000),
  scene: SceneType.EARTH
};

function App() {
  // Application State
  const [isPlaying, setIsPlaying] = useState(true);
  const [config, setConfig] = useState<SimulationConfig>(INITIAL_CONFIG);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'SIMULATION' | 'EDITOR'>('SIMULATION');
  const [editorMode, setEditorMode] = useState<'MORPHOLOGY' | 'BRAIN'>('MORPHOLOGY');
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Simulation Data
  const [generation, setGeneration] = useState(0);
  const [population, setPopulation] = useState<Individual[]>([]);
  const [editedGenome, setEditedGenome] = useState<Individual['genome'] | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [runId, setRunId] = useState(0);

  // Editor History State
  const [editHistory, setEditHistory] = useState<{ genome: Genome; description: string; timestamp: number }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Brain Editor History State
  const [brainEditHistory, setBrainEditHistory] = useState<{ genome: Genome; description: string; timestamp: number }[]>([]);
  const [brainHistoryIndex, setBrainHistoryIndex] = useState(0);

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
    setRunId(prev => prev + 1);
  };

  const handleSettingsApply = (newConfig: SimulationConfig) => {
    setConfig(newConfig);
    setIsSettingsOpen(false);
    setIsPlaying(true);
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

  const hasTriggeredGeneration = useRef(false);

  // Simulation Time Handler
  const handleTimeUpdate = useCallback((simTime: number) => {
    // Update UI Timer
    const remaining = Math.max(0, config.epochDuration - simTime);
    setTimeLeft(remaining);

    // Check Epoch End
    if (simTime >= config.epochDuration) {
      if (!hasTriggeredGeneration.current) {
        hasTriggeredGeneration.current = true;
        stepGeneration();
      }
    } else {
      hasTriggeredGeneration.current = false;
    }
  }, [config.epochDuration, stepGeneration]);

  // Game Loop Handler
  useEffect(() => {
    const animate = () => {
      // Just keep the loop running for rendering, but logic is now driven by worker updates
      requestRef.current = requestAnimationFrame(animate);
    };

    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(requestRef.current);
    }

    return () => {
      cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying]);

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

    // Initialize History
    const initialGenome = template ? JSON.parse(JSON.stringify(template.genome)) : generateIndividual(0, 0).genome;

    setEditedGenome(initialGenome);
    setEditHistory([{ genome: initialGenome, description: 'Initial State', timestamp: Date.now() }]);
    setHistoryIndex(0);
    setBrainEditHistory([{ genome: initialGenome, description: 'Initial Brain State', timestamp: Date.now() }]);
    setBrainHistoryIndex(0);

    setViewMode('EDITOR');
    setEditorMode('MORPHOLOGY');
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

      // Keep the first one exact, mutate the rest
      if (i > 0) {
        mutateGenome(ind.genome, config.mutationRate);
      }

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
    setRunId(prev => prev + 1);

    setViewMode('SIMULATION');
    setIsPlaying(true);
  };

  // Editor Handlers
  // History Helpers
  const addToHistory = (newGenome: Genome, description: string) => {
    const newEntry = { genome: newGenome, description, timestamp: Date.now() };
    const newHistory = editHistory.slice(0, historyIndex + 1);
    newHistory.push(newEntry);
    setEditHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setEditedGenome(newGenome);

    // Sync brain history start point if switching modes, or just let them diverge?
    // Requirement says: "edit history is separate".
    // But changes in morphology can affect brain (sensors/actuators).
    // For now, we will just update the current genome in both histories if needed, 
    // but the requirement implies two separate undo stacks.
    // To keep it simple and robust: When we switch modes, we might want to "commit" the state to the other stack?
    // Or just keep them completely independent but operating on the same object structure.
    // If I undo in morphology, it reverts the whole genome.
    // If I undo in brain, it reverts the whole genome.
    // This is the safest way.
  };

  const addToBrainHistory = (newGenome: Genome, description: string) => {
    const newEntry = { genome: newGenome, description, timestamp: Date.now() };
    const newHistory = brainEditHistory.slice(0, brainHistoryIndex + 1);
    newHistory.push(newEntry);
    setBrainEditHistory(newHistory);
    setBrainHistoryIndex(newHistory.length - 1);
    setEditedGenome(newGenome);
  };

  const handleUndo = () => {
    if (editorMode === 'MORPHOLOGY') {
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setEditedGenome(editHistory[newIndex].genome);
      }
    } else {
      if (brainHistoryIndex > 0) {
        const newIndex = brainHistoryIndex - 1;
        setBrainHistoryIndex(newIndex);
        setEditedGenome(brainEditHistory[newIndex].genome);
      }
    }
  };

  const handleRedo = () => {
    if (editorMode === 'MORPHOLOGY') {
      if (historyIndex < editHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setEditedGenome(editHistory[newIndex].genome);
      }
    } else {
      if (brainHistoryIndex < brainEditHistory.length - 1) {
        const newIndex = brainHistoryIndex + 1;
        setBrainHistoryIndex(newIndex);
        setEditedGenome(brainEditHistory[newIndex].genome);
      }
    }
  };

  const handleJumpToHistory = (index: number) => {
    if (editorMode === 'MORPHOLOGY') {
      setHistoryIndex(index);
      setEditedGenome(editHistory[index].genome);
    } else {
      setBrainHistoryIndex(index);
      setEditedGenome(brainEditHistory[index].genome);
    }
  };

  const addActuatorForBlock = (genome: Genome, blockId: number): Genome => {
    const actuatorId = `a${blockId}`;
    const actuatorExists = genome.brain.nodes.some(n => n.id === actuatorId);
    if (actuatorExists) return genome;

    const actuatorCount = genome.brain.nodes.filter(n => n.type === NodeType.ACTUATOR).length;
    const newTotal = actuatorCount + 1;
    const newActuator: NeuralNode = {
      id: actuatorId,
      type: NodeType.ACTUATOR,
      label: `Joint ${blockId}`,
      activation: 0,
      x: 0.9,
      y: 0.2 + ((actuatorCount + 1) / (newTotal + 1)) * 0.6
    };

    const candidateSources = genome.brain.nodes.filter(n => n.type !== NodeType.ACTUATOR);
    const newConnections = [...genome.brain.connections];
    if (candidateSources.length > 0) {
      const source = candidateSources[Math.floor(Math.random() * candidateSources.length)];
      newConnections.push({
        source: source.id,
        target: actuatorId,
        weight: Math.random() * 2 - 1
      });
    }

    return {
      ...genome,
      brain: {
        nodes: [...genome.brain.nodes, newActuator],
        connections: newConnections
      }
    };
  };

  const removeActuatorsForBlocks = (genome: Genome, blockIds: Set<number>): Genome => {
    const actuatorIds = new Set(Array.from(blockIds).map(id => `a${id}`));
    const filteredNodes = genome.brain.nodes.filter(n => !actuatorIds.has(n.id));
    const filteredConnections = genome.brain.connections.filter(
      c => !actuatorIds.has(c.source) && !actuatorIds.has(c.target)
    );

    return {
      ...genome,
      brain: {
        nodes: filteredNodes,
        connections: filteredConnections
      }
    };
  };

  const handleUpdateBlock = (blockId: number, updates: Partial<BlockNode>) => {
    if (!editedGenome) return;
    const newMorphology = editedGenome.morphology.map(b =>
      b.id === blockId ? { ...b, ...updates } : b
    );
    const newGenome = { ...editedGenome, morphology: newMorphology };
    addToHistory(newGenome, `Updated Block ${blockId}`);
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

    let newGenome = { ...editedGenome, morphology: [...editedGenome.morphology, newBlock] };
    newGenome = addActuatorForBlock(newGenome, newId);
    addToHistory(newGenome, 'Added Child Block');
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
    let newGenome = { ...editedGenome, morphology: newMorphology };
    newGenome = removeActuatorsForBlocks(newGenome, toDelete);
    addToHistory(newGenome, 'Deleted Block');
    setSelectedBlockId(null);
    const removedActuators = new Set(Array.from(toDelete).map(id => `a${id}`));
    if (selectedNodeId && removedActuators.has(selectedNodeId)) {
      setSelectedNodeId(null);
    }
  };

  const handleLoadPreset = (presetGenome: Genome) => {
    const cloned = JSON.parse(JSON.stringify(presetGenome));
    addToHistory(cloned, 'Loaded Preset');
    setSelectedBlockId(null);
    // Also reset brain history when loading a full preset
    setBrainEditHistory([{ genome: cloned, description: 'Loaded Preset', timestamp: Date.now() }]);
    setBrainHistoryIndex(0);
  };

  // Brain Editor Handlers
  const handleAddBrainNode = (type: NodeType, label: string) => {
    if (!editedGenome) return;
    const { x, y } = findOpenPosition(editedGenome.brain.nodes);
    const newNode: NeuralNode = {
      id: `node_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      type,
      label,
      activation: 0,
      x,
      y
    };

    const newBrain = {
      ...editedGenome.brain,
      nodes: [...editedGenome.brain.nodes, newNode]
    };
    const newGenome = { ...editedGenome, brain: newBrain };
    addToBrainHistory(newGenome, `Added Node: ${label}`);
    setSelectedNodeId(newNode.id);
  };

  const handleDeleteBrainNode = (id: string) => {
    if (!editedGenome) return;
    const newNodes = editedGenome.brain.nodes.filter(n => n.id !== id);
    const newConnections = editedGenome.brain.connections.filter(c => c.source !== id && c.target !== id);

    const newBrain = {
      nodes: newNodes,
      connections: newConnections
    };
    const newGenome = { ...editedGenome, brain: newBrain };
    addToBrainHistory(newGenome, 'Deleted Node');
    setSelectedNodeId(null);
  };

  const handleUpdateConnection = (source: string, target: string, weight: number) => {
    if (!editedGenome) return;
    const newConnections = editedGenome.brain.connections.map(c =>
      (c.source === source && c.target === target) ? { ...c, weight } : c
    );
    const newBrain = { ...editedGenome.brain, connections: newConnections };
    const newGenome = { ...editedGenome, brain: newBrain };
    addToBrainHistory(newGenome, 'Updated Connection');
  };

  const handleAddConnection = (source: string, target: string) => {
    if (!editedGenome) return;

    // Validate target is not Sensor or Oscillator
    const targetNode = editedGenome.brain.nodes.find(n => n.id === target);
    if (targetNode && (targetNode.type === NodeType.SENSOR || targetNode.type === NodeType.OSCILLATOR)) {
      console.warn("Cannot connect to a Sensor or Oscillator");
      return;
    }

    const newConn: NeuralConnection = {
      source,
      target,
      weight: Math.random() * 2 - 1
    };
    const newBrain = {
      ...editedGenome.brain,
      connections: [...editedGenome.brain.connections, newConn]
    };
    const newGenome = { ...editedGenome, brain: newBrain };
    addToBrainHistory(newGenome, 'Added Connection');
  };

  const handleDeleteConnection = (source: string, target: string) => {
    if (!editedGenome) return;
    const newConnections = editedGenome.brain.connections.filter(c =>
      !(c.source === source && c.target === target)
    );
    const newBrain = { ...editedGenome.brain, connections: newConnections };
    const newGenome = { ...editedGenome, brain: newBrain };
    addToBrainHistory(newGenome, 'Deleted Connection');
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
            <span className="text-xs ml-2 font-normal text-slate-500 px-2 py-0.5 border border-slate-800 rounded-full">v1.0.5</span>
          </h1>
        </div>

        <div className="hidden lg:flex items-center gap-3">
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
          <div className="flex-1 min-h-[calc(45vh-64px)] bg-slate-900 rounded-xl border border-slate-800 relative flex flex-col group">
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
                  onTimeUpdate={handleTimeUpdate}
                  config={config}
                  runId={runId}
                />

                {/* Hint overlay */}
                <div className="absolute top-4 left-4 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="bg-slate-950/50 backdrop-blur text-xs text-slate-400 px-2 py-1 rounded border border-slate-800 flex items-center gap-2">
                    <MousePointer2 className="w-3 h-3" />
                    <span>Click creature to track • Drag to rotate • Scroll to zoom</span>
                  </div>
                </div>

                {/* Playback Controls Overlay */}
                <div className="absolute bottom-6 left-1/2 opacity-0 group-hover:opacity-100 transition-opacity -translate-x-1/2 bg-slate-950/90 border border-slate-700 rounded-full px-6 py-3 flex items-center gap-6 shadow-2xl backdrop-blur-md z-20">
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
                editorMode === 'MORPHOLOGY' ? (
                  <EditorCanvas
                    genome={editedGenome}
                    selectedBlockId={selectedBlockId}
                    onSelectBlock={setSelectedBlockId}
                    onLoadPreset={handleLoadPreset}
                  />
                ) : (
                  <BrainEditorCanvas
                    genome={editedGenome}
                    selectedNodeId={selectedNodeId}
                    onSelectNode={setSelectedNodeId}
                  />
                )
              )
            )}
          </div>

          {/* Charts Panel or History Panel */}
          {!isMobile && (
            <div className="hidden lg:block h-64 bg-slate-900 rounded-xl border border-slate-800 p-4 shadow-lg">
              {viewMode === 'SIMULATION' ? (
                <StatsPanel history={history} />
              ) : (
                <HistoryPanel
                  history={editorMode === 'MORPHOLOGY' ? editHistory : brainEditHistory}
                  currentIndex={editorMode === 'MORPHOLOGY' ? historyIndex : brainHistoryIndex}
                  onUndo={handleUndo}
                  onRedo={handleRedo}
                  onJumpTo={handleJumpToHistory}
                />
              )}
            </div>
          )}
        </div>

        {/* Right Column: Inspectors (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4 h-full overflow-y-auto pr-2 custom-scrollbar">

          {/* Selected Creature Card OR Editor Properties */}
          {viewMode === 'EDITOR' && editedGenome ? (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 shadow-lg flex-1 overflow-hidden flex flex-col">

              {/* Editor Mode Toggle */}
              <div className="flex gap-2 mb-4 bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  onClick={() => setEditorMode('MORPHOLOGY')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${editorMode === 'MORPHOLOGY'
                    ? 'bg-slate-800 text-emerald-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                    }`}
                >
                  <Box className="w-4 h-4" />
                  Morphology
                </button>
                <button
                  onClick={() => setEditorMode('BRAIN')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${editorMode === 'BRAIN'
                    ? 'bg-slate-800 text-emerald-400 shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                    }`}
                >
                  <Brain className="w-4 h-4" />
                  Brain
                </button>
              </div>

              {editorMode === 'MORPHOLOGY' ? (
                <EditorPropertiesPanel
                  genome={editedGenome}
                  selectedBlockId={selectedBlockId}
                  onUpdateBlock={handleUpdateBlock}
                  onAddChild={handleAddChild}
                  onDeleteBlock={handleDeleteBlock}
                  onStartSimulation={handleStartSimulationFromEditor}
                />
              ) : (
                <BrainPropertiesPanel
                  genome={editedGenome}
                  selectedNodeId={selectedNodeId}
                  onAddNode={handleAddBrainNode}
                  onDeleteNode={handleDeleteBrainNode}
                  onUpdateConnection={handleUpdateConnection}
                  onAddConnection={handleAddConnection}
                  onDeleteConnection={handleDeleteConnection}
                />
              )}
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
