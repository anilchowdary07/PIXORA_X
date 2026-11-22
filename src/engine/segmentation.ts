// ============================================================
// Pixel Mosaic X — Perceptual Saliency & Subject Segmentation
// ============================================================

import type { ImageInfo } from './types.ts';
import { rgbToLab } from './color.ts';

/**
 * Compute an in-browser saliency mask for foreground/subject extraction.
 *
 * Algorithm:
 * 1. Background prior: pixels along image boundaries are used to model background color in Lab space.
 * 2. Spatial prior: Gaussian center-bias reflects natural photography composition.
 * 3. Color contrast: Euclidean Lab distance from the background color model.
 * 4. Otsu's optimal thresholding: automatically finds the bimodal separation between foreground and background.
 *
 * Returns a Uint8Array where 1 = foreground, 0 = background.
 */
export function extractForegroundMask(info: ImageInfo): Uint8Array {
  const { pixels, width, height, totalPixels } = info;
  const mask = new Uint8Array(totalPixels);

  if (totalPixels === 0) return mask;

  // 1. Sample border pixels to build background color estimate
  let bgL = 0;
  let bga = 0;
  let bgb = 0;
  let bgCount = 0;

  const borderWidth = Math.max(1, Math.floor(Math.min(width, height) * 0.05));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isBorder =
        x < borderWidth ||
        x >= width - borderWidth ||
        y < borderWidth ||
        y >= height - borderWidth;

      if (isBorder) {
        const off = (y * width + x) * 4;
        const [l, a, b] = rgbToLab(pixels[off], pixels[off + 1], pixels[off + 2]);
        bgL += l;
        bga += a;
        bgb += b;
        bgCount++;
      }
    }
  }

  if (bgCount > 0) {
    bgL /= bgCount;
    bga /= bgCount;
    bgb /= bgCount;
  }

  // 2. Compute saliency map with spatial center-bias
  const saliency = new Float32Array(totalPixels);
  const cx = width / 2;
  const cy = height / 2;
  const maxDistSq = (cx * cx + cy * cy) || 1;
  let minSal = Infinity;
  let maxSal = -Infinity;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const off = idx * 4;
      const [l, a, b] = rgbToLab(pixels[off], pixels[off + 1], pixels[off + 2]);

      // Lab color difference from background
      const dl = l - bgL;
      const da = a - bga;
      const db = b - bgb;
      const colorDiff = Math.sqrt(dl * dl + da * da + db * db);

      // Center distance (normalized 0-1)
      const dx = x - cx;
      const dy = y - cy;
      const distSq = dx * dx + dy * dy;
      const centerFactor = Math.exp(-distSq / (2 * (maxDistSq * 0.25)));

      // Combined saliency
      const sal = colorDiff * (0.35 + 0.65 * centerFactor);
      saliency[idx] = sal;

      if (sal < minSal) minSal = sal;
      if (sal > maxSal) maxSal = sal;
    }
  }

  // 3. Normalize to [0, 255] for Otsu's thresholding
  const range = maxSal - minSal || 1;
  const histogram = new Int32Array(256);
  const normalizedSal = new Uint8Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    const val = Math.floor(((saliency[i] - minSal) / range) * 255);
    const clamped = Math.max(0, Math.min(255, val));
    normalizedSal[i] = clamped;
    histogram[clamped]++;
  }

  // 4. Otsu's Thresholding
  let total = totalPixels;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * histogram[t];

  let sumB = 0;
  let wB = 0;
  let maxVariance = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;

    const varianceBetween = wB * wF * (mB - mF) * (mB - mF);
    if (varianceBetween > maxVariance) {
      maxVariance = varianceBetween;
      threshold = t;
    }
  }

  // 5. Build binary foreground mask
  for (let i = 0; i < totalPixels; i++) {
    mask[i] = normalizedSal[i] >= threshold ? 1 : 0;
  }

  return mask;
}
