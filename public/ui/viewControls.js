const noop = () => {};

export function createViewControls({ select, button } = {}) {
  if (!select) {
    throw new Error('createViewControls requires a select element.');
  }
  if (!button) {
    throw new Error('createViewControls requires a simulation toggle button.');
  }

  let currentMode = select.value || 'orbit';
  let simulationRunning = true;
  const viewListeners = new Set();
  const toggleListeners = new Set();

  select.addEventListener('change', () => {
    currentMode = select.value || 'orbit';
    viewListeners.forEach((listener) => listener(currentMode));
  });

  button.addEventListener('click', () => {
    toggleListeners.forEach((listener) => listener());
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
    setViewMode,
    setSimulationRunning,
    getViewMode() {
      return currentMode;
    }
  };
}
