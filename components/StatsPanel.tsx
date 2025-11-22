import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { GenerationStats } from '../types';

interface StatsPanelProps {
  history: GenerationStats[];
}

export const StatsPanel: React.FC<StatsPanelProps> = ({ history }) => {
  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">Fitness History</h3>
        <div className="flex gap-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-emerald-400 rounded-full"></div>
            <span className="text-slate-400">Max</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 bg-indigo-400 rounded-full"></div>
            <span className="text-slate-400">Average</span>
          </div>
        </div>
      </div>
      
      <div className="flex-1 min-h-[150px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis 
              dataKey="generation" 
              stroke="#64748b" 
              fontSize={12}
              tickLine={false}
            />
            <YAxis 
              stroke="#64748b" 
              fontSize={12}
              tickLine={false}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
              itemStyle={{ fontSize: '12px' }}
            />
            <Line 
              type="monotone" 
              dataKey="maxFitness" 
              stroke="#34d399" 
              strokeWidth={2} 
              dot={false}
            />
            <Line 
              type="monotone" 
              dataKey="avgFitness" 
              stroke="#818cf8" 
              strokeWidth={2} 
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};