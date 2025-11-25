import React, { useState } from 'react';
import { Trash2, Plus, ArrowRight } from 'lucide-react';
import { Genome, NeuralNode, NeuralConnection, NodeType } from '../types';

interface BrainPropertiesPanelProps {
    genome: Genome;
    selectedNodeId: string | null;
    onAddNode: (type: NodeType, label: string) => void;
    onDeleteNode: (id: string) => void;
    onUpdateConnection: (sourceId: string, targetId: string, weight: number) => void;
    onAddConnection: (sourceId: string, targetId: string) => void;
    onDeleteConnection: (sourceId: string, targetId: string) => void;
}

export const BrainPropertiesPanel: React.FC<BrainPropertiesPanelProps> = ({
    genome,
    selectedNodeId,
    onAddNode,
    onDeleteNode,
    onUpdateConnection,
    onAddConnection,
    onDeleteConnection
}) => {
    const selectedNode = genome.brain.nodes.find(n => n.id === selectedNodeId);
    const [newNodeType, setNewNodeType] = useState<NodeType>(NodeType.OSCILLATOR);
    const [newNodeLabel, setNewNodeLabel] = useState('Oscillator');

    // For adding connections
    const [targetNodeId, setTargetNodeId] = useState<string>('');

    const outgoingConnections = genome.brain.connections.filter(c => c.source === selectedNodeId);

    // Filter available targets (not self, not already connected)
    const availableTargets = genome.brain.nodes.filter(n =>
        n.id !== selectedNodeId &&
        n.type !== NodeType.SENSOR &&
        n.type !== NodeType.OSCILLATOR &&
        !outgoingConnections.some(c => c.target === n.id)
    );

    const handleAddNodeClick = () => {
        onAddNode(newNodeType, newNodeLabel);
    };

    return (
        <div className="flex flex-col gap-4 h-full">
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 shadow-lg">
                <h2 className="text-slate-100 font-semibold mb-2">Brain Inspector</h2>
                <p className="text-xs text-slate-500">
                    {selectedNode ? `Editing Node: ${selectedNode.label}` : 'Select a node to edit or add new ones.'}
                </p>
            </div>

            <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 shadow-lg flex-1 overflow-y-auto">
                {selectedNode ? (
                    <div className="space-y-6">
                        {/* Node Header */}
                        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                            <div>
                                <div className="text-sm font-bold text-white">{selectedNode.label}</div>
                                <div className="text-xs font-mono text-slate-500">{selectedNode.type}</div>
                            </div>
                            {selectedNode.type !== NodeType.SENSOR && (
                                <button
                                    onClick={() => onDeleteNode(selectedNode.id)}
                                    className="text-red-400 hover:text-red-300 p-1 hover:bg-red-400/10 rounded transition-colors"
                                    title="Delete Node"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        {/* Outgoing Connections */}
                        <div className="space-y-3">
                            <h3 className="text-xs uppercase font-bold text-slate-500">Outgoing Connections</h3>

                            {outgoingConnections.length === 0 && (
                                <div className="text-xs text-slate-600 italic">No outgoing connections</div>
                            )}

                            {outgoingConnections.map(conn => {
                                const target = genome.brain.nodes.find(n => n.id === conn.target);
                                return (
                                    <div key={conn.target} className="bg-slate-950 p-2 rounded border border-slate-800">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs text-slate-300 flex items-center gap-1">
                                                <ArrowRight className="w-3 h-3" />
                                                {target?.label || conn.target}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono text-emerald-400">{conn.weight.toFixed(2)}</span>
                                                <button
                                                    onClick={() => onDeleteConnection(conn.source, conn.target)}
                                                    className="text-slate-500 hover:text-red-400 transition-colors"
                                                    title="Remove Connection"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                        <input
                                            type="range"
                                            min="-4"
                                            max="4"
                                            step="0.1"
                                            value={conn.weight}
                                            onChange={(e) => onUpdateConnection(conn.source, conn.target, parseFloat(e.target.value))}
                                            className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                                        />
                                    </div>
                                );
                            })}
                        </div>

                        {/* Add Connection */}
                        <div className="pt-4 border-t border-slate-800">
                            <h3 className="text-xs uppercase font-bold text-slate-500 mb-2">Add Connection</h3>
                            <div className="flex gap-2">
                                <select
                                    value={targetNodeId}
                                    onChange={(e) => setTargetNodeId(e.target.value)}
                                    className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white outline-none"
                                >
                                    <option value="" disabled>Select Target...</option>
                                    {availableTargets.map(n => (
                                        <option key={n.id} value={n.id}>{n.label} ({n.type})</option>
                                    ))}
                                </select>
                                <button
                                    disabled={!targetNodeId}
                                    onClick={() => {
                                        if (targetNodeId) {
                                            onAddConnection(selectedNode.id, targetNodeId);
                                            setTargetNodeId('');
                                        }
                                    }}
                                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white p-1 rounded"
                                >
                                    <Plus className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Add New Node */}
                        <div className="space-y-3">
                            <h3 className="text-xs uppercase font-bold text-slate-500">Add New Node</h3>

                            <div>
                                <label className="text-[10px] text-slate-500 block mb-1">Type</label>
                                <select
                                    value={newNodeType}
                                    onChange={(e) => {
                                        const type = e.target.value as NodeType;
                                        setNewNodeType(type);
                                        setNewNodeLabel(type.charAt(0) + type.slice(1).toLowerCase());
                                    }}
                                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-white outline-none"
                                >
                                    <option value={NodeType.OSCILLATOR}>Oscillator</option>
                                    <option value={NodeType.NEURON}>Neuron (Hidden)</option>
                                    {/* Sensors and Actuators are usually auto-generated from morphology, but could allow manual adding if advanced */}
                                </select>
                            </div>

                            <div>
                                <label className="text-[10px] text-slate-500 block mb-1">Label</label>
                                <input
                                    type="text"
                                    value={newNodeLabel}
                                    onChange={(e) => setNewNodeLabel(e.target.value)}
                                    className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-white"
                                />
                            </div>

                            <button
                                onClick={handleAddNodeClick}
                                className="w-full bg-slate-800 hover:bg-slate-700 text-white text-xs py-2 rounded border border-slate-700 flex items-center justify-center gap-2"
                            >
                                <Plus className="w-3 h-3" /> Add Node
                            </button>
                        </div>

                        <div className="text-xs text-slate-500 mt-8 p-4 bg-slate-950/50 rounded border border-slate-800/50">
                            <p className="mb-2"><strong>Tip:</strong></p>
                            <ul className="list-disc pl-4 space-y-1">
                                <li><strong>Oscillators</strong> generate sine waves to drive movement.</li>
                                <li><strong>Neurons</strong> process signals between sensors and actuators.</li>
                                <li>Sensors and Actuators are automatically created when you add blocks or joints in the Morphology Editor.</li>
                            </ul>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
