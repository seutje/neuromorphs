
import React, { useState, useEffect } from 'react';
import { X, Save, RotateCcw } from 'lucide-react';
import { SimulationConfig, SceneType } from '../types';

interface SettingsPaneProps {
  isOpen: boolean;
  onClose: () => void;
  config: SimulationConfig;
  onApply: (newConfig: SimulationConfig) => void;
}

export const SettingsPane: React.FC<SettingsPaneProps> = ({ isOpen, onClose, config, onApply }) => {
  const [localConfig, setLocalConfig] = useState<SimulationConfig>(config);

  // Reset local state when opening
  useEffect(() => {
    if (isOpen) {
      setLocalConfig(config);
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  const handleChange = (field: keyof SimulationConfig, value: any) => {
    setLocalConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">

        {/* Header */}
        <div className="bg-slate-950 p-4 flex items-center justify-between border-b border-slate-800">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-emerald-500" />
            Simulation Settings
          </h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">

          {/* Seed */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-slate-300">Random Seed</label>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">
                {localConfig.seed}
              </span>
            </div>
            <input
              type="number"
              value={localConfig.seed}
              onChange={(e) => handleChange('seed', parseInt(e.target.value) || 0)}
              className="w-full bg-slate-800 text-white px-3 py-2 rounded border border-slate-700 focus:border-emerald-500 focus:outline-none font-mono text-sm"
            />
            <p className="text-[10px] text-slate-500">
              Fixed seed ensures identical results for the same settings.
            </p>
          </div>

          {/* Population Size */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-slate-300">Population Size</label>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">
                {localConfig.populationSize}
              </span>
            </div>
            <input
              type="range"
              min="4"
              max="1000"
              step="4"
              value={localConfig.populationSize}
              onChange={(e) => handleChange('populationSize', parseInt(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <p className="text-[10px] text-slate-500">
              Larger populations increase diversity but slow down performance.
            </p>
          </div>

          {/* Epoch Duration */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-slate-300">Epoch Duration</label>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">
                {localConfig.epochDuration}s
              </span>
            </div>
            <input
              type="range"
              min="5"
              max="300"
              step="5"
              value={localConfig.epochDuration}
              onChange={(e) => handleChange('epochDuration', parseInt(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <p className="text-[10px] text-slate-500">
              Time allowed for creatures to perform the task before the next generation.
            </p>
          </div>

          {/* Scene Selection */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-slate-300">Environment</label>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">
                {localConfig.scene}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.values(SceneType).map((scene) => (
                <button
                  key={scene}
                  onClick={() => handleChange('scene', scene)}
                  className={`p-2 rounded border text-xs font-medium transition-colors ${localConfig.scene === scene
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                    }`}
                >
                  {scene}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-500">
              {localConfig.scene === SceneType.EARTH && "Standard Earth gravity and friction."}
              {localConfig.scene === SceneType.MOON && "Low gravity, reduced friction."}
              {localConfig.scene === SceneType.JUPITER && "High gravity, high density."}
              {localConfig.scene === SceneType.WATER && "Buoyancy, high drag, fluid dynamics."}
            </p>
          </div>

          {/* Mutation Rate */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-slate-300">Mutation Rate</label>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">
                {(localConfig.mutationRate * 100).toFixed(0)}%
              </span>
            </div>
            <input
              type="range"
              min="0.01"
              max="0.5"
              step="0.01"
              value={localConfig.mutationRate}
              onChange={(e) => handleChange('mutationRate', parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
            <p className="text-[10px] text-slate-500">
              Probability of genetic changes occurring during reproduction.
            </p>
          </div>

          {/* Warning */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded p-3 text-xs text-amber-200/80">
            <strong>Note:</strong> Applying these settings will reset the current simulation run to Generation 0.
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onApply(localConfig)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-emerald-900/20"
          >
            <Save className="w-4 h-4" />
            Apply & Reset
          </button>
        </div>

      </div>
    </div>
  );
};
