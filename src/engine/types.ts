// ============================================================
// Pixel Mosaic X — Shared Type Definitions
// ============================================================

export interface ImageInfo {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  totalPixels: number;
}

export interface MatchResult {
  sourceIndices: Uint32Array;
  quality: number;
  duration: number;
  algorithm: string;
}

export type AlgorithmType =
  | 'brightness'
  | 'hsv'
  | 'lab'
  | 'multidimensional'
  | 'spatial'
  | 'regional';

export type QualityPreset = 'fast' | 'balanced' | 'high' | 'maximum';

export interface ProcessingConfig {
  algorithm: AlgorithmType;
  preset: QualityPreset;
  maxPixels: number;
  enableSegmentation: boolean;
}

export interface AnimationConfig {
  style: AnimationStyle;
  speed: number;
  particleSize: number;
  particleCount: number;
  motionIntensity: number;
  duration: number;
}

export type AnimationStyle = 'flow' | 'explosion' | 'swarm' | 'wave' | 'morph';

export interface ProcessingProgress {
  phase: string;
  progress: number;
  message: string;
  fps?: number;
  memoryMB?: number;
}

export interface ReconstructionMetrics {
  quality: number;
  duration: number;
  algorithm: string;
  totalPixels: number;
  width: number;
  height: number;
  fps?: number;
}

export const ALGORITHM_LABELS: Record<AlgorithmType, string> = {
  brightness: 'Brightness Sort',
  hsv: 'HSV Color Match',
  lab: 'CIE Lab Perceptual',
  multidimensional: 'Multi-Dimensional',
  spatial: 'Spatial-Aware',
  regional: 'Regional Match',
};

export const PRESET_CONFIG: Record<QualityPreset, { maxPixels: number; label: string }> = {
  fast: { maxPixels: 256 * 256, label: 'Fast (256×256)' },
  balanced: { maxPixels: 512 * 512, label: 'Balanced (512×512)' },
  high: { maxPixels: 1024 * 1024, label: 'High Quality (1024×1024)' },
  maximum: { maxPixels: 1920 * 1080, label: 'Maximum (1920×1080)' },
};

export const ANIMATION_LABELS: Record<AnimationStyle, string> = {
  flow: 'Flow',
  explosion: 'Explosion',
  swarm: 'Swarm',
  wave: 'Wave',
  morph: 'Instant Morph',
};

export const DEFAULT_ANIMATION_CONFIG: AnimationConfig = {
  style: 'flow',
  speed: 1.0,
  particleSize: 2.0,
  particleCount: 500000,
  motionIntensity: 0.5,
  duration: 6,
};

export const DEFAULT_PROCESSING_CONFIG: ProcessingConfig = {
  algorithm: 'lab',
  preset: 'balanced',
  maxPixels: 512 * 512,
  enableSegmentation: false,
};
