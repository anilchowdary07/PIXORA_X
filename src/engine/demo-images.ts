// ============================================================
// Pixel Mosaic X — Demo Image Generation
// ============================================================

import type { ImageInfo } from './types.ts';

/**
 * Generate a colorful gradient / pattern source image.
 */
export function generateDemoSource(width: number = 400, height: number = 400): ImageInfo {
  const pixels = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const nx = x / width;
      const ny = y / height;

      // Rainbow gradient with sine wave patterns
      const r = Math.floor(128 + 127 * Math.sin(nx * Math.PI * 2 + 0));
      const g = Math.floor(128 + 127 * Math.sin(ny * Math.PI * 2 + 2.094));
      const b = Math.floor(128 + 127 * Math.sin((nx + ny) * Math.PI + 4.189));

      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = 255;
    }
  }

  return { width, height, pixels, totalPixels: width * height };
}

/**
 * Generate a recognizable target image (geometric shapes, letters).
 */
export function generateDemoTarget(width: number = 400, height: number = 400): ImageInfo {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const cx = width / 2;
  const cy = height / 2;
  const maxR = Math.min(width, height) * 0.4;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);

      // Background: dark gradient
      let r = Math.floor(20 + 15 * (y / height));
      let g = Math.floor(15 + 20 * (x / width));
      let b = Math.floor(30 + 25 * ((x + y) / (width + height)));

      // Circle
      if (dist < maxR) {
        const t = dist / maxR;
        r = Math.floor(100 + 155 * (1 - t));
        g = Math.floor(50 + 100 * Math.sin(angle * 3 + 1));
        b = Math.floor(80 + 175 * t);
      }

      // Star overlay
      const starAngle = ((angle + Math.PI) / (2 * Math.PI)) * 5;
      const starR = maxR * (0.4 + 0.3 * Math.cos(starAngle * 2 * Math.PI));
      if (dist < starR && dist > starR * 0.5) {
        r = Math.min(255, r + 80);
        g = Math.min(255, g + 60);
        b = Math.min(255, b + 40);
      }

      // Concentric rings
      const ringDist = dist % (maxR / 4);
      if (ringDist < 2 && dist < maxR) {
        r = Math.min(255, r + 50);
        g = Math.min(255, g + 50);
        b = Math.min(255, b + 50);
      }

      pixels[i] = Math.max(0, Math.min(255, r));
      pixels[i + 1] = Math.max(0, Math.min(255, g));
      pixels[i + 2] = Math.max(0, Math.min(255, b));
      pixels[i + 3] = 255;
    }
  }

  return { width, height, pixels, totalPixels: width * height };
}
