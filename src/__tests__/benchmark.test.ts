// ============================================================
// PIXORA X — Benchmark & Stress Tests
// Tests execution duration, pixel provenance, and quality across resolutions
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  matchBrightness,
  matchHSV,
  matchLab,
  matchMultidimensional,
  matchSpatial,
  matchRegional,
} from '../engine/algorithms.ts';
import { extractForegroundMask } from '../engine/segmentation.ts';
import type { ImageInfo } from '../engine/types.ts';

function createSyntheticImage(width: number, height: number): ImageInfo {
  const totalPixels = width * height;
  const pixels = new Uint8ClampedArray(totalPixels * 4);
  const cx = width / 2;
  const cy = height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);

      // Gradient + circular subject pattern
      pixels[idx] = Math.floor(128 + 127 * Math.sin(x * 0.05));
      pixels[idx + 1] = Math.floor(128 + 127 * Math.cos(y * 0.05));
      pixels[idx + 2] = Math.floor(255 * (d / Math.max(cx, cy)));
      pixels[idx + 3] = 255;
    }
  }

  return { width, height, pixels, totalPixels };
}

describe('Resolution Scaling & Benchmarks', () => {
  const resolutions = [
    { label: '64x64 (4,096 pixels)', w: 64, h: 64 },
    { label: '128x128 (16,384 pixels)', w: 128, h: 128 },
    { label: '256x256 (65,536 pixels)', w: 256, h: 256 },
    { label: '512x512 (262,144 pixels)', w: 512, h: 512 },
  ];

  for (const { label, w, h } of resolutions) {
    it(`benchmark on ${label}`, () => {
      const src = createSyntheticImage(w, h);
      const tgt = createSyntheticImage(w, h);

      const t0 = performance.now();
      const result = matchLab(src, tgt, true);
      const duration = performance.now() - t0;

      // Assertions
      expect(result.sourceIndices.length).toBe(w * h);
      expect(result.quality).toBeGreaterThan(0.5);

      // Verify strict 1:1 pixel provenance
      const set = new Set<number>();
      for (let i = 0; i < result.sourceIndices.length; i++) {
        set.add(result.sourceIndices[i]);
      }
      expect(set.size).toBe(result.sourceIndices.length);

      console.log(`[Benchmark ${label}] Duration: ${duration.toFixed(2)}ms | Quality: ${(result.quality * 100).toFixed(1)}%`);
    });
  }

  it('verifies AI saliency extraction performance', () => {
    const img = createSyntheticImage(256, 256);
    const t0 = performance.now();
    const mask = extractForegroundMask(img);
    const duration = performance.now() - t0;

    expect(mask.length).toBe(256 * 256);
    expect(duration).toBeLessThan(100); // Under 100ms for 256x256

    // Saliency should detect both foreground and background
    let fgCount = 0;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === 1) fgCount++;
    }
    expect(fgCount).toBeGreaterThan(0);
    expect(fgCount).toBeLessThan(mask.length);
  });

  it('compares all 6 algorithms on 128x128', () => {
    const src = createSyntheticImage(128, 128);
    const tgt = createSyntheticImage(128, 128);

    const algos = [
      { name: 'brightness', fn: matchBrightness },
      { name: 'hsv', fn: matchHSV },
      { name: 'lab', fn: matchLab },
      { name: 'multidimensional', fn: matchMultidimensional },
      { name: 'spatial', fn: matchSpatial },
      { name: 'regional', fn: matchRegional },
    ];

    for (const a of algos) {
      const res = a.fn(src, tgt);
      expect(res.sourceIndices.length).toBe(128 * 128);
      expect(res.quality).toBeGreaterThan(0);
      expect(res.duration).toBeGreaterThanOrEqual(0);
    }
  });
});
