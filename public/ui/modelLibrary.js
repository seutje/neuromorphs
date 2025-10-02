const noop = () => {};

function formatTimestamp(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return '';
  }
  try {
    const formatter = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'short',
      timeStyle: 'short'
    });
    return formatter.format(new Date(timestamp));
  } catch (_error) {
    return new Date(timestamp).toLocaleString();
  }
}

export function createModelLibrary({ container } = {}) {
  if (!container) {
    throw new Error('createModelLibrary requires a container element.');
  }
  const nameInput = container.querySelector('[data-model-name]');
  const saveButton = container.querySelector('[data-model-save]');
  const list = container.querySelector('[data-model-list]');
  const loadButton = container.querySelector('[data-model-load]');
  const exportButton = container.querySelector('[data-model-export]');
  const deleteButton = container.querySelector('[data-model-delete]');
  const emptyState = container.querySelector('[data-model-empty]');

  if (
    !nameInput ||
    !saveButton ||
    !list ||
    !loadButton ||
    !exportButton ||
    !deleteButton ||
    !emptyState
  ) {
    throw new Error('createModelLibrary requires name input, buttons, list, and empty state elements.');
  }

  let hasModelAvailable = false;
  let models = [];
  let selectedId = null;

  const saveListeners = new Set();
  const loadListeners = new Set();
  const deleteListeners = new Set();
  const exportListeners = new Set();
  const selectListeners = new Set();

  function updateSaveButton() {
    const name = nameInput.value.trim();
    saveButton.disabled = !(hasModelAvailable && name.length > 0);
  }

  function updateSelectionState() {
    const selectedOption = list.selectedOptions?.[0] ?? null;
    selectedId = selectedOption ? selectedOption.value : null;
    const hasSelection = Boolean(selectedId);
    loadButton.disabled = !hasSelection;
    exportButton.disabled = !hasSelection;
    deleteButton.disabled = !hasSelection;
    if (selectedOption) {
      selectListeners.forEach((listener) => listener(selectedId));
    }
  }

  function updateEmptyState() {
    const empty = models.length === 0;
    emptyState.hidden = !empty;
    list.classList.toggle('is-hidden', empty);
  }

  function renderList() {
    const previousSelection = selectedId;
    list.innerHTML = '';
    models.forEach((model) => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      const updatedLabel = formatTimestamp(model.updatedAt);
      if (updatedLabel) {
        option.title = `Saved ${updatedLabel}`;
      }
      if (model.id === previousSelection) {
        option.selected = true;
      }
      list.append(option);
    });
    if (previousSelection && !models.some((model) => model.id === previousSelection)) {
      list.selectedIndex = -1;
    }
    updateEmptyState();
    updateSelectionState();
  }

  nameInput.addEventListener('input', () => {
    updateSaveButton();
  });

  saveButton.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name || saveButton.disabled) {
      return;
    }
    saveListeners.forEach((listener) => listener(name));
  });

  list.addEventListener('change', () => {
    updateSelectionState();
  });

  list.addEventListener('dblclick', () => {
    if (selectedId) {
      loadListeners.forEach((listener) => listener(selectedId));
    }
  });

  loadButton.addEventListener('click', () => {
    if (!selectedId) {
      return;
    }
    loadListeners.forEach((listener) => listener(selectedId));
  });

  exportButton.addEventListener('click', () => {
    if (!selectedId) {
      return;
    }
    exportListeners.forEach((listener) => listener(selectedId));
  });

  deleteButton.addEventListener('click', () => {
    if (!selectedId) {
      return;
    }
    deleteListeners.forEach((listener) => listener(selectedId));
  });

  updateSaveButton();
  updateEmptyState();

  return {
    onSave(callback = noop) {
      if (typeof callback === 'function') {
        saveListeners.add(callback);
      }
      return () => saveListeners.delete(callback);
    },
    onLoad(callback = noop) {
      if (typeof callback === 'function') {
        loadListeners.add(callback);
      }
      return () => loadListeners.delete(callback);
    },
    onDelete(callback = noop) {
      if (typeof callback === 'function') {
        deleteListeners.add(callback);
      }
      return () => deleteListeners.delete(callback);
    },
    onExport(callback = noop) {
      if (typeof callback === 'function') {
        exportListeners.add(callback);
      }
      return () => exportListeners.delete(callback);
    },
    onSelect(callback = noop) {
      if (typeof callback === 'function') {
        selectListeners.add(callback);
      }
      return () => selectListeners.delete(callback);
    },
    setHasModelAvailable(next) {
      hasModelAvailable = Boolean(next);
      updateSaveButton();
    },
    setModels(next = []) {
      if (!Array.isArray(next)) {
        models = [];
      } else {
        models = next.map((model) => ({
          id: model.id,
          name: model.name,
          updatedAt: model.updatedAt
        }));
      }
      renderList();
    },
    clearName() {
      nameInput.value = '';
      updateSaveButton();
    },
    focusName() {
      nameInput.focus();
    },
    getSelectedId() {
      return selectedId;
    },
    setSelectedId(id) {
      selectedId = id || null;
      if (selectedId) {
        const option = Array.from(list.options).find((opt) => opt.value === selectedId);
        if (option) {
          option.selected = true;
        }
      } else {
        list.selectedIndex = -1;
      }
      updateSelectionState();
    }
  };
}
