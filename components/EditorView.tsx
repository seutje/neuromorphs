import React, { useState } from 'react';
import { Genome, BlockNode, JointType } from '../types';
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
      jointType: JointType.REVOLUTE,
      jointParams: { speed: 5, phase: 0, amp: 1.0 }
    };

    onUpdateGenome({ ...genome, morphology: [...genome.morphology, newBlock] });
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

    const newMorphology = genome.morphology.filter(b => !toDelete.has(b.id));
    onUpdateGenome({ ...genome, morphology: newMorphology });
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
