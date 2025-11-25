import React, { useState } from 'react';
import { Genome, BlockNode, JointType, NodeType, NeuralNode } from '../types';
import { EditorCanvas } from './EditorCanvas';
import { EditorPropertiesPanel } from './EditorPropertiesPanel';

interface EditorViewProps {
  genome: Genome;
  onUpdateGenome: (genome: Genome) => void;
  onStartSimulation: () => void;
}

export const EditorView: React.FC<EditorViewProps> = ({ genome, onUpdateGenome, onStartSimulation }) => {
  const [selectedBlockId, setSelectedBlockId] = useState<number | null>(null);

  const handleUpdateBlock = (blockId: number, updates: Partial<BlockNode>) => {
    const newMorphology = genome.morphology.map(b =>
      b.id === blockId ? { ...b, ...updates } : b
    );
    onUpdateGenome({ ...genome, morphology: newMorphology });
  };

  const handleAddChild = (parentId: number, face: number) => {
    const newId = Math.max(...genome.morphology.map(b => b.id)) + 1;
    const newBlock: BlockNode = {
      id: newId,
      size: [1, 1, 1],
      color: '#34d399', // Emerald-400 default
      parentId: parentId,
      attachFace: face,
      rotation: [0, 0, 0],
      jointType: JointType.REVOLUTE,
      jointParams: { speed: 5, phase: 0, amp: 1.0 }
    };

    const actuatorId = `a${newId}`;
    const actuatorExists = genome.brain.nodes.some(n => n.id === actuatorId);
    const actuatorCount = genome.brain.nodes.filter(n => n.type === NodeType.ACTUATOR).length;
    const newActuator: NeuralNode = {
      id: actuatorId,
      type: NodeType.ACTUATOR,
      label: `Joint ${newId}`,
      activation: 0,
      x: 0.9,
      y: 0.2 + ((actuatorCount + 1) / (actuatorCount + 2)) * 0.6
    };

    const candidateSources = genome.brain.nodes.filter(n => n.type !== NodeType.ACTUATOR);
    const newConnections = [...genome.brain.connections];
    if (!actuatorExists && candidateSources.length > 0) {
      const source = candidateSources[Math.floor(Math.random() * candidateSources.length)];
      newConnections.push({
        source: source.id,
        target: actuatorId,
        weight: Math.random() * 2 - 1
      });
    }

    const newBrain = actuatorExists
      ? genome.brain
      : { nodes: [...genome.brain.nodes, newActuator], connections: newConnections };

    onUpdateGenome({ ...genome, morphology: [...genome.morphology, newBlock], brain: newBrain });
    setSelectedBlockId(newId);
  };

  const handleDeleteBlock = (blockId: number) => {
    // Recursive delete
    const toDelete = new Set<number>();
    const findChildren = (id: number) => {
      toDelete.add(id);
      genome.morphology.filter(b => b.parentId === id).forEach(child => findChildren(child.id));
    };
    findChildren(blockId);

    const actuatorIds = new Set(Array.from(toDelete).map(id => `a${id}`));
    const newMorphology = genome.morphology.filter(b => !toDelete.has(b.id));
    const newBrain = {
      nodes: genome.brain.nodes.filter(n => !actuatorIds.has(n.id)),
      connections: genome.brain.connections.filter(c => !actuatorIds.has(c.source) && !actuatorIds.has(c.target))
    };
    onUpdateGenome({ ...genome, morphology: newMorphology, brain: newBrain });
    setSelectedBlockId(null);
  };

  return (
    <div className="w-full h-full grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Column: Canvas (8 cols) */}
      <div className="lg:col-span-8 h-full min-h-[400px]">
        <EditorCanvas
          genome={genome}
          selectedBlockId={selectedBlockId}
          onSelectBlock={setSelectedBlockId}
          onLoadPreset={(newGenome) => {
            onUpdateGenome(newGenome);
            setSelectedBlockId(null);
          }}
        />
      </div>

      {/* Right Column: Properties (4 cols) */}
      <div className="lg:col-span-4 h-full overflow-hidden">
        <EditorPropertiesPanel
          genome={genome}
          selectedBlockId={selectedBlockId}
          onUpdateBlock={handleUpdateBlock}
          onAddChild={handleAddChild}
          onDeleteBlock={handleDeleteBlock}
          onStartSimulation={onStartSimulation}
        />
      </div>
    </div>
  );
};
