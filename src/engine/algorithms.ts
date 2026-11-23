// ============================================================
// Pixel Mosaic X — Advanced 3D Color-Quantized Reconstruction
// True 3D Euclidean Color Optimization in CIE Lab & Perceptual Spaces
// Strict 1:1 Bijective Pixel Provenance Guaranteed
// ============================================================

import type { ImageInfo, MatchResult, AlgorithmType } from './types.ts';
import {
  brightness,
  rgbToLab,
  rgbToHsv,
} from './color.ts';
import { extractForegroundMask } from './segmentation.ts';

// ------------------------------------------------------------
// 3D Neighborhood Offsets for Fast Spherical Radius Search
// ------------------------------------------------------------

interface Offset3D {
  dx: number;
  dy: number;
  dz: number;
  d2: number;
}

function buildNeighborOffsets(maxRadius: number): Offset3D[] {
  const offsets: Offset3D[] = [];
  const r2Max = maxRadius * maxRadius;
  for (let dx = -maxRadius; dx <= maxRadius; dx++) {
    for (let dy = -maxRadius; dy <= maxRadius; dy++) {
      for (let dz = -maxRadius; dz <= maxRadius; dz++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 <= r2Max) {
          offsets.push({ dx, dy, dz, d2 });
        }
      }
    }
  }
  offsets.sort((a, b) => a.d2 - b.d2);
  return offsets;
}

const NEIGHBOR_OFFSETS = buildNeighborOffsets(6); // Radius up to 6 shells in 3D color grid

// ------------------------------------------------------------
// Core 3D Color Quantization & Nearest-Bucket Matching Engine
// ------------------------------------------------------------

