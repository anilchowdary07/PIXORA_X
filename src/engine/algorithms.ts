// ============================================================
// Pixel Mosaic X — Reconstruction Algorithms
// ============================================================

import type { ImageInfo, MatchResult, AlgorithmType } from './types.ts';
import {
  brightness,
  packPixelKey,
  packLabKey,
  packHsvKey,
  packMultiKey,
} from './color.ts';
import { extractForegroundMask } from './segmentation.ts';

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

interface IndexedKey {
  key: number;
  index: number;
}

/**
 * Build an array of sortable keys for every pixel in an image.
 */
function buildKeys(
  info: ImageInfo,
  keyFn: (r: number, g: number, b: number, x: number, y: number, fg: boolean) => number,
  mask?: Uint8Array
): IndexedKey[] {
  const { pixels, width, totalPixels } = info;
  const keys: IndexedKey[] = new Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    const off = i * 4;
    const x = i % width;
    const y = (i / width) | 0;
    const isFg = mask ? mask[i] === 1 : false;
    keys[i] = {
      key: keyFn(pixels[off], pixels[off + 1], pixels[off + 2], x, y, isFg),
      index: i,
    };
  }
  return keys;
}

/**
 * Sort-based matching: sort source and target keys, then map indices.
 */
function sortMatch(
  source: ImageInfo,
  target: ImageInfo,
  keyFn: (r: number, g: number, b: number, x: number, y: number, fg: boolean) => number,
  algorithmName: string,
  enableSegmentation: boolean = false
): MatchResult {
  const t0 = performance.now();
  const n = Math.min(source.totalPixels, target.totalPixels);

  const srcMask = enableSegmentation ? extractForegroundMask(source) : undefined;
  const tgtMask = enableSegmentation ? extractForegroundMask(target) : undefined;

  const srcKeys = buildKeys(source, keyFn, srcMask);
  const tgtKeys = buildKeys(target, keyFn, tgtMask);

  // Sort both by key
  srcKeys.sort((a, b) => a.key - b.key);
  tgtKeys.sort((a, b) => a.key - b.key);

  // Create the mapping: for each target pixel, which source pixel
  const sourceIndices = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    sourceIndices[tgtKeys[i].index] = srcKeys[i].index;
  }

  const duration = performance.now() - t0;
  const quality = estimateQuality(source, target, sourceIndices);

  return { sourceIndices, quality, duration, algorithm: algorithmName };
}

/**
 * Estimate reconstruction quality by sampling pixel color differences.
 */
function estimateQuality(
  source: ImageInfo,
  target: ImageInfo,
  mapping: Uint32Array
): number {
  const n = mapping.length;
  const sampleSize = Math.min(n, 10000);
  const step = Math.max(1, Math.floor(n / sampleSize));
  let totalDiff = 0;
  let count = 0;

  for (let i = 0; i < n; i += step) {
    const si = mapping[i];
    const to = i * 4;
    const so = si * 4;
    const dr = target.pixels[to] - source.pixels[so];
    const dg = target.pixels[to + 1] - source.pixels[so + 1];
    const db = target.pixels[to + 2] - source.pixels[so + 2];
    totalDiff += Math.sqrt(dr * dr + dg * dg + db * db);
    count++;
  }

  const avgDiff = totalDiff / count;
  // Max possible difference is sqrt(3 * 255^2) ≈ 441.7
  return Math.max(0, 1 - avgDiff / 441.7);
}

// ------------------------------------------------------------
// Algorithm Implementations
// ------------------------------------------------------------

/**
 * Brightness Sort: Sort pixels by luminance, map sorted indices.
 * Fast O(n log n), decent quality for grayscale-like images.
 */
export function matchBrightness(source: ImageInfo, target: ImageInfo, enableSegmentation = false): MatchResult {
  return sortMatch(source, target, (r, g, b, _x, _y, fg) => {
    return (fg ? 1000000 : 0) + brightness(r, g, b);
  }, 'brightness', enableSegmentation);
}

/**
 * HSV Color Matching: Use HSV-packed keys for color-aware matching.
 */
export function matchHSV(source: ImageInfo, target: ImageInfo, enableSegmentation = false): MatchResult {
  return sortMatch(source, target, packHsvKey, 'hsv', enableSegmentation);
}

/**
 * CIE Lab Perceptual Matching: Best perceptual quality using Lab space.
 */
export function matchLab(source: ImageInfo, target: ImageInfo, enableSegmentation = false): MatchResult {
  return sortMatch(source, target, packLabKey, 'lab', enableSegmentation);
}

