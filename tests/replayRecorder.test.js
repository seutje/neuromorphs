import {
  createReplayRecorder,
  decodeReplayBuffer,
  createReplayPlayback
} from '../workers/replayRecorder.js';

describe('replayRecorder', () => {
  test('serializes frames with commands', () => {
    const recorder = createReplayRecorder({ maxFrames: 10 });
    recorder.start({
      jointDescriptors: [
        { id: 'hip', parentId: 'root', childId: 'leg', axis: [1, 0, 0] }
      ],
      actuatorIds: ['act-1'],
      timestep: 1 / 30
    });
    recorder.record({
      dt: 1 / 30,
      commands: [
        {
          id: 'act-1',
          target: { type: 'joint', id: 'hip' },
          value: 0.5
        }
      ]
    });
    recorder.record({ dt: 1 / 30, commands: [] });
    const buffer = recorder.stop();

    expect(buffer).toBeInstanceOf(ArrayBuffer);

    const decoded = decodeReplayBuffer(buffer);
    expect(decoded).toBeTruthy();
    expect(decoded.metadata.joints).toHaveLength(1);
    expect(decoded.metadata.frameCount).toBe(2);
    expect(decoded.frames).toHaveLength(2);
    expect(decoded.frames[0].commands).toHaveLength(1);
    expect(decoded.frames[0].commands[0].value).toBeCloseTo(0.5);

    const playback = createReplayPlayback(decoded);
    const frameOne = playback.next();
    expect(frameOne.commands[0].targetId).toBe('hip');
    expect(frameOne.commands[0].value).toBeCloseTo(0.5);
    const frameTwo = playback.next();
    expect(frameTwo.commands).toEqual([]);
    expect(playback.next()).toBeNull();
    expect(playback.hasFinished()).toBe(true);
  });
});
