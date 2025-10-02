const noop = () => {};

export function createViewControls({ select, button, stageSelect, stageButton } = {}) {
  if (!select) {
    throw new Error('createViewControls requires a select element.');
  }
  if (!button) {
    throw new Error('createViewControls requires a simulation toggle button.');
  }
  if (!stageSelect) {
    throw new Error('createViewControls requires a stage select element.');
  }
  if (!stageButton) {
    throw new Error('createViewControls requires a stage load button.');
  }

  let currentMode = select.value || 'orbit';
  let simulationRunning = true;
  let currentStage = stageSelect.value || 'dash';
  const viewListeners = new Set();
  const toggleListeners = new Set();
  const stageChangeListeners = new Set();
  const stageLoadListeners = new Set();

  select.addEventListener('change', () => {
    currentMode = select.value || 'orbit';
    viewListeners.forEach((listener) => listener(currentMode));
  });

  button.addEventListener('click', () => {
    toggleListeners.forEach((listener) => listener());
  });

  stageSelect.addEventListener('change', () => {
    currentStage = stageSelect.value || currentStage || 'dash';
    stageChangeListeners.forEach((listener) => listener(currentStage));
  });

  stageButton.addEventListener('click', () => {
    stageLoadListeners.forEach((listener) => listener(currentStage));
  });

  function setViewMode(mode) {
    currentMode = mode;
    if (select.value !== mode) {
      select.value = mode;
    }
  }

  function setSimulationRunning(running) {
    simulationRunning = Boolean(running);
    button.textContent = simulationRunning ? 'Pause Simulation' : 'Resume Simulation';
    button.setAttribute('aria-pressed', simulationRunning ? 'true' : 'false');
  }

  function setStage(stage) {
    const nextStage = stage || 'dash';
    currentStage = nextStage;
    if (stageSelect.value !== nextStage) {
      stageSelect.value = nextStage;
    }
  }

  function setStages(stages = []) {
    if (!Array.isArray(stages)) {
      return;
    }
    const previous = currentStage;
    stageSelect.innerHTML = '';
    stages.forEach((stage) => {
      if (!stage || !stage.id) {
        return;
      }
      const option = document.createElement('option');
      option.value = stage.id;
      option.textContent = stage.label ?? stage.id;
      stageSelect.append(option);
    });
    const availableIds = stages.map((stage) => stage.id);
    const nextStage = availableIds.includes(previous) ? previous : availableIds[0];
    if (nextStage) {
      setStage(nextStage);
    }
  }

  return {
    onViewModeChange(callback = noop) {
      if (typeof callback === 'function') {
        viewListeners.add(callback);
      }
      return () => viewListeners.delete(callback);
    },
    onSimulationToggle(callback = noop) {
      if (typeof callback === 'function') {
        toggleListeners.add(callback);
      }
      return () => toggleListeners.delete(callback);
    },
    onStageChange(callback = noop) {
      if (typeof callback === 'function') {
        stageChangeListeners.add(callback);
      }
      return () => stageChangeListeners.delete(callback);
    },
    onStageLoad(callback = noop) {
      if (typeof callback === 'function') {
        stageLoadListeners.add(callback);
      }
      return () => stageLoadListeners.delete(callback);
    },
    setViewMode,
    setSimulationRunning,
    setStage,
    setStages,
    getViewMode() {
      return currentMode;
    },
    getStageId() {
      return currentStage;
    }
  };
}
