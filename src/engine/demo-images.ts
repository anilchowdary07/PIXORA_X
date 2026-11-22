// ============================================================
// PIXORA X — Showcase & Demo Image Generation
// ============================================================

import type { ImageInfo } from './types.ts';

export interface DemoShowcase {
  id: string;
  title: string;
  sourceLabel: string;
  targetLabel: string;
  sourcePreview: string; // tiny SVG/data URI for landing card
  targetPreview: string;
  getSource: () => ImageInfo;
  getTarget: () => ImageInfo;
}

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
 * Generate a cosmic nebula pattern.
 */
export function generateCosmicNebula(width: number = 400, height: number = 400): ImageInfo {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const cx = width / 2;
  const cy = height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const dx = (x - cx) / width;
      const dy = (y - cy) / height;
      const r = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);

      const spiral = Math.sin(angle * 4 + r * 12);
      const red = Math.floor(128 + 127 * Math.sin(r * 8 + spiral));
      const green = Math.floor(60 + 195 * Math.sin(angle * 2 + 1));
      const blue = Math.floor(180 + 75 * Math.cos(r * 10 - angle));

      pixels[i] = Math.max(0, Math.min(255, red));
      pixels[i + 1] = Math.max(0, Math.min(255, green));
      pixels[i + 2] = Math.max(0, Math.min(255, blue));
      pixels[i + 3] = 255;
    }
  }

  return { width, height, pixels, totalPixels: width * height };
}

/**
 * Generate sunset horizon pattern.
 */
export function generateSunsetHorizon(width: number = 400, height: number = 400): ImageInfo {
  const pixels = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    const ny = y / height;
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const i = (y * width + x) * 4;

      // Sun reflection
      const sunDist = Math.hypot(nx - 0.5, ny - 0.45);
      const isSun = sunDist < 0.18;

      let r = Math.floor(255 * Math.pow(1 - ny * 0.7, 1.2));
      let g = Math.floor(140 * Math.sin(ny * Math.PI * 0.8) + (isSun ? 100 : 0));
      let b = Math.floor(60 + 190 * Math.pow(ny, 1.8));

      pixels[i] = Math.max(0, Math.min(255, r));
      pixels[i + 1] = Math.max(0, Math.min(255, g));
      pixels[i + 2] = Math.max(0, Math.min(255, b));
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

/**
 * Generate a Cyber Crest target image.
 */
export function generateCyberCrest(width: number = 400, height: number = 400): ImageInfo {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const cx = width / 2;
  const cy = height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);

      // Diamond shield shape
      const inShield = (dx / (width * 0.38) + dy / (height * 0.42)) <= 1.0;
      const inInner = (dx / (width * 0.26) + dy / (height * 0.28)) <= 1.0;

      if (inInner) {
        // Core glowing monogram
        pixels[i] = 240;
        pixels[i + 1] = 160;
        pixels[i + 2] = 255;
      } else if (inShield) {
        pixels[i] = 70;
        pixels[i + 1] = 90;
        pixels[i + 2] = 220;
      } else {
        // Deep background with grid dots
        const isGrid = (x % 24 === 0) || (y % 24 === 0);
        pixels[i] = isGrid ? 28 : 12;
        pixels[i + 1] = isGrid ? 28 : 14;
        pixels[i + 2] = isGrid ? 42 : 22;
      }
      pixels[i + 3] = 255;
    }
  }

  return { width, height, pixels, totalPixels: width * height };
}

/**
 * Pre-configured showcases for instant 1-click exploration.
 */
export const SHOWCASES: DemoShowcase[] = [
  {
    id: 'chromatic-star',
    title: 'Chromatic Prism ➔ Star Crest',
    sourceLabel: 'Rainbow Spectrum',
    targetLabel: 'Concentric Crest',
    sourcePreview: 'linear-gradient(135deg, #f43f5e, #fbbf24, #10b981, #3b82f6)',
    targetPreview: 'radial-gradient(circle, #818cf8 20%, #4338ca 60%, #0f172a 90%)',
    getSource: () => generateDemoSource(400, 400),
    getTarget: () => generateDemoTarget(400, 400),
  },
  {
    id: 'cosmic-cyber',
    title: 'Cosmic Nebula ➔ Cyber Shield',
    sourceLabel: 'Deep Space Nebula',
    targetLabel: 'Cyber Monogram',
    sourcePreview: 'linear-gradient(135deg, #a855f7, #6366f1, #06b6d4)',
    targetPreview: 'linear-gradient(135deg, #1e1b4b, #312e81, #0284c7)',
    getSource: () => generateCosmicNebula(400, 400),
    getTarget: () => generateCyberCrest(400, 400),
  },
  {
    id: 'sunset-mandala',
    title: 'Sunset Horizon ➔ Geometric Star',
    sourceLabel: 'Vibrant Sunset',
    targetLabel: 'Starlight Geometry',
    sourcePreview: 'linear-gradient(180deg, #f97316 0%, #ec4899 50%, #3b82f6 100%)',
    targetPreview: 'radial-gradient(circle, #fbbf24 30%, #ef4444 70%, #1e1b4b 100%)',
    getSource: () => generateSunsetHorizon(400, 400),
    getTarget: () => generateDemoTarget(400, 400),
  },
];
