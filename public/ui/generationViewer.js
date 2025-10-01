const DEFAULT_PLAY_INTERVAL = 1600;

function cloneEntry(entry) {
  return entry ? JSON.parse(JSON.stringify(entry)) : null;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeMetrics(metrics) {
  if (!metrics || typeof metrics !== 'object') {
    return null;
  }
  return {
    displacement: isFiniteNumber(metrics.displacement) ? metrics.displacement : null,
    averageSpeed: isFiniteNumber(metrics.averageSpeed) ? metrics.averageSpeed : null,
    averageHeight: isFiniteNumber(metrics.averageHeight) ? metrics.averageHeight : null,
    fallFraction: isFiniteNumber(metrics.fallFraction) ? metrics.fallFraction : null,
    runtime: isFiniteNumber(metrics.runtime) ? metrics.runtime : null
  };
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return {
      generation: 0,
      bestFitness: 0,
      meanFitness: 0,
      bestMetrics: null,
      bestIndividual: null
    };
  }
  const generation = toNumber(entry.generation, 0);
  const bestFitness = isFiniteNumber(entry.bestFitness) ? entry.bestFitness : 0;
  const meanFitness = isFiniteNumber(entry.meanFitness) ? entry.meanFitness : 0;
  const bestMetrics = normalizeMetrics(entry.bestMetrics);
  const bestIndividual = entry.bestIndividual ? cloneEntry(entry.bestIndividual) : null;
  return {
    generation,
    bestFitness,
    meanFitness,
    bestMetrics,
    bestIndividual
  };
}

function formatDecimal(value, fractionDigits = 3) {
  return isFiniteNumber(value) ? value.toFixed(fractionDigits) : '—';
}

function formatMeters(value) {
  return isFiniteNumber(value) ? `${value.toFixed(2)} m` : '—';
}

function formatSpeed(value) {
  return isFiniteNumber(value) ? `${value.toFixed(2)} m/s` : '—';
}

function formatPercent(value) {
  return isFiniteNumber(value) ? `${Math.round(value * 100)}%` : '—';
}

function formatSeconds(value) {
  return isFiniteNumber(value) ? `${value.toFixed(2)} s` : '—';
}

