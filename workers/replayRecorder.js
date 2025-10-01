const DEFAULT_REPLAY_VERSION = 1;
const DEFAULT_MAX_FRAMES = 60 * 60 * 5; // 5 minutes at 60 FPS.

function sanitizeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeCommand(command) {
  if (!command || command.target?.type !== 'joint' || typeof command.target.id !== 'string') {
    if (typeof command?.targetId === 'string') {
      return {
        actuatorId: typeof command.actuatorId === 'string' ? command.actuatorId : null,
        targetId: command.targetId,
        value: sanitizeNumber(command.value, 0)
      };
    }
    return null;
  }
  return {
    actuatorId: typeof command.id === 'string' ? command.id : null,
    targetId: command.target.id,
    value: sanitizeNumber(command.value, 0)
  };
}

export function createReplayRecorder(options = {}) {
  const maxFrames = Math.max(1, options.maxFrames ?? DEFAULT_MAX_FRAMES);

  let recording = false;
  let elapsed = 0;
  let timestep = sanitizeNumber(options.timestep, 1 / 60);
  let metadata = null;
  let frames = [];

  function start(context = {}) {
    const joints = Array.isArray(context.jointDescriptors)
      ? context.jointDescriptors.map((descriptor) => ({
          id: descriptor.id,
          parentId: descriptor.parentId,
          childId: descriptor.childId,
          axis: Array.isArray(descriptor.axis) ? descriptor.axis.map((value) => sanitizeNumber(value, 0)) : null
        }))
      : [];
    const actuators = Array.isArray(context.actuatorIds)
      ? context.actuatorIds.filter((id) => typeof id === 'string')
      : [];
    timestep = sanitizeNumber(context.timestep, timestep);
    frames = [];
    elapsed = 0;
    metadata = {
      version: DEFAULT_REPLAY_VERSION,
      timestep,
      joints,
      actuators
    };
    recording = true;
  }

  function record(frame = {}) {
    if (!recording || frames.length >= maxFrames) {
      return;
    }
    const dt = sanitizeNumber(frame.dt, timestep);
    elapsed += dt;
    const commands = Array.isArray(frame.commands)
      ? frame.commands
          .map((command) => normalizeCommand(command))
          .filter((command) => command !== null)
      : [];
    frames.push({
      t: elapsed,
      commands
    });
  }

  function stop() {
    if (!recording) {
      return null;
    }
    recording = false;
    if (!metadata || frames.length === 0) {
      return null;
    }
    metadata.frameCount = frames.length;
    metadata.duration = frames[frames.length - 1].t ?? 0;
    const payload = { metadata, frames };
    const json = JSON.stringify(payload);
    const encoder = new TextEncoder();
    return encoder.encode(json).buffer;
  }

  function clear() {
    recording = false;
    frames = [];
    metadata = null;
    elapsed = 0;
  }

  return {
    start,
    record,
    stop,
    clear,
    isRecording() {
      return recording;
    },
    getFrameCount() {
      return frames.length;
    },
    getMetadata() {
      return metadata ? { ...metadata } : null;
    },
    getFrames() {
      return frames.map((frame) => ({
        t: frame.t,
        commands: frame.commands.map((command) => ({ ...command }))
      }));
    }
  };
}

export function decodeReplayBuffer(buffer) {
  if (!(buffer instanceof ArrayBuffer)) {
    return null;
  }
  const decoder = new TextDecoder();
  let data;
  try {
    const json = decoder.decode(buffer);
    data = JSON.parse(json);
  } catch (error) {
    console.warn('Failed to decode replay buffer:', error);
    return null;
  }
  if (!data || typeof data !== 'object') {
    return null;
  }
  const metadata = typeof data.metadata === 'object' ? data.metadata : null;
  const frames = Array.isArray(data.frames) ? data.frames : [];
  return { metadata, frames };
}

export function createReplayPlayback(replay) {
  if (!replay || !Array.isArray(replay.frames)) {
    return {
      next() {
        return null;
      },
      reset: () => {},
      hasFinished() {
        return true;
      }
    };
  }
  let index = 0;
  const frames = replay.frames.map((frame) => ({
    t: sanitizeNumber(frame?.t, 0),
    commands: Array.isArray(frame?.commands)
      ? frame.commands
          .map((command) => normalizeCommand(command))
          .filter((command) => command !== null)
      : []
  }));
  return {
    next() {
      if (index >= frames.length) {
        return null;
      }
      const frame = frames[index];
      index += 1;
      return frame;
    },
    reset() {
      index = 0;
    },
    hasFinished() {
      return index >= frames.length;
    },
    getMetadata() {
      return replay.metadata ?? null;
    },
    getFrameCount() {
      return frames.length;
    }
  };
}