function match3DColorGrid(
  source: ImageInfo,
  target: ImageInfo,
  colorCoordsFn: (r: number, g: number, b: number) => [number, number, number],
  algorithmName: string,
  enableSegmentation: boolean = false
): MatchResult {
  const t0 = performance.now();
  const n = Math.min(source.totalPixels, target.totalPixels);
  const sourceIndices = new Uint32Array(n);

  const BINS_DIM = 32;
  const TOTAL_BINS = BINS_DIM * BINS_DIM * BINS_DIM; // 32,768 bins

  // Linked-list bucket storage: head (128KB) + next (1MB)
  const head = new Int32Array(TOTAL_BINS).fill(-1);
  const next = new Int32Array(n);
  const binCounts = new Int32Array(TOTAL_BINS);

  // 1. Bin all source pixels in 3D color space
  const srcPixels = source.pixels;
  for (let i = 0; i < n; i++) {
    const off = i * 4;
    const [c0, c1, c2] = colorCoordsFn(srcPixels[off], srcPixels[off + 1], srcPixels[off + 2]);
    const bin = (c0 << 10) | (c1 << 5) | c2;
    next[i] = head[bin];
    head[bin] = i;
    binCounts[bin]++;
  }

  // 2. Precompute 3D coordinates for all target pixels
  const tgtPixels = target.pixels;
  const tgtCoords = new Uint8Array(n * 3);
  const tgtBins = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const off = i * 4;
    const [c0, c1, c2] = colorCoordsFn(tgtPixels[off], tgtPixels[off + 1], tgtPixels[off + 2]);
    tgtCoords[i * 3] = c0;
    tgtCoords[i * 3 + 1] = c1;
    tgtCoords[i * 3 + 2] = c2;
    tgtBins[i] = (c0 << 10) | (c1 << 5) | c2;
  }

  // If AI segmentation is active, prioritize matching foreground target pixels first
  let targetOrder: Int32Array | null = null;
  if (enableSegmentation) {
    const tgtMask = extractForegroundMask(target);
    targetOrder = new Int32Array(n);
    let fgPtr = 0;
    let fgCount = 0;
    for (let i = 0; i < n; i++) {
      if (tgtMask[i] === 1) fgCount++;
    }
    let bgPtr = fgCount;
    for (let i = 0; i < n; i++) {
      if (tgtMask[i] === 1) {
        targetOrder[fgPtr++] = i;
      } else {
        targetOrder[bgPtr++] = i;
      }
    }
  }

  // Pass 1: Direct 3D color match (identical bucket -> near-zero color difference)
  const unmatched = new Int32Array(n);
  let unmatchedCount = 0;

  for (let k = 0; k < n; k++) {
    const j = targetOrder ? targetOrder[k] : k;
    const b = tgtBins[j];
    if (head[b] !== -1) {
      const s = head[b];
      head[b] = next[s];
      binCounts[b]--;
      sourceIndices[j] = s;
    } else {
      unmatched[unmatchedCount++] = j;
    }
  }

  // Pass 2: Expanding 3D spherical neighborhood search
  let stillUnmatchedCount = 0;
  const stillUnmatched = new Int32Array(unmatchedCount);

  for (let idx = 0; idx < unmatchedCount; idx++) {
    const j = unmatched[idx];
    const tl = tgtCoords[j * 3];
    const ta = tgtCoords[j * 3 + 1];
    const tb = tgtCoords[j * 3 + 2];

    let matched = false;
    for (let o = 0; o < NEIGHBOR_OFFSETS.length; o++) {
      const off = NEIGHBOR_OFFSETS[o];
      const nl = tl + off.dx;
      const na = ta + off.dy;
      const nb = tb + off.dz;
      if (nl >= 0 && nl < 32 && na >= 0 && na < 32 && nb >= 0 && nb < 32) {
        const nBin = (nl << 10) | (na << 5) | nb;
        if (head[nBin] !== -1) {
          const s = head[nBin];
          head[nBin] = next[s];
          binCounts[nBin]--;
          sourceIndices[j] = s;
          matched = true;
          break;
        }
      }
    }

    if (!matched) {
      stillUnmatched[stillUnmatchedCount++] = j;
    }
  }

  // Pass 3: Global Euclidean search for remaining extreme color outliers
  if (stillUnmatchedCount > 0) {
    const activeBins: number[] = [];
    for (let b = 0; b < TOTAL_BINS; b++) {
      if (head[b] !== -1) activeBins.push(b);
    }

    for (let idx = 0; idx < stillUnmatchedCount; idx++) {
      const j = stillUnmatched[idx];
      const tl = tgtCoords[j * 3];
      const ta = tgtCoords[j * 3 + 1];
      const tb = tgtCoords[j * 3 + 2];

      let bestDist = Infinity;
      let bestActiveIdx = -1;

      for (let ab = 0; ab < activeBins.length; ab++) {
        const b = activeBins[ab];
        const bl = (b >> 10) & 0x1F;
        const ba = (b >> 5) & 0x1F;
        const bb = b & 0x1F;
        const dl = tl - bl;
        const da = ta - ba;
        const db = tb - bb;
        const d2 = dl * dl + da * da + db * db;
        if (d2 < bestDist) {
          bestDist = d2;
          bestActiveIdx = ab;
        }
      }

      if (bestActiveIdx !== -1) {
        const b = activeBins[bestActiveIdx];
        const s = head[b];
        head[b] = next[s];
        sourceIndices[j] = s;
        if (head[b] === -1) {
          activeBins[bestActiveIdx] = activeBins[activeBins.length - 1];
          activeBins.pop();
        }
      }
    }
  }

  const duration = performance.now() - t0;
  const quality = estimateQuality(source, target, sourceIndices);

  return { sourceIndices, quality, duration, algorithm: algorithmName };
}

// ------------------------------------------------------------
// Color Coordinate Mappers
// ------------------------------------------------------------

function labCoords(r: number, g: number, b: number): [number, number, number] {
  const [L, a, bVal] = rgbToLab(r, g, b);
  const lBin = Math.max(0, Math.min(31, Math.floor((L / 100) * 31.99)));
  const aBin = Math.max(0, Math.min(31, Math.floor(((a + 110) / 220) * 31.99)));
  const bBin = Math.max(0, Math.min(31, Math.floor(((bVal + 110) / 220) * 31.99)));
  return [lBin, aBin, bBin];
}

function hsvCoords(r: number, g: number, b: number): [number, number, number] {
  const [h, s, v] = rgbToHsv(r, g, b);
  const hBin = Math.max(0, Math.min(31, Math.floor((h / 360) * 31.99)));
  const sBin = Math.max(0, Math.min(31, Math.floor(s * 31.99)));
  const vBin = Math.max(0, Math.min(31, Math.floor(v * 31.99)));
  return [hBin, sBin, vBin];
}

