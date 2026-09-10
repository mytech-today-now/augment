interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_KEY = 'augx_selection_state';

export interface SelectionState {
  selectedModule: string | null;
  selectedVersion: string | null;
  availableVersions: string[];
  isLoading: boolean;
  error: string | null;
}

export interface SelectionStateActions {
  selectModule(moduleName: string): void;
  selectVersion(version: string): void;
  setAvailableVersions(versions: string[]): void;
  setLoading(isLoading: boolean): void;
  setError(error: string | null): void;
  clearSelection(): void;
}

interface SelectionStateSnapshot {
  selectedModule: string | null;
  selectedVersion: string | null;
  availableVersions: string[];
}

function getStorage(): StorageLike | null {
  const storage = (globalThis as { localStorage?: StorageLike }).localStorage;
  return storage ?? null;
}

export function createDefaultSelectionState(): SelectionState {
  return {
    selectedModule: null,
    selectedVersion: null,
    availableVersions: [],
    isLoading: false,
    error: null
  };
}

function toSnapshot(state: SelectionState): SelectionStateSnapshot {
  return {
    selectedModule: state.selectedModule,
    selectedVersion: state.selectedVersion,
    availableVersions: [...state.availableVersions]
  };
}

function fromSnapshot(raw: unknown): SelectionState | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const snapshot = raw as Partial<SelectionStateSnapshot>;

  return {
    selectedModule: typeof snapshot.selectedModule === 'string'
      ? snapshot.selectedModule
      : null,
    selectedVersion: typeof snapshot.selectedVersion === 'string'
      ? snapshot.selectedVersion
      : null,
    availableVersions: Array.isArray(snapshot.availableVersions)
      ? snapshot.availableVersions.filter(
        (version): version is string => typeof version === 'string'
      )
      : [],
    isLoading: false,
    error: null
  };
}

export function loadSelectionState(): SelectionState | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return fromSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveSelectionState(state: SelectionState): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(STORAGE_KEY, JSON.stringify(toSnapshot(state)));
}

export function clearSelectionState(): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(STORAGE_KEY);
}

export function useSelectionState(): [SelectionState, SelectionStateActions] {
  const state = loadSelectionState() ?? createDefaultSelectionState();

  const persist = () => saveSelectionState(state);

  const actions: SelectionStateActions = {
    selectModule(moduleName) {
      state.selectedModule = moduleName;
      state.selectedVersion = null;
      state.availableVersions = [];
      state.isLoading = false;
      state.error = null;
      persist();
    },
    selectVersion(version) {
      state.selectedVersion = version;
      persist();
    },
    setAvailableVersions(versions) {
      state.availableVersions = [...versions];
      persist();
    },
    setLoading(isLoading) {
      state.isLoading = isLoading;
      persist();
    },
    setError(error) {
      state.error = error;
      persist();
    },
    clearSelection() {
      clearSelectionState();
      state.selectedModule = null;
      state.selectedVersion = null;
      state.availableVersions = [];
      state.isLoading = false;
      state.error = null;
    }
  };

  return [state, actions];
}