/**
 * Multi-dimensional Matching: Combines brightness, Lab, HSV features.
 */
export function matchMultidimensional(source: ImageInfo, target: ImageInfo, enableSegmentation = false): MatchResult {
  return sortMatch(source, target, packMultiKey, 'multidimensional', enableSegmentation);
}

/**
 * Spatial-Aware Assignment: Divide image into grid, match within regions.
 */
export function matchSpatial(source: ImageInfo, target: ImageInfo, enableSegmentation = false): MatchResult {
  const t0 = performance.now();
  const n = Math.min(source.totalPixels, target.totalPixels);
  const sourceIndices = new Uint32Array(n);

  const srcMask = enableSegmentation ? extractForegroundMask(source) : undefined;
  const tgtMask = enableSegmentation ? extractForegroundMask(target) : undefined;

  // Grid size: 8x8 regions
  const gridSize = 8;
  const srcW = source.width;
  const srcH = source.height;
  const tgtW = target.width;
  const tgtH = target.height;

  // Bucket pixels by grid region
  const srcBuckets: Map<number, IndexedKey[]> = new Map();
  const tgtBuckets: Map<number, IndexedKey[]> = new Map();

  for (let i = 0; i < source.totalPixels && i < n; i++) {
    const x = i % srcW;
    const y = (i / srcW) | 0;
    const gx = Math.min(gridSize - 1, (x / srcW * gridSize) | 0);
    const gy = Math.min(gridSize - 1, (y / srcH * gridSize) | 0);
    const region = gy * gridSize + gx;
    const off = i * 4;
    const isFg = srcMask ? srcMask[i] === 1 : false;
    const key = packLabKey(
      source.pixels[off], source.pixels[off + 1], source.pixels[off + 2],
      x, y, isFg
    );
    if (!srcBuckets.has(region)) srcBuckets.set(region, []);
    srcBuckets.get(region)!.push({ key, index: i });
  }

  for (let i = 0; i < target.totalPixels && i < n; i++) {
    const x = i % tgtW;
    const y = (i / tgtW) | 0;
    const gx = Math.min(gridSize - 1, (x / tgtW * gridSize) | 0);
    const gy = Math.min(gridSize - 1, (y / tgtH * gridSize) | 0);
    const region = gy * gridSize + gx;
    const off = i * 4;
    const isFg = tgtMask ? tgtMask[i] === 1 : false;
    const key = packLabKey(
      target.pixels[off], target.pixels[off + 1], target.pixels[off + 2],
      x, y, isFg
    );
    if (!tgtBuckets.has(region)) tgtBuckets.set(region, []);
    tgtBuckets.get(region)!.push({ key, index: i });
  }

  // Match within each region
  const usedSource = new Set<number>();
  const unmatchedTarget: IndexedKey[] = [];

  for (let region = 0; region < gridSize * gridSize; region++) {
    const srcArr = srcBuckets.get(region) || [];
    const tgtArr = tgtBuckets.get(region) || [];

    srcArr.sort((a, b) => a.key - b.key);
    tgtArr.sort((a, b) => a.key - b.key);

    const matchCount = Math.min(srcArr.length, tgtArr.length);
    for (let i = 0; i < matchCount; i++) {
      sourceIndices[tgtArr[i].index] = srcArr[i].index;
      usedSource.add(srcArr[i].index);
    }

    // Collect unmatched targets
    for (let i = matchCount; i < tgtArr.length; i++) {
      unmatchedTarget.push(tgtArr[i]);
    }
  }

  // Assign remaining source pixels to unmatched targets
  if (unmatchedTarget.length > 0) {
    const remainingSource: IndexedKey[] = [];
    for (let i = 0; i < n; i++) {
      if (!usedSource.has(i)) {
        const off = i * 4;
        const isFg = srcMask ? srcMask[i] === 1 : false;
        remainingSource.push({
          key: packLabKey(source.pixels[off], source.pixels[off + 1], source.pixels[off + 2], i % srcW, (i / srcW) | 0, isFg),
          index: i,
        });
      }
    }
    remainingSource.sort((a, b) => a.key - b.key);
    unmatchedTarget.sort((a, b) => a.key - b.key);
    const remCount = Math.min(remainingSource.length, unmatchedTarget.length);
    for (let i = 0; i < remCount; i++) {
      sourceIndices[unmatchedTarget[i].index] = remainingSource[i].index;
    }
  }

  const duration = performance.now() - t0;
  const quality = estimateQuality(source, target, sourceIndices);

  return { sourceIndices, quality, duration, algorithm: 'spatial' };
}

/**
 * Regional Matching: Quadrant-based matching with Lab keys.
 */