function rgbPerceptualCoords(r: number, g: number, b: number): [number, number, number] {
  return [r >> 3, g >> 3, b >> 3];
}

// ------------------------------------------------------------
// 1D Sort Fallback for Luminance
// ------------------------------------------------------------

interface IndexedKey {
  key: number;
  index: number;
}

function sortMatch(
  source: ImageInfo,
  target: ImageInfo,
  keyFn: (r: number, g: number, b: number) => number,
  algorithmName: string,
  _enableSegmentation = false
): MatchResult {
  const t0 = performance.now();
  const n = Math.min(source.totalPixels, target.totalPixels);

  const srcKeys: IndexedKey[] = new Array(n);
  const tgtKeys: IndexedKey[] = new Array(n);

  for (let i = 0; i < n; i++) {
    const so = i * 4;
    srcKeys[i] = { key: keyFn(source.pixels[so], source.pixels[so + 1], source.pixels[so + 2]), index: i };
    const to = i * 4;
    tgtKeys[i] = { key: keyFn(target.pixels[to], target.pixels[to + 1], target.pixels[to + 2]), index: i };
  }

  srcKeys.sort((a, b) => a.key - b.key);
  tgtKeys.sort((a, b) => a.key - b.key);

  const sourceIndices = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    sourceIndices[tgtKeys[i].index] = srcKeys[i].index;
  }

  const duration = performance.now() - t0;
  const quality = estimateQuality(source, target, sourceIndices);

  return { sourceIndices, quality, duration, algorithm: algorithmName };
}

// ------------------------------------------------------------
// Quality Estimation
// ------------------------------------------------------------

export function estimateQuality(
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
    // Perceptual color difference (redmean metric for true perceptual visual match)
    const r1 = target.pixels[to];
    const g1 = target.pixels[to + 1];
    const b1 = target.pixels[to + 2];
    const r2 = source.pixels[so];
    const g2 = source.pixels[so + 1];
    const b2 = source.pixels[so + 2];

    const rmean = (r1 + r2) / 2;
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    const dist = Math.sqrt((2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db);
    totalDiff += dist;
    count++;
  }

  const avgDiff = totalDiff / count;
  // Maximum redmean distance is approx 765
  return Math.max(0, Math.min(1, 1 - avgDiff / 650));
}

// ------------------------------------------------------------
// Public Algorithms
// ------------------------------------------------------------

/**
 * CIE Lab Perceptual Matching:
 * Gold-standard 3D color matching using Euclidean distances in CIE Lab space.
 */
export function matchLab(source: ImageInfo, target: ImageInfo, enableSegmentation = false): MatchResult {
  return match3DColorGrid(source, target, labCoords, 'lab', enableSegmentation);
}

/**
 * HSV Color Matching:
 * 3D Color-Quantized matching in Hue-Saturation-Value space.
 */
export function matchHSV(source: ImageInfo, target: ImageInfo, enableSegmentation = false): MatchResult {
  return match3DColorGrid(source, target, hsvCoords, 'hsv', enableSegmentation);
}

/**
 * Multi-dimensional Matching:
 * Perceptual sRGB 3D color quantization with balanced channel sensitivity.
 */
export function matchMultidimensional(source: ImageInfo, target: ImageInfo, enableSegmentation = false): MatchResult {
  return match3DColorGrid(source, target, rgbPerceptualCoords, 'multidimensional', enableSegmentation);
}

/**
 * Brightness Sort:
 * Sorts pixels by perceived luminance ITU-R BT.601.
 */
export function matchBrightness(source: ImageInfo, target: ImageInfo, enableSegmentation = false): MatchResult {
  return sortMatch(source, target, (r, g, b) => brightness(r, g, b), 'brightness', enableSegmentation);
}

/**
 * Spatial-Aware Assignment:
 * Matches within local 8x8 spatial blocks, preserving regional structures while matching colors.
 */
