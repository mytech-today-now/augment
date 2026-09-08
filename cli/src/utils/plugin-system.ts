/**
 * Plugin System for Augment Extensions
 * Provides extensibility through custom handlers, hooks, and plugins
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Plugin interface - all plugins must implement this
 */
export interface Plugin {
  /** Unique plugin identifier */
  id: string;
  /** Plugin name */
  name: string;
  /** Plugin version */
  version: string;
  /** Plugin description */
  description?: string;
  /** Initialize the plugin */
  initialize(): Promise<void> | void;
  /** Cleanup when plugin is unloaded */
  cleanup?(): Promise<void> | void;
}

/**
 * Inspection handler interface for custom module type handlers
 */
export interface InspectionHandler {
  /** Handler identifier */
  id: string;
  /** Module types this handler supports */
  supportedTypes: string[];
  /** Priority (higher = runs first) */
  priority?: number;
  /** Handle module inspection */
  handle(module: any, options: any): Promise<any> | any;
}

/**
 * Hook types for pre/post inspection
 */
export type HookType = 'pre-inspection' | 'post-inspection' | 'pre-load' | 'post-load';

/**
 * Hook function interface
 */
export interface Hook {
  /** Hook identifier */
  id: string;
  /** Hook type */
  type: HookType;
  /** Priority (higher = runs first) */
  priority?: number;
  /** Hook function */
  execute(context: HookContext): Promise<void> | void;
}

/**
 * Hook execution context
 */
export interface HookContext {
  /** Module being processed */
  module?: any;
  /** Options passed to command */
  options?: any;
  /** Data that can be shared between hooks */
  data?: Record<string, any>;
  /** Error if any occurred */
  error?: Error;
}

/**
 * Plugin loader and registry
 */
export class PluginLoader {
  private plugins: Map<string, Plugin> = new Map();
  private handlers: Map<string, InspectionHandler> = new Map();
  private hooks: Map<HookType, Hook[]> = new Map();

  /**
   * Register a plugin
   */
  async registerPlugin(plugin: Plugin): Promise<void> {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin ${plugin.id} is already registered`);
    }

    await plugin.initialize();
    this.plugins.set(plugin.id, plugin);
  }

  /**
   * Unregister a plugin
   */
  async unregisterPlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) {
      throw new Error(`Plugin ${pluginId} not found`);
    }

    if (plugin.cleanup) {
      await plugin.cleanup();
    }

    this.plugins.delete(pluginId);
  }

  /**
   * Register an inspection handler
   */
  registerHandler(handler: InspectionHandler): void {
    if (this.handlers.has(handler.id)) {
      throw new Error(`Handler ${handler.id} is already registered`);
    }

    this.handlers.set(handler.id, handler);
  }

  /**
   * Unregister an inspection handler
   */
  unregisterHandler(handlerId: string): void {
    this.handlers.delete(handlerId);
  }

  /**
   * Get handler for module type
   */
  getHandlerForType(moduleType: string): InspectionHandler | undefined {
    const handlers = Array.from(this.handlers.values())
      .filter(h => h.supportedTypes.includes(moduleType) || h.supportedTypes.includes('*'))
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    return handlers[0];
  }

  /**
   * Register a hook
   */
  registerHook(hook: Hook): void {
    if (!this.hooks.has(hook.type)) {
      this.hooks.set(hook.type, []);
    }

    const hooks = this.hooks.get(hook.type)!;
    hooks.push(hook);
    hooks.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * Unregister a hook
   */
  unregisterHook(hookId: string, type: HookType): void {
    const hooks = this.hooks.get(type);
    if (hooks) {
      const index = hooks.findIndex(h => h.id === hookId);
      if (index !== -1) {
        hooks.splice(index, 1);
      }
    }
  }

  /**
   * Execute hooks of a specific type
   */
  async executeHooks(type: HookType, context: HookContext): Promise<void> {
    const hooks = this.hooks.get(type) || [];

    for (const hook of hooks) {
      try {
        await hook.execute(context);
      } catch (error) {
        console.error(`Error executing hook ${hook.id}:`, error);
        context.error = error instanceof Error ? error : new Error(String(error));
        // Continue executing other hooks even if one fails
      }
    }
  }

  /**
   * Get all registered plugins
   */
  getPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get all registered handlers
   */
  getHandlers(): InspectionHandler[] {
    return Array.from(this.handlers.values());
  }

  /**
   * Get all hooks of a specific type
   */
  getHooks(type: HookType): Hook[] {
    return this.hooks.get(type) || [];
  }

  /**
   * Load plugins from a directory
   */
  async loadPluginsFromDirectory(directory: string): Promise<void> {
    if (!fs.existsSync(directory)) {
      return;
    }

    const files = fs.readdirSync(directory);

    for (const file of files) {
      if (file.endsWith('.js') || file.endsWith('.ts')) {
        const pluginPath = path.join(directory, file);
        try {
          const pluginModule = require(pluginPath);
          const plugin = pluginModule.default || pluginModule;

          if (this.isValidPlugin(plugin)) {
            await this.registerPlugin(plugin);
          }
        } catch (error) {
          console.error(`Failed to load plugin from ${pluginPath}:`, error);
        }
      }
    }
  }

  /**
   * Validate if an object is a valid plugin
   */
  private isValidPlugin(obj: any): obj is Plugin {
    return (
      obj &&
      typeof obj.id === 'string' &&
      typeof obj.name === 'string' &&
      typeof obj.version === 'string' &&
      typeof obj.initialize === 'function'
    );
  }

  /**
   * Clear all plugins, handlers, and hooks
   */
  async clear(): Promise<void> {
    // Cleanup all plugins
    for (const plugin of this.plugins.values()) {
      if (plugin.cleanup) {
        await plugin.cleanup();
      }
    }

    this.plugins.clear();
    this.handlers.clear();
    this.hooks.clear();
  }
}

/**
 * Global plugin loader instance
 */
export const pluginLoader = new PluginLoader();

