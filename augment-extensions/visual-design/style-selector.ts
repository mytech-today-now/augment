/**
 * Style Selector - Vendor Priority and Fallback Logic
 *
 * This module implements the default fallback chain for vendor style selection:
 * 1. Google Modern (Material 3 Expressive) - Primary
 * 2. Microsoft Fluent 2 - Secondary
 * 3. Amazon Cloudscape - Tertiary
 *
 * The priority chain can be overridden via .augment/extensions.json configuration.
 */

import { VendorStyle, StylePreferences, StyleSelector } from './types';
import { GOOGLE_MODERN } from './domains/web-page-styles/google-modern';
import { MICROSOFT_FLUENT } from './domains/web-page-styles/microsoft-fluent';
import { AMAZON_CLOUDSCAPE } from './domains/web-page-styles/amazon-cloudscape';

// ============================================================================
// Default Vendor Priority Chain
// ============================================================================

/**
 * Default vendor priority order:
 * 1. Google (Material 3 Expressive)
 * 2. Microsoft (Fluent 2)
 * 3. Amazon (Cloudscape)
 */
export const DEFAULT_VENDOR_PRIORITY: string[] = ['google', 'microsoft', 'amazon'];

/**
 * Vendor style registry
 * Maps vendor names to their corresponding VendorStyle implementations
 */
const VENDOR_STYLES: Record<string, VendorStyle> = {
  google: GOOGLE_MODERN,
  microsoft: MICROSOFT_FLUENT,
  amazon: AMAZON_CLOUDSCAPE
};

// ============================================================================
// Style Selector Implementation
// ============================================================================

/**
 * Creates a style selector with configurable vendor priority
 *
 * @param vendorPriority - Optional custom vendor priority order
 * @returns StyleSelector instance
 */
export function createStyleSelector(
  vendorPriority: string[] = DEFAULT_VENDOR_PRIORITY
): StyleSelector {
  return {
    vendorPriority,
    fallbackChain: vendorPriority,

    /**
     * Selects a vendor style based on preferences and fallback chain
     *
     * @param preferences - Optional style preferences
     * @returns Selected VendorStyle
     */
    selectStyle(preferences?: StylePreferences): VendorStyle {
      // If vendor preference is specified, try to use it
      if (preferences?.vendor) {
        const preferredStyle = VENDOR_STYLES[preferences.vendor.toLowerCase()];
        if (preferredStyle) {
          return preferredStyle;
        }
        console.warn(
          `Vendor "${preferences.vendor}" not found. Falling back to priority chain.`
        );
      }

      // Use fallback chain to select vendor
      for (const vendor of this.fallbackChain) {
        const style = VENDOR_STYLES[vendor.toLowerCase()];
        if (style) {
          return style;
        }
      }

      // Ultimate fallback: return Google Modern
      console.warn('No vendor found in fallback chain. Using Google Modern as default.');
      return GOOGLE_MODERN;
    }
  };
}

/**
 * Default style selector instance
 * Uses the default vendor priority: google → microsoft → amazon
 */
export const defaultStyleSelector = createStyleSelector();

/**
 * Selects a vendor style using the default priority chain
 *
 * @param preferences - Optional style preferences
 * @returns Selected VendorStyle
 */
export function selectVendorStyle(preferences?: StylePreferences): VendorStyle {
  return defaultStyleSelector.selectStyle(preferences);
}

/**
 * Gets a specific vendor style by name
 *
 * @param vendor - Vendor name ('google', 'microsoft', or 'amazon')
 * @returns VendorStyle or undefined if not found
 */
export function getVendorStyle(vendor: string): VendorStyle | undefined {
  return VENDOR_STYLES[vendor.toLowerCase()];
}

/**
 * Gets all available vendor styles
 *
 * @returns Array of all VendorStyle implementations
 */
export function getAllVendorStyles(): VendorStyle[] {
  return Object.values(VENDOR_STYLES);
}

/**
 * Checks if a vendor style exists
 *
 * @param vendor - Vendor name to check
 * @returns true if vendor exists, false otherwise
 */
export function hasVendorStyle(vendor: string): boolean {
  return vendor.toLowerCase() in VENDOR_STYLES;
}

// ============================================================================
// Usage Examples for AI Agents
// ============================================================================

/**
 * EXAMPLE 1: Use default priority chain
 *
 * ```typescript
 * import { selectVendorStyle } from './style-selector';
 *
 * const style = selectVendorStyle();
 * // Returns GOOGLE_MODERN (first in priority chain)
 * ```
 *
 * EXAMPLE 2: Specify vendor preference
 *
 * ```typescript
 * import { selectVendorStyle } from './style-selector';
 *
 * const style = selectVendorStyle({ vendor: 'microsoft' });
 * // Returns MICROSOFT_FLUENT
 * ```
 *
 * EXAMPLE 3: Custom priority chain
 *
 * ```typescript
 * import { createStyleSelector } from './style-selector';
 *
 * const selector = createStyleSelector(['amazon', 'microsoft', 'google']);
 * const style = selector.selectStyle();
 * // Returns AMAZON_CLOUDSCAPE (first in custom chain)
 * ```
 */

export default {
  createStyleSelector,
  defaultStyleSelector,
  selectVendorStyle,
  getVendorStyle,
  getAllVendorStyles,
  hasVendorStyle,
  DEFAULT_VENDOR_PRIORITY
};