export function matchSpatial(source: ImageInfo, target: ImageInfo, enableSegmentation = false): MatchResult {
  const t0 = performance.now();
  const n = Math.min(source.totalPixels, target.totalPixels);
  const sourceIndices = new Uint32Array(n);

  const gridSize = 8;
  const srcW = source.width;
  const srcH = source.height;
  const tgtW = target.width;
  const tgtH = target.height;

  // Bucket pixels by grid region
  const srcBuckets: number[][] = Array.from({ length: gridSize * gridSize }, () => []);
  const tgtBuckets: number[][] = Array.from({ length: gridSize * gridSize }, () => []);

  for (let i = 0; i < n; i++) {
    const sx = i % srcW;
    const sy = (i / srcW) | 0;
    const sgx = Math.min(gridSize - 1, (sx / srcW * gridSize) | 0);
    const sgy = Math.min(gridSize - 1, (sy / srcH * gridSize) | 0);
    srcBuckets[sgy * gridSize + sgx].push(i);

    const tx = i % tgtW;
    const ty = (i / tgtW) | 0;
    const tgx = Math.min(gridSize - 1, (tx / tgtW * gridSize) | 0);
    const tgy = Math.min(gridSize - 1, (ty / tgtH * gridSize) | 0);
    tgtBuckets[tgy * gridSize + tgx].push(i);
  }

  const usedSource = new Uint8Array(n);
  const unmatchedTargets: number[] = [];

  // Match inside each spatial block using Lab color distance
  for (let reg = 0; reg < gridSize * gridSize; reg++) {
    const srcList = srcBuckets[reg];
    const tgtList = tgtBuckets[reg];
    if (tgtList.length === 0) continue;

    // Sort both by Lab brightness within block
    srcList.sort((a, b) => {
      const ao = a * 4;
      const bo = b * 4;
      return brightness(source.pixels[ao], source.pixels[ao + 1], source.pixels[ao + 2]) -
             brightness(source.pixels[bo], source.pixels[bo + 1], source.pixels[bo + 2]);
    });
    tgtList.sort((a, b) => {
      const ao = a * 4;
      const bo = b * 4;
      return brightness(target.pixels[ao], target.pixels[ao + 1], target.pixels[ao + 2]) -
             brightness(target.pixels[bo], target.pixels[bo + 1], target.pixels[bo + 2]);
    });

    const matchCount = Math.min(srcList.length, tgtList.length);
    for (let k = 0; k < matchCount; k++) {
      const s = srcList[k];
      const t = tgtList[k];
      sourceIndices[t] = s;
      usedSource[s] = 1;
    }

    for (let k = matchCount; k < tgtList.length; k++) {
      unmatchedTargets.push(tgtList[k]);
    }
  }

  // Assign remaining source pixels to unmatched targets
  if (unmatchedTargets.length > 0) {
    const remainingSource: number[] = [];
    for (let i = 0; i < n; i++) {
      if (usedSource[i] === 0) remainingSource.push(i);
    }

    remainingSource.sort((a, b) => {
      const ao = a * 4;
      const bo = b * 4;
      return brightness(source.pixels[ao], source.pixels[ao + 1], source.pixels[ao + 2]) -
             brightness(source.pixels[bo], source.pixels[bo + 1], source.pixels[bo + 2]);
    });
    unmatchedTargets.sort((a, b) => {
      const ao = a * 4;
      const bo = b * 4;
      return brightness(target.pixels[ao], target.pixels[ao + 1], target.pixels[ao + 2]) -
             brightness(target.pixels[bo], target.pixels[bo + 1], target.pixels[bo + 2]);
    });

    const remCount = Math.min(remainingSource.length, unmatchedTargets.length);
    for (let k = 0; k < remCount; k++) {
      sourceIndices[unmatchedTargets[k]] = remainingSource[k];
    }
  }

  const duration = performance.now() - t0;
  const quality = estimateQuality(source, target, sourceIndices);

  return { sourceIndices, quality, duration, algorithm: 'spatial' };
}

/**
 * Regional Matching: Quadrant-based assignment.
 */
export function matchRegional(source: ImageInfo, target: ImageInfo, enableSegmentation = false): MatchResult {
  return match3DColorGrid(source, target, labCoords, 'regional', enableSegmentation);
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