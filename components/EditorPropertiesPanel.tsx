import React from 'react';
import { Trash2, Plus, Play } from 'lucide-react';
import { Genome, BlockNode, JointType } from '../types';

interface EditorPropertiesPanelProps {
    genome: Genome;
    selectedBlockId: number | null;
    onUpdateBlock: (blockId: number, updates: Partial<BlockNode>) => void;
    onAddChild: (parentId: number, face: number) => void;
    onDeleteBlock: (blockId: number) => void;
    onStartSimulation: () => void;
}

export const EditorPropertiesPanel: React.FC<EditorPropertiesPanelProps> = ({
    genome,
    selectedBlockId,
    onUpdateBlock,
    onAddChild,
    onDeleteBlock,
    onStartSimulation
}) => {
    const selectedBlock = genome.morphology.find(b => b.id === selectedBlockId);

    const handleChange = (field: keyof BlockNode, value: any) => {
        if (selectedBlockId === null) return;
        onUpdateBlock(selectedBlockId, { [field]: value });
    };

    const handleSizeChange = (index: number, value: number) => {
        if (!selectedBlock) return;
        const newSize = [...selectedBlock.size] as [number, number, number];
        newSize[index] = parseFloat(value.toString());
        handleChange('size', newSize);
    };

    const handleRotationChange = (index: number, value: number) => {
        if (!selectedBlock) return;
        const rotation = selectedBlock.rotation || [0, 0, 0];
        const newRotation = [...rotation] as [number, number, number];
        newRotation[index] = parseFloat(value.toString());
        handleChange('rotation', newRotation);
    };

    const handleJointParamChange = (field: string, value: number) => {
        if (!selectedBlock) return;
        const newParams = { ...selectedBlock.jointParams, [field]: parseFloat(value.toString()) };
        handleChange('jointParams', newParams);
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            {/* Header / Global Actions */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 shadow-lg">
                <h2 className="text-slate-100 font-semibold mb-4">Creature Editor</h2>
                <button
                    onClick={onStartSimulation}
                    className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 px-4 rounded flex items-center justify-center gap-2 transition-colors"
                >
                    <Play className="w-4 h-4" />
                    Start Simulation
                </button>
            </div>

            {/* Properties Inspector */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 shadow-lg flex-1 overflow-y-auto">
                {selectedBlock ? (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                            <span className="text-sm font-mono text-slate-400">Block #{selectedBlock.id}</span>
                            {selectedBlock.parentId !== undefined && (
                                <button
                                    onClick={() => onDeleteBlock(selectedBlock.id)}
                                    className="text-red-400 hover:text-red-300 p-1 hover:bg-red-400/10 rounded transition-colors"
                                    title="Delete Block"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        {/* Appearance */}
                        <div className="space-y-3">
                            <h3 className="text-xs uppercase font-bold text-slate-500">Appearance</h3>

                            <div className="grid grid-cols-3 gap-2">
                                {['X', 'Y', 'Z'].map((axis, i) => (
                                    <div key={axis}>
                                        <label className="text-[10px] text-slate-500 block mb-1">Size {axis}</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0.1"
                                            max="5.0"
                                            value={selectedBlock.size[i]}
                                            onChange={(e) => handleSizeChange(i, parseFloat(e.target.value))}
                                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-white focus:border-emerald-500 outline-none"
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                {['X', 'Y', 'Z'].map((axis, i) => (
                                    <div key={axis}>
                                        <label className="text-[10px] text-slate-500 block mb-1">Rot {axis} (°)</label>
                                        <input
                                            type="number"
                                            step="1"
                                            value={(selectedBlock.rotation || [0, 0, 0])[i]}
                                            onChange={(e) => handleRotationChange(i, parseFloat(e.target.value))}
                                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-white focus:border-emerald-500 outline-none"
                                        />
                                    </div>
                                ))}
                            </div>

                            <div>
                                <label className="text-[10px] text-slate-500 block mb-1">Color</label>
                                <div className="flex gap-2">
                                    <input
                                        type="color"
                                        value={selectedBlock.color}
                                        onChange={(e) => handleChange('color', e.target.value)}
                                        className="h-8 w-8 rounded cursor-pointer bg-transparent border-0 p-0"
                                    />
                                    <input
                                        type="text"
                                        value={selectedBlock.color}
                                        onChange={(e) => handleChange('color', e.target.value)}
                                        className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-white font-mono"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Joint Properties (if not root) */}
                        {selectedBlock.parentId !== undefined && (
                            <div className="space-y-3">
                                <h3 className="text-xs uppercase font-bold text-slate-500">Joint Configuration</h3>

                                <div>
                                    <label className="text-[10px] text-slate-500 block mb-1">Type</label>
                                    <select
                                        value={selectedBlock.jointType}
                                        onChange={(e) => handleChange('jointType', e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-white outline-none"
                                    >
                                        <option value={JointType.REVOLUTE}>Hinge (Revolute)</option>
                                        <option value={JointType.SPHERICAL}>Ball (Spherical)</option>
                                    </select>
                                </div>

                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <label className="text-[10px] text-slate-500 block mb-1">Speed</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={selectedBlock.jointParams.speed}
                                            onChange={(e) => handleJointParamChange('speed', parseFloat(e.target.value))}
                                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 block mb-1">Phase</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={selectedBlock.jointParams.phase}
                                            onChange={(e) => handleJointParamChange('phase', parseFloat(e.target.value))}
                                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 block mb-1">Amp</label>
                                        <input
                                            type="number"
                                            step="0.1"
                                            value={selectedBlock.jointParams.amp}
                                            onChange={(e) => handleJointParamChange('amp', parseFloat(e.target.value))}
                                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                                        />
                                    </div>
                                </div>

                                {/* Offsets */}
                                <div className="space-y-2 pt-2 border-t border-slate-800">
                                    <h4 className="text-[10px] uppercase font-bold text-slate-500">Attachment Offsets</h4>

                                    {(() => {
                                        const parentBlock = genome.morphology.find(b => b.id === selectedBlock.parentId);
                                        if (!parentBlock) return null;

                                        const face = selectedBlock.attachFace;
                                        const axisIdx = Math.floor(face / 2); // 0=x, 1=y, 2=z

                                        // Determine tangential axes
                                        let uAxis = 0, vAxis = 0;
                                        let uLabel = '', vLabel = '';

                                        if (axisIdx === 0) { uAxis = 1; vAxis = 2; uLabel = 'Y'; vLabel = 'Z'; } // Face X -> Y, Z
                                        else if (axisIdx === 1) { uAxis = 0; vAxis = 2; uLabel = 'X'; vLabel = 'Z'; } // Face Y -> X, Z
                                        else { uAxis = 0; vAxis = 1; uLabel = 'X'; vLabel = 'Y'; } // Face Z -> X, Y

                                        const parentLimitU = parentBlock.size[uAxis] / 2;
                                        const parentLimitV = parentBlock.size[vAxis] / 2;
                                        const childLimitU = selectedBlock.size[uAxis] / 2;
                                        const childLimitV = selectedBlock.size[vAxis] / 2;

                                        const pOffset = selectedBlock.parentOffset || [0, 0];
                                        const cOffset = selectedBlock.childOffset || [0, 0];

                                        return (
                                            <>
                                                {/* Parent Offset */}
                                                <div>
                                                    <label className="text-[10px] text-slate-500 block mb-1">Parent Offset ({uLabel}, {vLabel})</label>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <input
                                                            type="number"
                                                            step="0.1"
                                                            min={-parentLimitU}
                                                            max={parentLimitU}
                                                            value={pOffset[0]}
                                                            onChange={(e) => {
                                                                const val = Math.max(-parentLimitU, Math.min(parentLimitU, parseFloat(e.target.value)));
                                                                handleChange('parentOffset', [val, pOffset[1]]);
                                                            }}
                                                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                                                        />
                                                        <input
                                                            type="number"
                                                            step="0.1"
                                                            min={-parentLimitV}
                                                            max={parentLimitV}
                                                            value={pOffset[1]}
                                                            onChange={(e) => {
                                                                const val = Math.max(-parentLimitV, Math.min(parentLimitV, parseFloat(e.target.value)));
                                                                handleChange('parentOffset', [pOffset[0], val]);
                                                            }}
                                                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Child Offset */}
                                                <div>
                                                    <label className="text-[10px] text-slate-500 block mb-1">Child Offset ({uLabel}, {vLabel})</label>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <input
                                                            type="number"
                                                            step="0.1"
                                                            min={-childLimitU}
                                                            max={childLimitU}
                                                            value={cOffset[0]}
                                                            onChange={(e) => {
                                                                const val = Math.max(-childLimitU, Math.min(childLimitU, parseFloat(e.target.value)));
                                                                handleChange('childOffset', [val, cOffset[1]]);
                                                            }}
                                                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                                                        />
                                                        <input
                                                            type="number"
                                                            step="0.1"
                                                            min={-childLimitV}
                                                            max={childLimitV}
                                                            value={cOffset[1]}
                                                            onChange={(e) => {
                                                                const val = Math.max(-childLimitV, Math.min(childLimitV, parseFloat(e.target.value)));
                                                                handleChange('childOffset', [cOffset[0], val]);
                                                            }}
                                                            className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                                                        />
                                                    </div>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}

                        {/* Add Child Actions */}
                        <div className="space-y-3 pt-4 border-t border-slate-800">
                            <h3 className="text-xs uppercase font-bold text-slate-500">Add Child Block</h3>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { face: 0, label: '+X' }, { face: 1, label: '-X' },
                                    { face: 2, label: '+Y' }, { face: 3, label: '-Y' },
                                    { face: 4, label: '+Z' }, { face: 5, label: '-Z' },
                                ].map((opt) => (
                                    <button
                                        key={opt.face}
                                        onClick={() => onAddChild(selectedBlock.id, opt.face)}
                                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs py-2 rounded border border-slate-700 flex items-center justify-center gap-1"
                                    >
                                        <Plus className="w-3 h-3" /> {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                    </div>
                ) : (
                    <div className="h-full flex items-center justify-center text-slate-600 text-sm text-center px-4">
                        Select a block in the 3D view to edit properties or add children.
                    </div>
                )}
            </div>
        </div>
    );
};
