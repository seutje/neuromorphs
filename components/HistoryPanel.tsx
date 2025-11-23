import React, { useEffect, useRef } from 'react';
import { Undo, Redo, History } from 'lucide-react';

export interface HistoryItem {
    description: string;
    timestamp: number;
}

interface HistoryPanelProps {
    history: HistoryItem[];
    currentIndex: number;
    onUndo: () => void;
    onRedo: () => void;
    onJumpTo: (index: number) => void;
}

export const HistoryPanel: React.FC<HistoryPanelProps> = ({
    history,
    currentIndex,
    onUndo,
    onRedo,
    onJumpTo
}) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to the current item when history changes or index changes
    useEffect(() => {
        if (scrollRef.current) {
            const currentElement = scrollRef.current.children[currentIndex] as HTMLElement;
            if (currentElement) {
                currentElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
    }, [history.length, currentIndex]);

    return (
        <div className="h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <History className="w-4 h-4 text-slate-400" />
                    Edit History
                </h3>
                <div className="flex gap-2">
                    <button
                        onClick={onUndo}
                        disabled={currentIndex <= 0}
                        className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                        title="Undo"
                    >
                        <Undo className="w-4 h-4" />
                    </button>
                    <button
                        onClick={onRedo}
                        disabled={currentIndex >= history.length - 1}
                        className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                        title="Redo"
                    >
                        <Redo className="w-4 h-4" />
                    </button>
                </div>
            </div>

            <div className="flex-1 bg-slate-950/50 rounded-lg border border-slate-800 overflow-hidden flex flex-col">
                <div className="overflow-y-auto flex-1 p-2 custom-scrollbar" ref={scrollRef}>
                    {history.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-slate-600 text-xs italic">
                            No changes yet
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1">
                            {history.map((item, index) => {
                                const isCurrent = index === currentIndex;
                                const isFuture = index > currentIndex;

                                return (
                                    <button
                                        key={index}
                                        onClick={() => onJumpTo(index)}
                                        className={`
                      w-full text-left px-3 py-2 rounded text-xs font-mono transition-all flex items-center justify-between group
                      ${isCurrent
                                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                : isFuture
                                                    ? 'text-slate-600 hover:bg-slate-900 hover:text-slate-500'
                                                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-300'
                                            }
                    `}
                                    >
                                        <span className="truncate">{item.description}</span>
                                        {isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
