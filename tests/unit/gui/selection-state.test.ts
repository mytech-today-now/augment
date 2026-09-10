import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  useSelectionState,
  loadSelectionState,
  saveSelectionState,
  clearSelectionState,
  type SelectionState
} from '@cli/gui/state/selection-state';

describe('SelectionState', () => {
  const localStorageMock = (() => {
    let store: Record<string, string> = {};

    return {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      }
    };
  })();

  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true
    });
    localStorageMock.clear();
  });

  afterEach(() => {
    localStorageMock.clear();
    delete (globalThis as { localStorage?: typeof localStorageMock }).localStorage;
  });

  describe('loadSelectionState', () => {
    it('should return null if no state is stored', () => {
      const result = loadSelectionState();
      expect(result).toBeNull();
    });

    it('should load state from localStorage', () => {
      const state: SelectionState = {
        selectedModule: 'typescript-standards',
        selectedVersion: '1.2.0',
        availableVersions: ['1.0.0', '1.1.0', '1.2.0'],
        isLoading: true,
        error: 'test error'
      };

      saveSelectionState(state);
      const loaded = loadSelectionState();

      expect(loaded).not.toBeNull();
      expect(loaded?.selectedModule).toBe('typescript-standards');
      expect(loaded?.selectedVersion).toBe('1.2.0');
      expect(loaded?.availableVersions).toEqual(['1.0.0', '1.1.0', '1.2.0']);
      expect(loaded?.isLoading).toBe(false);
      expect(loaded?.error).toBeNull();
    });

    it('should handle corrupted localStorage data', () => {
      localStorageMock.setItem('augx_selection_state', 'invalid json');
      const result = loadSelectionState();

      expect(result).toBeNull();
    });

    it('should handle missing availableVersions field', () => {
      localStorageMock.setItem(
        'augx_selection_state',
        JSON.stringify({
          selectedModule: 'test',
          selectedVersion: '1.0.0'
        })
      );

      const loaded = loadSelectionState();
      expect(loaded?.availableVersions).toEqual([]);
    });
  });

  describe('saveSelectionState', () => {
    it('should save state to localStorage', () => {
      const state: SelectionState = {
        selectedModule: 'react-patterns',
        selectedVersion: '2.1.0',
        availableVersions: ['2.0.0', '2.1.0'],
        isLoading: false,
        error: null
      };

      saveSelectionState(state);
      const stored = localStorageMock.getItem('augx_selection_state');

      expect(stored).not.toBeNull();

      const parsed = JSON.parse(stored!);
      expect(parsed.selectedModule).toBe('react-patterns');
      expect(parsed.selectedVersion).toBe('2.1.0');
      expect(parsed.availableVersions).toEqual(['2.0.0', '2.1.0']);
    });

    it('should not persist loading state', () => {
      const state: SelectionState = {
        selectedModule: 'test',
        selectedVersion: '1.0.0',
        availableVersions: [],
        isLoading: true,
        error: null
      };

      saveSelectionState(state);
      const stored = localStorageMock.getItem('augx_selection_state');
      const parsed = JSON.parse(stored!);

      expect(parsed.isLoading).toBeUndefined();
    });

    it('should not persist error state', () => {
      const state: SelectionState = {
        selectedModule: 'test',
        selectedVersion: '1.0.0',
        availableVersions: [],
        isLoading: false,
        error: 'Some error occurred'
      };

      saveSelectionState(state);
      const stored = localStorageMock.getItem('augx_selection_state');
      const parsed = JSON.parse(stored!);

      expect(parsed.error).toBeUndefined();
    });
  });

  describe('clearSelectionState', () => {
    it('should remove state from localStorage', () => {
      const state: SelectionState = {
        selectedModule: 'test',
        selectedVersion: '1.0.0',
        availableVersions: ['1.0.0'],
        isLoading: false,
        error: null
      };

      saveSelectionState(state);
      expect(localStorageMock.getItem('augx_selection_state')).not.toBeNull();

      clearSelectionState();
      expect(localStorageMock.getItem('augx_selection_state')).toBeNull();
    });
  });

  describe('useSelectionState', () => {
    it('should initialize with default state', () => {
      const [state] = useSelectionState();

      expect(state.selectedModule).toBeNull();
      expect(state.selectedVersion).toBeNull();
      expect(state.availableVersions).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it('should load persisted state on initialization', () => {
      const persistedState: SelectionState = {
        selectedModule: 'beads-workflow',
        selectedVersion: '3.0.0',
        availableVersions: ['2.0.0', '3.0.0'],
        isLoading: false,
        error: null
      };

      saveSelectionState(persistedState);

      const [state] = useSelectionState();

      expect(state.selectedModule).toBe('beads-workflow');
      expect(state.selectedVersion).toBe('3.0.0');
      expect(state.availableVersions).toEqual(['2.0.0', '3.0.0']);
    });

    it('should select module and clear version', () => {
      const [state, actions] = useSelectionState();

      actions.selectModule('typescript-standards');

      expect(state.selectedModule).toBe('typescript-standards');
      expect(state.selectedVersion).toBeNull();
      expect(state.availableVersions).toEqual([]);
    });

    it('should select version', () => {
      const [state, actions] = useSelectionState();

      actions.selectVersion('1.5.0');

      expect(state.selectedVersion).toBe('1.5.0');
    });

    it('should set available versions', () => {
      const [state, actions] = useSelectionState();
      const versions = ['1.0.0', '1.1.0', '1.2.0', '2.0.0'];

      actions.setAvailableVersions(versions);

      expect(state.availableVersions).toEqual(versions);
    });

    it('should set loading state', () => {
      const [state, actions] = useSelectionState();

      actions.setLoading(true);

      expect(state.isLoading).toBe(true);

      actions.setLoading(false);

      expect(state.isLoading).toBe(false);
    });

    it('should set error state', () => {
      const [state, actions] = useSelectionState();

      actions.setError('Failed to load versions');

      expect(state.error).toBe('Failed to load versions');

      actions.setError(null);

      expect(state.error).toBeNull();
    });

    it('should clear selection', () => {
      const [state, actions] = useSelectionState();

      actions.selectModule('test-module');
      actions.selectVersion('1.0.0');
      actions.setAvailableVersions(['1.0.0', '2.0.0']);
      actions.setError('test error');

      actions.clearSelection();

      expect(state.selectedModule).toBeNull();
      expect(state.selectedVersion).toBeNull();
      expect(state.availableVersions).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(localStorageMock.getItem('augx_selection_state')).toBeNull();
    });

    it('should persist state changes to localStorage', () => {
      const [, actions] = useSelectionState();

      actions.selectModule('test-module');
      actions.selectVersion('2.0.0');
      actions.setAvailableVersions(['1.0.0', '2.0.0']);

      const stored = localStorageMock.getItem('augx_selection_state');
      expect(stored).not.toBeNull();

      const parsed = JSON.parse(stored!);
      expect(parsed.selectedModule).toBe('test-module');
      expect(parsed.selectedVersion).toBe('2.0.0');
      expect(parsed.availableVersions).toEqual(['1.0.0', '2.0.0']);
    });
  });
});
