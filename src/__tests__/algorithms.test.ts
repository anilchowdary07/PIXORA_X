// ============================================================
// Pixel Mosaic X — Algorithm Tests
// ============================================================

import { describe, it, expect } from 'vitest';
import { rgbToLab, rgbToHsv, brightness, packPixelKey } from '../engine/color.ts';
import {
  matchBrightness,
  matchHSV,
  matchLab,
  matchMultidimensional,
  matchSpatial,
  matchRegional,
} from '../engine/algorithms.ts';
import type { ImageInfo } from '../engine/types.ts';

// ---- Helpers ----

function createTestImage(
  width: number,
  height: number,
  pattern: 'gradient' | 'random' | 'solid'
): ImageInfo {
  const totalPixels = width * height;
  const pixels = new Uint8ClampedArray(totalPixels * 4);

  for (let i = 0; i < totalPixels; i++) {
    const off = i * 4;
    if (pattern === 'gradient') {
      const v = Math.floor((i / totalPixels) * 255);
      pixels[off] = v;
      pixels[off + 1] = v;
      pixels[off + 2] = v;
    } else if (pattern === 'random') {
      pixels[off] = (i * 73 + 17) % 256;
      pixels[off + 1] = (i * 137 + 43) % 256;
      pixels[off + 2] = (i * 211 + 97) % 256;
    } else {
      pixels[off] = 128;
      pixels[off + 1] = 128;
      pixels[off + 2] = 128;
    }
    pixels[off + 3] = 255;
  }

  return { width, height, pixels, totalPixels };
}

// ---- Color Conversion Tests ----

describe('Color Conversions', () => {
  it('brightness of black is 0', () => {
    expect(brightness(0, 0, 0)).toBe(0);
  });

  it('brightness of white is 255', () => {
    expect(brightness(255, 255, 255)).toBeCloseTo(255, 0);
  });

  it('brightness of red uses correct weight', () => {
    expect(brightness(255, 0, 0)).toBeCloseTo(76.245, 0);
  });

  it('rgbToHsv of pure red', () => {
    const [h, s, v] = rgbToHsv(255, 0, 0);
    expect(h).toBeCloseTo(0, 0);
    expect(s).toBeCloseTo(1, 2);
    expect(v).toBeCloseTo(1, 2);
  });

  it('rgbToHsv of pure green', () => {
    const [h, s, v] = rgbToHsv(0, 255, 0);
    expect(h).toBeCloseTo(120, 0);
    expect(s).toBeCloseTo(1, 2);
    expect(v).toBeCloseTo(1, 2);
  });

  it('rgbToLab of black is (0, 0, 0)', () => {
    const [L, a, b] = rgbToLab(0, 0, 0);
    expect(L).toBeCloseTo(0, 0);
    expect(a).toBeCloseTo(0, 0);
    expect(b).toBeCloseTo(0, 0);
  });

  it('rgbToLab of white has L ≈ 100', () => {
    const [L] = rgbToLab(255, 255, 255);
    expect(L).toBeCloseTo(100, 0);
  });

  it('packPixelKey returns a number', () => {
    const key = packPixelKey(128, 64, 200, 10, 20, false);
    expect(typeof key).toBe('number');
    expect(key).toBeGreaterThan(0);
  });

  it('foreground key > background key for same pixel', () => {
    const fgKey = packPixelKey(128, 64, 200, 10, 20, true);
    const bgKey = packPixelKey(128, 64, 200, 10, 20, false);
    expect(fgKey).toBeGreaterThan(bgKey);
  });
});

// ---- Algorithm Tests ----

describe('Reconstruction Algorithms', () => {
  const sourceGrad = createTestImage(16, 16, 'gradient');
  const targetRandom = createTestImage(16, 16, 'random');

  const algorithms = [
    { name: 'brightness', fn: matchBrightness },
    { name: 'hsv', fn: matchHSV },
    { name: 'lab', fn: matchLab },
    { name: 'multidimensional', fn: matchMultidimensional },
    { name: 'spatial', fn: matchSpatial },
    { name: 'regional', fn: matchRegional },
  ] as const;

  for (const { name, fn } of algorithms) {
    describe(name, () => {
      it('returns a valid MatchResult', () => {
        const result = fn(sourceGrad, targetRandom);
        expect(result.sourceIndices).toBeInstanceOf(Uint32Array);
        expect(result.sourceIndices.length).toBe(256);
        expect(result.quality).toBeGreaterThanOrEqual(0);
        expect(result.quality).toBeLessThanOrEqual(1);
        expect(result.duration).toBeGreaterThanOrEqual(0);
        expect(result.algorithm).toBe(name);
      });

      it('mapping indices are within bounds', () => {
        const result = fn(sourceGrad, targetRandom);
        const max = sourceGrad.totalPixels;
        for (let i = 0; i < result.sourceIndices.length; i++) {
          expect(result.sourceIndices[i]).toBeLessThan(max);
        }
      });

      it('preserves pixel provenance (bijective mapping)', () => {
        const result = fn(sourceGrad, targetRandom);
        // Check all source indices are unique (one-to-one mapping)
        const used = new Set<number>();
        for (let i = 0; i < result.sourceIndices.length; i++) {
          used.add(result.sourceIndices[i]);
        }
        expect(used.size).toBe(result.sourceIndices.length);
      });
    });
  }

  it('identical images produce high quality score', () => {
    const img = createTestImage(16, 16, 'gradient');
    const result = matchBrightness(img, img);
    expect(result.quality).toBeGreaterThan(0.9);
  });

  it('all 6 algorithms produce distinct mappings on diverse images', () => {
    const src = createTestImage(32, 32, 'gradient');
    const tgt = createTestImage(32, 32, 'random');

    const results = [
      matchLab(src, tgt),
      matchHSV(src, tgt),
      matchBrightness(src, tgt),
      matchMultidimensional(src, tgt),
      matchSpatial(src, tgt),
      matchRegional(src, tgt),
    ];

    // For every pair of algorithms, ensure their mappings differ substantially
    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        let diffs = 0;
        const m1 = results[i].sourceIndices;
        const m2 = results[j].sourceIndices;
        for (let k = 0; k < m1.length; k++) {
          if (m1[k] !== m2[k]) diffs++;
        }
        const diffRatio = diffs / m1.length;
        // Verify distinct behavior between algorithms
        expect(diffRatio).toBeGreaterThan(0.2);
      }
    }
  });
});
