/**
 * TypeScript Interface Definitions for Visual Design Module
 * 
 * Defines core types for design elements, principles, and vendor-specific styles
 */

// ============================================================================
// Core Design Interfaces
// ============================================================================

export interface DesignModule {
  name: string;
  version: string;
  description: string;
  elements: DesignElement[];
  principles: DesignPrinciple[];
  skills: SkillCategory[];
  vendorPriority: string[];
}

export interface DesignElement {
  name: string;
  description: string;
  properties: Record<string, any>;
}

export interface DesignPrinciple {
  name: string;
  description: string;
  guidelines: string[];
}

export interface SkillCategory {
  name: string;
  description: string;
  skills: string[];
}

// ============================================================================
// Color System
// ============================================================================

export interface ColorPalette {
  primary: ColorDefinition;
  secondary?: ColorDefinition;
  accent?: ColorDefinition;
  tertiary?: ColorDefinition;
  error?: ColorDefinition;
  neutral: ColorDefinition | ColorDefinition[];
  neutralVariant?: ColorDefinition;
  semantic?: SemanticColors;
  accessibility?: AccessibilityRequirements;
}

export interface ColorDefinition {
  name: string;
  hex: string;
  rgb: RGB | string;
  hsl?: HSL;
  usage?: string;
  accessibility?: string;
  variants?: ColorVariant[];
  tones?: Record<string, string> | Record<number, string>;
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export interface ColorVariant {
  name: string;
  hex: string;
  usage: string;
}

export interface SemanticColorDefinition {
  hex: string;
  usage?: string;
}

export type SemanticColorValue = string | SemanticColorDefinition;

export interface SemanticColors {
  success: SemanticColorValue;
  warning: SemanticColorValue;
  error: SemanticColorValue;
  info: SemanticColorValue;
}

export interface AccessibilityRequirements {
  minContrastRatio?: number;
  minimumContrast?: number;
  targetContrast?: number;
  wcagLevel?: 'A' | 'AA' | 'AAA';
  colorBlindSafe: boolean;
  guidelines?: string[];
}

// ============================================================================
// Typography System
// ============================================================================

export interface TypographyRules {
  fontFamilies: FontFamilies;
  typeScale?: TypeScale;
  hierarchy?: TypographyHierarchy;
  lineHeight?: LineHeightRules;
  letterSpacing?: LetterSpacingRules;
  scale?: ScaleSystem;
  guidelines?: string[];
}

export interface FontFamily {
  name: string;
  fallbacks: string[];
  weights: number[];
  styles: ('normal' | 'italic')[];
  usage: string;
}

export interface FontFamilySet {
  primary: string;
  secondary: string;
  monospace: string;
}

export type FontFamilies = FontFamily[] | FontFamilySet;

export interface NamedTypeScale {
  displayLarge: TypographyStyle;
  displayMedium: TypographyStyle;
  displaySmall: TypographyStyle;
  headlineLarge: TypographyStyle;
  headlineMedium: TypographyStyle;
  headlineSmall: TypographyStyle;
  titleLarge: TypographyStyle;
  titleMedium: TypographyStyle;
  titleSmall: TypographyStyle;
  bodyLarge: TypographyStyle;
  bodyMedium: TypographyStyle;
  bodySmall: TypographyStyle;
  labelLarge: TypographyStyle;
  labelMedium: TypographyStyle;
  labelSmall: TypographyStyle;
}

export interface NumericTypeScale {
  base: number;
  ratio: number;
  sizes: Record<string, number>;
}

export type TypeScale = NamedTypeScale | NumericTypeScale;

export interface ScaleSystem {
  base: number;
  ratio: number;
  sizes: number[];
}

export interface TypographyHierarchy {
  h1: TypographyStyle;
  h2: TypographyStyle;
  h3: TypographyStyle;
  h4: TypographyStyle;
  h5: TypographyStyle;
  h6: TypographyStyle;
  body: TypographyStyle;
  caption?: TypographyStyle;
  small?: TypographyStyle;
}

export interface TypographyStyle {
  fontSize: string;
  fontWeight: number;
  lineHeight: number | string;
  letterSpacing?: string;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  usage?: string;
}

export interface LineHeightRules {
  tight: number;
  normal: number;
  relaxed: number;
}

export interface LetterSpacingRules {
  tight: string;
  normal: string;
  wide: string;
}

// ============================================================================
// Layout System
// ============================================================================

export interface LayoutSystem {
  grid: GridSystem;
  spacing: SpacingSystem;
  breakpoints?: Breakpoints;
  containers?: ContainerRules;
  containerWidths?: Record<string, string>;
  guidelines?: string[];
}

export interface GridSystem {
  columns: number;
  gutter: string;
  margin: string;
  maxWidth?: string;
  breakpoints?: Breakpoints;
}

export interface SpacingSystem {
  base?: number;
  unit?: number;
  scale: number[];
  tokens?: Record<string, string>;
  guidelines?: string[];
}

export interface Breakpoints {
  [breakpoint: string]: string;
}

export interface ContainerRules {
  maxWidth: Record<string, string>;
  padding: Record<string, string>;
}

// ============================================================================
// Motion & Animation
// ============================================================================

export interface MotionSystem {
  durations: DurationTokens;
  easings: EasingTokens;
  animations?: AnimationPreset[];
  patterns?: Record<string, MotionPattern>;
  guidelines?: string[];
}

export type DurationTokens = Record<string, string>;

export type EasingTokens = Record<string, string>;

export interface MotionPattern {
  duration: string;
  easing: string;
  properties: string[];
}

export interface AnimationPreset {
  name: string;
  duration: string;
  easing: string;
  properties: string[];
}

// ============================================================================
// Elevation & Shadows
// ============================================================================

export interface ElevationSystem {
  levels: ElevationLevel[] | Record<string, ElevationLevel>;
  shadows?: ShadowTokens;
  guidelines?: string[];
}

export interface ElevationLevel {
  level?: number;
  shadow: string;
  usage: string;
}

export interface ShadowTokens {
  none: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
}

// ============================================================================
// Vendor-Specific Styles
// ============================================================================

export interface VendorStyle {
  vendor: 'google' | 'microsoft' | 'amazon';
  name: string;
  version: string;
  characteristics: string[];
  colorPalette: ColorPalette;
  typography: TypographyRules;
  layout: LayoutSystem;
  motion: MotionSystem;
  elevation: ElevationSystem;
  components?: ComponentLibrary;
}

export interface ComponentLibrary {
  buttons: ComponentSpec;
  inputs: ComponentSpec;
  cards: ComponentSpec;
  navigation: ComponentSpec;
}

export interface ComponentSpec {
  variants: string[];
  states: string[];
  sizes: string[];
  examples: string[];
}

// ============================================================================
// Domain-Specific Styles
// ============================================================================

export interface DomainStyle {
  domain: string;
  era?: string;
  characteristics: string[];
  colorScheme: ColorPalette;
  typography: TypographyRules;
  layout: LayoutSystem;
  examples: string[];
}

// ============================================================================
// Style Selector
// ============================================================================

export interface StyleSelector {
  vendorPriority: string[];
  fallbackChain: string[];
  selectStyle(preferences?: StylePreferences): VendorStyle;
}

export interface StylePreferences {
  vendor?: string;
  domain?: string;
  era?: string;
  accessibility?: 'A' | 'AA' | 'AAA';
}

