// ============================================================
// Pixel Mosaic X — Advanced 3D Color-Quantized Reconstruction
// True 3D Euclidean Color Optimization in CIE Lab, HSV Cone & Spatial Spaces
// Strict 1:1 Bijective Pixel Provenance Guaranteed Across All Methods
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

  // Pass 3: Tonal luminance matching for remaining out-of-gamut outlier pixels
  // Ensures highlights, midtones, and shadows remain crisp even across disparate color gamuts
  if (stillUnmatchedCount > 0) {
    const remainingSource: number[] = [];
    for (let b = 0; b < TOTAL_BINS; b++) {
      let curr = head[b];
      while (curr !== -1) {
        remainingSource.push(curr);
        curr = next[curr];
      }
    }

    remainingSource.sort((a, b) => {
      const ao = a * 4;
      const bo = b * 4;
      return brightness(srcPixels[ao], srcPixels[ao + 1], srcPixels[ao + 2]) -
             brightness(srcPixels[bo], srcPixels[bo + 1], srcPixels[bo + 2]);
    });

    const stillUnmatchedSorted = Array.from(stillUnmatched.subarray(0, stillUnmatchedCount));
    stillUnmatchedSorted.sort((a, b) => {
      const ao = a * 4;
      const bo = b * 4;
      return brightness(tgtPixels[ao], tgtPixels[ao + 1], tgtPixels[ao + 2]) -
             brightness(tgtPixels[bo], tgtPixels[bo + 1], tgtPixels[bo + 2]);
    });

    const remCount = Math.min(remainingSource.length, stillUnmatchedSorted.length);
    for (let k = 0; k < remCount; k++) {
      sourceIndices[stillUnmatchedSorted[k]] = remainingSource[k];
    }
  }

  const duration = performance.now() - t0;
  const quality = estimateQuality(source, target, sourceIndices);

  return { sourceIndices, quality, duration, algorithm: algorithmName };
}

// ------------------------------------------------------------
// Color Coordinate Mappers (Each Algorithm Uses a Distinct Metric)
// ------------------------------------------------------------

/**
 * CIE Lab coordinates: Human perceptual lightness & opponent color axes.
 */
function labCoords(r: number, g: number, b: number): [number, number, number] {
  const [L, a, bVal] = rgbToLab(r, g, b);
  const lBin = Math.max(0, Math.min(31, Math.floor((L / 100) * 31.99)));
  const aBin = Math.max(0, Math.min(31, Math.floor(((a + 110) / 220) * 31.99)));
  const bBin = Math.max(0, Math.min(31, Math.floor(((bVal + 110) / 220) * 31.99)));
  return [lBin, aBin, bBin];
}

/**
 * HSV Cone coordinates: Cylindrical projection preserving circular Hue & Saturation.
 * x = S * cos(H), y = S * sin(H), z = V
 */
function hsvConeCoords(r: number, g: number, b: number): [number, number, number] {
  const [h, s, v] = rgbToHsv(r, g, b);
  const rad = (h * Math.PI) / 180;
  const x = s * Math.cos(rad);
  const y = s * Math.sin(rad);
  const z = v;
  // x in [-1, 1], y in [-1, 1], z in [0, 1]
  const xBin = Math.max(0, Math.min(31, Math.floor((x + 1) * 15.99)));
  const yBin = Math.max(0, Math.min(31, Math.floor((y + 1) * 15.99)));
  const zBin = Math.max(0, Math.min(31, Math.floor(z * 31.99)));
  return [xBin, yBin, zBin];
}

/**
 * Multi-dimensional Perceptual Coordinates:
 * Combines luminance Y with red-green and blue-yellow chroma differentials.
 */
function multiFeatureCoords(r: number, g: number, b: number): [number, number, number] {
  const Y = Math.round(brightness(r, g, b)) & 0xFF;
  const rgDiff = Math.max(0, Math.min(255, r - g + 128));
  const byDiff = Math.max(0, Math.min(255, b - ((r + g) >> 1) + 128));
  return [Y >> 3, rgDiff >> 3, byDiff >> 3];
}

