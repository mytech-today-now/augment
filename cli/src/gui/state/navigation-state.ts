interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_KEY = 'augx_navigation_state';

export interface NavigationState {
  currentCategory: string | null;
  currentModule: string | null;
  expandedCategories: Set<string>;
  focusedComponent: string;
}

export interface NavigationStateActions {
  setCurrentCategory(category: string | null): void;
  setCurrentModule(moduleName: string | null): void;
  toggleCategory(category: string): void;
  expandCategory(category: string): void;
  collapseCategory(category: string): void;
  setFocusedComponent(component: string): void;
}

interface NavigationStateSnapshot {
  currentCategory: string | null;
  currentModule: string | null;
  expandedCategories: string[];
  focusedComponent: string;
}

function getStorage(): StorageLike | null {
  const storage = (globalThis as { localStorage?: StorageLike }).localStorage;
  return storage ?? null;
}

export function createDefaultNavigationState(): NavigationState {
  return {
    currentCategory: null,
    currentModule: null,
    expandedCategories: new Set<string>(),
    focusedComponent: 'tree'
  };
}

function toSnapshot(state: NavigationState): NavigationStateSnapshot {
  return {
    currentCategory: state.currentCategory,
    currentModule: state.currentModule,
    expandedCategories: Array.from(state.expandedCategories),
    focusedComponent: state.focusedComponent
  };
}

function fromSnapshot(raw: unknown): NavigationState | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const snapshot = raw as Partial<NavigationStateSnapshot>;

  return {
    currentCategory: typeof snapshot.currentCategory === 'string'
      ? snapshot.currentCategory
      : null,
    currentModule: typeof snapshot.currentModule === 'string'
      ? snapshot.currentModule
      : null,
    expandedCategories: new Set(
      Array.isArray(snapshot.expandedCategories)
        ? snapshot.expandedCategories.filter(
          (category): category is string => typeof category === 'string'
        )
        : []
    ),
    focusedComponent: typeof snapshot.focusedComponent === 'string'
      ? snapshot.focusedComponent
      : 'tree'
  };
}

export function loadNavigationState(): NavigationState | null {
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

export function saveNavigationState(state: NavigationState): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(STORAGE_KEY, JSON.stringify(toSnapshot(state)));
}

export function clearNavigationState(): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.removeItem(STORAGE_KEY);
}

export function useNavigationState(): [NavigationState, NavigationStateActions] {
  const state = loadNavigationState() ?? createDefaultNavigationState();

  const persist = () => saveNavigationState(state);

  const actions: NavigationStateActions = {
    setCurrentCategory(category) {
      state.currentCategory = category;
      persist();
    },
    setCurrentModule(moduleName) {
      state.currentModule = moduleName;
      persist();
    },
    toggleCategory(category) {
      if (state.expandedCategories.has(category)) {
        state.expandedCategories.delete(category);
      } else {
        state.expandedCategories.add(category);
      }
      persist();
    },
    expandCategory(category) {
      state.expandedCategories.add(category);
      persist();
    },
    collapseCategory(category) {
      state.expandedCategories.delete(category);
      persist();
    },
    setFocusedComponent(component) {
      state.focusedComponent = component;
      persist();
    }
  };

  return [state, actions];
}
