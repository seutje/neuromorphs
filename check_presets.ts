
import fs from 'fs';
import path from 'path';

const presetsDir = '/home/seutje/projects/neuromorphs/presets';

const checkPreset = (filePath: string) => {
    const content = fs.readFileSync(filePath, 'utf-8');
    const genome = JSON.parse(content);
    const nodes = genome.brain.nodes;
    const connections = genome.brain.connections;

    let invalidCount = 0;

    connections.forEach((conn: any) => {
        const targetNode = nodes.find((n: any) => n.id === conn.target);
        if (targetNode) {
            if (targetNode.type === 'SENSOR' || targetNode.type === 'OSCILLATOR') {
                console.log(`[${path.basename(filePath)}] Invalid connection: ${conn.source} -> ${conn.target} (${targetNode.type})`);
                invalidCount++;
            }
        }
    });

    if (invalidCount === 0) {
        console.log(`[${path.basename(filePath)}] OK`);
    }
};

fs.readdirSync(presetsDir).forEach(file => {
    if (file.endsWith('.json')) {
        checkPreset(path.join(presetsDir, file));
    }
});
