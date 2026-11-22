// ============================================================
// Pixel Mosaic X — Renderer Utilities
// ============================================================

import type { ImageInfo } from '../engine/types.ts';

/**
 * Prepare particle data from source/target images and a pixel mapping.
 *
 * Returns typed arrays ready for GPU upload:
 * - sourcePositions: [sx, sy, ...] normalized 0-1
 * - targetPositions: [tx, ty, ...] normalized 0-1
 * - colors: [r, g, b, ...] uint8
 * - count: number of particles
 */
export function prepareParticleData(
  sourceInfo: ImageInfo,
  targetInfo: ImageInfo,
  mapping: Uint32Array,
  maxParticles: number
): {
  sourcePositions: Float32Array;
  targetPositions: Float32Array;
  colors: Uint8Array;
  count: number;
} {
  const totalPixels = mapping.length;
  const shouldSample = totalPixels > maxParticles;
  const count = shouldSample ? maxParticles : totalPixels;

  const sourcePositions = new Float32Array(count * 2);
  const targetPositions = new Float32Array(count * 2);
  const colors = new Uint8Array(count * 3);

  const srcW = sourceInfo.width;
  const srcH = sourceInfo.height;
  const tgtW = targetInfo.width;
  const tgtH = targetInfo.height;

  if (shouldSample) {
    // Uniform sampling with deterministic pattern
    const step = totalPixels / maxParticles;
    for (let j = 0; j < count; j++) {
      const i = Math.min(totalPixels - 1, Math.floor(j * step));
      const si = mapping[i];

      // Source position (where this pixel comes from)
      const sx = (si % srcW) / srcW;
      const sy = Math.floor(si / srcW) / srcH;

      // Target position (where this pixel goes to)
      const tx = (i % tgtW) / tgtW;
      const ty = Math.floor(i / tgtW) / tgtH;

      sourcePositions[j * 2] = sx;
      sourcePositions[j * 2 + 1] = sy;
      targetPositions[j * 2] = tx;
      targetPositions[j * 2 + 1] = ty;

      // Color from source pixel
      const so = si * 4;
      colors[j * 3] = sourceInfo.pixels[so];
      colors[j * 3 + 1] = sourceInfo.pixels[so + 1];
      colors[j * 3 + 2] = sourceInfo.pixels[so + 2];
    }
  } else {
    for (let i = 0; i < count; i++) {
      const si = mapping[i];

      const sx = (si % srcW) / srcW;
      const sy = Math.floor(si / srcW) / srcH;
      const tx = (i % tgtW) / tgtW;
      const ty = Math.floor(i / tgtW) / tgtH;

      sourcePositions[i * 2] = sx;
      sourcePositions[i * 2 + 1] = sy;
      targetPositions[i * 2] = tx;
      targetPositions[i * 2 + 1] = ty;

      const so = si * 4;
      colors[i * 3] = sourceInfo.pixels[so];
      colors[i * 3 + 1] = sourceInfo.pixels[so + 1];
      colors[i * 3 + 2] = sourceInfo.pixels[so + 2];
    }
  }

  return { sourcePositions, targetPositions, colors, count };
}