export function matchRegional(source: ImageInfo, target: ImageInfo, enableSegmentation = false): MatchResult {
  const t0 = performance.now();
  const n = Math.min(source.totalPixels, target.totalPixels);
  const sourceIndices = new Uint32Array(n);

  const srcMask = enableSegmentation ? extractForegroundMask(source) : undefined;
  const tgtMask = enableSegmentation ? extractForegroundMask(target) : undefined;

  // 4 quadrants
  const srcW = source.width;
  const srcH = source.height;
  const tgtW = target.width;
  const tgtH = target.height;
  const srcMidX = srcW >> 1;
  const srcMidY = srcH >> 1;
  const tgtMidX = tgtW >> 1;
  const tgtMidY = tgtH >> 1;

  function getQuadrant(x: number, y: number, midX: number, midY: number): number {
    return (y < midY ? 0 : 2) + (x < midX ? 0 : 1);
  }

  const srcBuckets: IndexedKey[][] = [[], [], [], []];
  const tgtBuckets: IndexedKey[][] = [[], [], [], []];

  for (let i = 0; i < source.totalPixels && i < n; i++) {
    const x = i % srcW;
    const y = (i / srcW) | 0;
    const q = getQuadrant(x, y, srcMidX, srcMidY);
    const off = i * 4;
    const isFg = srcMask ? srcMask[i] === 1 : false;
    srcBuckets[q].push({
      key: packLabKey(source.pixels[off], source.pixels[off + 1], source.pixels[off + 2], x, y, isFg),
      index: i,
    });
  }

  for (let i = 0; i < target.totalPixels && i < n; i++) {
    const x = i % tgtW;
    const y = (i / tgtW) | 0;
    const q = getQuadrant(x, y, tgtMidX, tgtMidY);
    const off = i * 4;
    const isFg = tgtMask ? tgtMask[i] === 1 : false;
    tgtBuckets[q].push({
      key: packLabKey(target.pixels[off], target.pixels[off + 1], target.pixels[off + 2], x, y, isFg),
      index: i,
    });
  }

  const usedSource = new Set<number>();
  const unmatchedTarget: IndexedKey[] = [];

  for (let q = 0; q < 4; q++) {
    srcBuckets[q].sort((a, b) => a.key - b.key);
    tgtBuckets[q].sort((a, b) => a.key - b.key);

    const matchCount = Math.min(srcBuckets[q].length, tgtBuckets[q].length);
    for (let i = 0; i < matchCount; i++) {
      sourceIndices[tgtBuckets[q][i].index] = srcBuckets[q][i].index;
      usedSource.add(srcBuckets[q][i].index);
    }
    for (let i = matchCount; i < tgtBuckets[q].length; i++) {
      unmatchedTarget.push(tgtBuckets[q][i]);
    }
  }

  // Handle remaining
  if (unmatchedTarget.length > 0) {
    const remaining: IndexedKey[] = [];
    for (let i = 0; i < n; i++) {
      if (!usedSource.has(i)) {
        const off = i * 4;
        const isFg = srcMask ? srcMask[i] === 1 : false;
        remaining.push({
          key: packLabKey(source.pixels[off], source.pixels[off + 1], source.pixels[off + 2], i % srcW, (i / srcW) | 0, isFg),
          index: i,
        });
      }
    }
    remaining.sort((a, b) => a.key - b.key);
    unmatchedTarget.sort((a, b) => a.key - b.key);
    const cnt = Math.min(remaining.length, unmatchedTarget.length);
    for (let i = 0; i < cnt; i++) {
      sourceIndices[unmatchedTarget[i].index] = remaining[i].index;
    }
  }

  const duration = performance.now() - t0;
  const quality = estimateQuality(source, target, sourceIndices);

  return { sourceIndices, quality, duration, algorithm: 'regional' };
}

// ------------------------------------------------------------
// Router
// ------------------------------------------------------------

export function runAlgorithm(
  type: AlgorithmType,
  source: ImageInfo,
  target: ImageInfo,
  enableSegmentation = false
): MatchResult {
  switch (type) {
    case 'brightness': return matchBrightness(source, target, enableSegmentation);
    case 'hsv': return matchHSV(source, target, enableSegmentation);
    case 'lab': return matchLab(source, target, enableSegmentation);
    case 'multidimensional': return matchMultidimensional(source, target, enableSegmentation);
    case 'spatial': return matchSpatial(source, target, enableSegmentation);
    case 'regional': return matchRegional(source, target, enableSegmentation);
    default: return matchLab(source, target, enableSegmentation);
  }
}