export function createGenerationViewer({
  container,
  slider,
  playButton,
  latestButton,
  summary = {},
  timeline
} = {}) {
  if (!container) {
    throw new Error('createGenerationViewer requires a container element.');
  }
  if (!slider) {
    throw new Error('createGenerationViewer requires a range input slider.');
  }
  if (!playButton) {
    throw new Error('createGenerationViewer requires a play button.');
  }
  if (!latestButton) {
    throw new Error('createGenerationViewer requires a latest button.');
  }
  if (!timeline) {
    throw new Error('createGenerationViewer requires a timeline list element.');
  }

  const summaryNodes = {
    generation: summary.generation ?? container.querySelector('#generation-summary-generation'),
    count: summary.count ?? container.querySelector('#generation-summary-count'),
    best: summary.best ?? container.querySelector('#generation-summary-best'),
    mean: summary.mean ?? container.querySelector('#generation-summary-mean'),
    displacement:
      summary.displacement ?? container.querySelector('#generation-summary-displacement'),
    speed: summary.speed ?? container.querySelector('#generation-summary-speed'),
    height: summary.height ?? container.querySelector('#generation-summary-height'),
    upright: summary.upright ?? container.querySelector('#generation-summary-upright'),
    runtime: summary.runtime ?? container.querySelector('#generation-summary-runtime')
  };

  const emptyStateNode = container.querySelector('.generation-viewer__empty');

  const state = {
    entries: [],
    indexByGeneration: new Map(),
    selectedIndex: -1,
    autoFollow: true,
    running: false,
    playing: false,
    playTimer: null,
    maxFitness: 0
  };

  const selectionListeners = new Set();
  const timelineItems = [];

  function stopPlayback() {
    if (state.playTimer) {
      clearInterval(state.playTimer);
      state.playTimer = null;
    }
    if (state.playing) {
      state.playing = false;
      playButton.textContent = 'Play';
      playButton.setAttribute('aria-pressed', 'false');
    }
  }

  function setEmptyState(empty) {
    container.classList.toggle('is-empty', empty);
    if (emptyStateNode) {
      emptyStateNode.hidden = !empty;
    }
  }

  function updateMaxFitness() {
    state.maxFitness = state.entries.reduce(
      (max, entry) => Math.max(max, entry.bestFitness ?? 0),
      0
    );
  }

  function updateTimelineBars() {
    const max = state.maxFitness > 0 ? state.maxFitness : 1;
    timelineItems.forEach((record, index) => {
      const entry = state.entries[index];
      if (!record || !entry) {
        return;
      }
      const ratio = entry.bestFitness > 0 ? Math.min(entry.bestFitness / max, 1) : 0;
      const width = ratio > 0 ? Math.max(ratio * 100, 6) : 4;
      if (record.bar) {
        record.bar.style.width = `${width}%`;
        record.bar.style.opacity = ratio > 0 ? '0.6' : '0.15';
      }
    });
  }

  function updateTimelineItem(index) {
    const record = timelineItems[index];
    const entry = state.entries[index];
    if (!record || !entry) {
      return;
    }
    if (record.labelGeneration) {
      record.labelGeneration.textContent = `Gen ${entry.generation + 1}`;
    }
    if (record.labelFitness) {
      record.labelFitness.textContent = formatDecimal(entry.bestFitness);
    }
  }

  function updateTimelineActive() {
    timelineItems.forEach((record, index) => {
      if (!record) {
        return;
      }
      const active = index === state.selectedIndex;
      record.item.classList.toggle('is-active', active);
      if (record.button) {
        record.button.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    });
  }

  function updateSliderRange() {
    const count = state.entries.length;
    slider.min = '0';
    slider.max = count > 0 ? String(count - 1) : '0';
    const value = state.selectedIndex >= 0 ? state.selectedIndex : 0;
    slider.value = String(value);
    slider.disabled = count <= 1;
    slider.setAttribute('aria-valuemin', '0');
    slider.setAttribute('aria-valuemax', slider.max);
    slider.setAttribute('aria-valuenow', slider.value);
    slider.setAttribute(
      'aria-valuetext',
      count > 0 ? `Generation ${value + 1} of ${count}` : 'No generations yet'
    );
  }

  function updateSummary() {
    const entry = state.entries[state.selectedIndex] ?? null;
    const count = state.entries.length;
    if (summaryNodes.generation) {
      summaryNodes.generation.textContent = entry ? `${entry.generation + 1}` : '—';
    }
    if (summaryNodes.count) {
      summaryNodes.count.textContent = count > 0 ? `${state.selectedIndex + 1} / ${count}` : '0 / 0';
    }
    if (summaryNodes.best) {
      summaryNodes.best.textContent = entry ? formatDecimal(entry.bestFitness) : '—';
    }
    if (summaryNodes.mean) {
      summaryNodes.mean.textContent = entry ? formatDecimal(entry.meanFitness) : '—';
    }
    const metrics = entry?.bestMetrics ?? null;
    if (summaryNodes.displacement) {
      summaryNodes.displacement.textContent = metrics ? formatMeters(metrics.displacement) : '—';
    }
    if (summaryNodes.speed) {
      summaryNodes.speed.textContent = metrics ? formatSpeed(metrics.averageSpeed) : '—';
    }
    if (summaryNodes.height) {
      summaryNodes.height.textContent = metrics ? formatMeters(metrics.averageHeight) : '—';
    }
    if (summaryNodes.upright) {
      const upright = metrics && isFiniteNumber(metrics.fallFraction)
        ? 1 - metrics.fallFraction
        : null;
      summaryNodes.upright.textContent = metrics ? formatPercent(upright) : '—';
    }
    if (summaryNodes.runtime) {
      summaryNodes.runtime.textContent = metrics ? formatSeconds(metrics.runtime) : '—';
    }
  }

  function updateControls() {
    const count = state.entries.length;
    playButton.disabled = count <= 1;
    latestButton.disabled = count === 0 || state.selectedIndex === count - 1;
    if (state.playing && playButton.disabled) {
      stopPlayback();
    }
  }

  function selectIndex(index, { silent = false, user = false } = {}) {
    if (state.entries.length === 0) {
      state.selectedIndex = -1;
      updateSliderRange();
      updateSummary();
      updateTimelineActive();
      updateControls();
      return;
    }
    const clamped = Math.min(Math.max(index, 0), state.entries.length - 1);
    state.selectedIndex = clamped;
    updateSliderRange();
    updateSummary();
    updateTimelineActive();
    updateControls();
    if (!silent) {
      const payload = cloneEntry(state.entries[clamped]);
      selectionListeners.forEach((listener) => listener(payload, { user }));
    }
  }

  function createTimelineItem(entry) {
    const item = document.createElement('li');
    item.className = 'generation-timeline__item';
    const buttonElement = document.createElement('button');
    buttonElement.type = 'button';
    buttonElement.className = 'generation-timeline__button';
    const labelGeneration = document.createElement('span');
    labelGeneration.className = 'generation-timeline__label generation-timeline__label--gen';
    const labelFitness = document.createElement('span');
    labelFitness.className = 'generation-timeline__label generation-timeline__label--fitness';
    buttonElement.append(labelGeneration, labelFitness);
    const bar = document.createElement('div');
    bar.className = 'generation-timeline__bar';
    buttonElement.addEventListener('click', () => {
      stopPlayback();
      const targetIndex = state.indexByGeneration.get(entry.generation);
      state.autoFollow = targetIndex === state.entries.length - 1;
      selectIndex(targetIndex ?? state.entries.length - 1, { user: true });
    });
    item.append(buttonElement, bar);
    timeline.append(item);
    return {
      item,
      button: buttonElement,
      labelGeneration,
      labelFitness,
      bar
    };
  }

  function addEntry(entry, { silent = false } = {}) {
    const normalized = normalizeEntry(entry);
    const existingIndex = state.indexByGeneration.has(normalized.generation)
      ? state.indexByGeneration.get(normalized.generation)
      : undefined;

    if (typeof existingIndex === 'number' && existingIndex >= 0) {
      state.entries[existingIndex] = normalized;
      updateTimelineItem(existingIndex);
      updateMaxFitness();
      updateTimelineBars();
      if (!silent && existingIndex === state.selectedIndex) {
        updateSummary();
      }
      return existingIndex;
    }

    state.entries.push(normalized);
    const index = state.entries.length - 1;
    state.indexByGeneration.set(normalized.generation, index);
    const record = createTimelineItem(normalized);
    timelineItems.push(record);
    updateTimelineItem(index);
    updateMaxFitness();
    updateTimelineBars();
    setEmptyState(false);
    if (state.autoFollow) {
      selectIndex(index, { silent });
    } else {
      updateSliderRange();
      updateControls();
    }
    return index;
  }

  function reset() {
    stopPlayback();
    state.entries = [];
    state.indexByGeneration.clear();
    state.selectedIndex = -1;
    state.maxFitness = 0;
    state.autoFollow = true;
    timelineItems.splice(0, timelineItems.length);
    timeline.innerHTML = '';
    setEmptyState(true);
    updateSliderRange();
    updateSummary();
    updateControls();
    updateTimelineActive();
  }

  function setEntries(entries = []) {
    reset();
    if (Array.isArray(entries)) {
      entries.forEach((entry) => {
        addEntry(entry, { silent: true });
      });
    }
    if (state.entries.length > 0) {
      state.autoFollow = true;
      selectIndex(state.entries.length - 1, { silent: true });
      setEmptyState(false);
    }
  }

  function jumpToLatest({ silent = false } = {}) {
    if (state.entries.length === 0) {
      return;
    }
    state.autoFollow = true;
    selectIndex(state.entries.length - 1, { silent });
  }

  function startPlayback() {
    if (state.entries.length <= 1 || state.playing) {
      return;
    }
    state.playing = true;
    playButton.textContent = 'Pause';
    playButton.setAttribute('aria-pressed', 'true');
    if (state.selectedIndex === state.entries.length - 1) {
      selectIndex(0, { silent: true });
    }
    state.playTimer = setInterval(() => {
      if (state.entries.length === 0) {
        stopPlayback();
        return;
      }
      const nextIndex = state.selectedIndex + 1;
      if (nextIndex >= state.entries.length) {
        stopPlayback();
        jumpToLatest();
        return;
      }
      selectIndex(nextIndex, { silent: false });
    }, DEFAULT_PLAY_INTERVAL);
  }

  function setRunning(next) {
    state.running = Boolean(next);
    container.classList.toggle('is-running', state.running);
  }

  slider.addEventListener('input', () => {
    if (state.entries.length === 0) {
      return;
    }
    const index = Math.round(Number(slider.value) || 0);
    state.autoFollow = index === state.entries.length - 1;
    stopPlayback();
    selectIndex(index, { user: true });
  });

  slider.addEventListener('pointerdown', () => {
    state.autoFollow = false;
    stopPlayback();
  });

  slider.addEventListener('touchstart', () => {
    state.autoFollow = false;
    stopPlayback();
  });

  playButton.addEventListener('click', () => {
    if (state.playing) {
      stopPlayback();
    } else {
      startPlayback();
    }
  });

  latestButton.addEventListener('click', () => {
    stopPlayback();
    jumpToLatest();
  });

  setEmptyState(true);
  updateSliderRange();
  updateControls();

  return {
    reset,
    setEntries,
    addGeneration: addEntry,
    jumpToLatest,
    setRunning,
    stopPlayback,
    isPlaying() {
      return state.playing;
    },
    onSelectionChange(callback) {
      if (typeof callback === 'function') {
        selectionListeners.add(callback);
      }
      return () => selectionListeners.delete(callback);
    },
    getSelectedEntry() {
      return state.selectedIndex >= 0 ? cloneEntry(state.entries[state.selectedIndex]) : null;
    }
  };
}