// ------------------------------------------------------------
// 1D Tonal Sort for Brightness (Chiaroscuro)
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
// Block-Based Regional & Spatial Matching Engine
// ------------------------------------------------------------

function matchBlockBased(
  source: ImageInfo,
  target: ImageInfo,
  gridSize: number,
  algorithmName: string,
  _enableSegmentation = false
): MatchResult {
  const t0 = performance.now();
  const n = Math.min(source.totalPixels, target.totalPixels);
  const sourceIndices = new Uint32Array(n);

  const srcW = source.width;
  const srcH = source.height;
  const tgtW = target.width;
  const tgtH = target.height;
  const totalBlocks = gridSize * gridSize;

  // Group pixels into spatial blocks
  const srcBlocks: number[][] = Array.from({ length: totalBlocks }, () => []);
  const tgtBlocks: number[][] = Array.from({ length: totalBlocks }, () => []);

  for (let i = 0; i < n; i++) {
    const sx = i % srcW;
    const sy = (i / srcW) | 0;
    const sBlock = Math.min(gridSize - 1, (sy / srcH * gridSize) | 0) * gridSize +
                   Math.min(gridSize - 1, (sx / srcW * gridSize) | 0);
    srcBlocks[sBlock].push(i);

    const tx = i % tgtW;
    const ty = (i / tgtW) | 0;
    const tBlock = Math.min(gridSize - 1, (ty / tgtH * gridSize) | 0) * gridSize +
                   Math.min(gridSize - 1, (tx / tgtW * gridSize) | 0);
    tgtBlocks[tBlock].push(i);
  }

  const usedSource = new Uint8Array(n);
  const unmatchedTargets: number[] = [];

  // Match pixels within each spatial block using 3D Lab color quantization
  const BINS = 4096; // 16x16x16 bins
  const bHead = new Int32Array(BINS);
  const bNext = new Int32Array(n);

  for (let b = 0; b < totalBlocks; b++) {
    const srcList = srcBlocks[b];
    const tgtList = tgtBlocks[b];
    if (tgtList.length === 0 || srcList.length === 0) {
      for (let k = 0; k < tgtList.length; k++) unmatchedTargets.push(tgtList[k]);
      continue;
    }

    bHead.fill(-1);
    for (let k = 0; k < srcList.length; k++) {
      const si = srcList[k];
      const off = si * 4;
      const [l, a, bVal] = rgbToLab(source.pixels[off], source.pixels[off + 1], source.pixels[off + 2]);
      const lb = Math.max(0, Math.min(15, (l * 0.16) | 0));
      const ab = Math.max(0, Math.min(15, ((a + 110) * 0.072) | 0));
      const bb = Math.max(0, Math.min(15, ((bVal + 110) * 0.072) | 0));
      const bin = (lb << 8) | (ab << 4) | bb;
      bNext[k] = bHead[bin];
      bHead[bin] = k;
    }

    const blockUnmatched: number[] = [];
    for (let k = 0; k < tgtList.length; k++) {
      const ti = tgtList[k];
      const off = ti * 4;
      const [l, a, bVal] = rgbToLab(target.pixels[off], target.pixels[off + 1], target.pixels[off + 2]);
      const lb = Math.max(0, Math.min(15, (l * 0.16) | 0));
      const ab = Math.max(0, Math.min(15, ((a + 110) * 0.072) | 0));
      const bb = Math.max(0, Math.min(15, ((bVal + 110) * 0.072) | 0));
      const bin = (lb << 8) | (ab << 4) | bb;

      if (bHead[bin] !== -1) {
        const sSub = bHead[bin];
        bHead[bin] = bNext[sSub];
        const si = srcList[sSub];
        sourceIndices[ti] = si;
        usedSource[si] = 1;
      } else {
        blockUnmatched.push(ti);
      }
    }

    // Secondary pass within block: sort unmatched pixels by brightness for optimal tonal matching
    const remainingSrcInBlock: number[] = [];
    for (let k = 0; k < srcList.length; k++) {
      const si = srcList[k];
      if (usedSource[si] === 0) remainingSrcInBlock.push(si);
    }

    remainingSrcInBlock.sort((a, b) => {
      const ao = a * 4;
      const bo = b * 4;
      return brightness(source.pixels[ao], source.pixels[ao + 1], source.pixels[ao + 2]) -
             brightness(source.pixels[bo], source.pixels[bo + 1], source.pixels[bo + 2]);
    });

    blockUnmatched.sort((a, b) => {
      const ao = a * 4;
      const bo = b * 4;
      return brightness(target.pixels[ao], target.pixels[ao + 1], target.pixels[ao + 2]) -
             brightness(target.pixels[bo], target.pixels[bo + 1], target.pixels[bo + 2]);
    });

    const matchLen = Math.min(remainingSrcInBlock.length, blockUnmatched.length);
    for (let k = 0; k < matchLen; k++) {
      const si = remainingSrcInBlock[k];
      const ti = blockUnmatched[k];
      sourceIndices[ti] = si;
      usedSource[si] = 1;
    }

    for (let k = matchLen; k < blockUnmatched.length; k++) {
      unmatchedTargets.push(blockUnmatched[k]);
    }
  }

  // Inter-block spillover for remaining unmatched targets
  if (unmatchedTargets.length > 0) {
    const globalRemaining: number[] = [];
    for (let i = 0; i < n; i++) {
      if (usedSource[i] === 0) globalRemaining.push(i);
    }

    globalRemaining.sort((a, b) => {
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

    const count = Math.min(globalRemaining.length, unmatchedTargets.length);
    for (let k = 0; k < count; k++) {
      sourceIndices[unmatchedTargets[k]] = globalRemaining[k];
    }
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
  return Math.max(0, Math.min(1, 1 - avgDiff / 650));
}

// ------------------------------------------------------------
// Public Algorithms (6 Distinct Reconstruction Philosophies)
// ------------------------------------------------------------

/**
 * 1. CIE Lab Perceptual Matching:
 * Gold-standard human vision perceptual Euclidean matching in D65 Lab space.
 */
export function matchLab(source: ImageInfo, target: ImageInfo, enableSegmentation = false): MatchResult {
  return match3DColorGrid(source, target, labCoords, 'lab', enableSegmentation);
}

/**
 * 2. HSV Harmonic Matching:
 * 3D cylindrical HSV cone projection preserving circular Hue and color saturation.
 */
export function matchHSV(source: ImageInfo, target: ImageInfo, enableSegmentation = false): MatchResult {
  return match3DColorGrid(source, target, hsvConeCoords, 'hsv', enableSegmentation);
}

/**
 * 3. Multi-Dimensional Feature Matching:
 * Balanced color perception and luminance contrast differentials.
 */
export function matchMultidimensional(source: ImageInfo, target: ImageInfo, enableSegmentation = false): MatchResult {
  return match3DColorGrid(source, target, multiFeatureCoords, 'multidimensional', enableSegmentation);
}

/**
 * 4. Brightness Sort:
 * Strict 1:1 luminance sort (ITU-R BT.601) yielding dramatic chiaroscuro tonal shading.
 */
export function matchBrightness(source: ImageInfo, target: ImageInfo, enableSegmentation = false): MatchResult {
  return sortMatch(source, target, (r, g, b) => brightness(r, g, b), 'brightness', enableSegmentation);
}

/**
 * 5. Spatial-Aware Flow Assignment:
 * Matches within local 8x8 spatial blocks, preserving regional structures and creating smooth particle trajectories.
 */
export function matchSpatial(source: ImageInfo, target: ImageInfo, enableSegmentation = false): MatchResult {
  return matchBlockBased(source, target, 8, 'spatial', enableSegmentation);
}

/**
 * 6. Regional Matching:
 * 16-quadrant (4x4) hierarchical regional decomposition for macro color containment.
 */
export function matchRegional(source: ImageInfo, target: ImageInfo, enableSegmentation = false): MatchResult {
  return matchBlockBased(source, target, 4, 'regional', enableSegmentation);
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
