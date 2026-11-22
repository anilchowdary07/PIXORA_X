// ============================================================
// Pixel Mosaic X — Color Space Conversion Utilities
// ============================================================

/**
 * Convert RGB to CIE Lab color space.
 * Uses D65 illuminant.
 */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  // Normalize to 0-1
  let rr = r / 255;
  let gg = g / 255;
  let bb = b / 255;

  // sRGB to linear
  rr = rr > 0.04045 ? Math.pow((rr + 0.055) / 1.055, 2.4) : rr / 12.92;
  gg = gg > 0.04045 ? Math.pow((gg + 0.055) / 1.055, 2.4) : gg / 12.92;
  bb = bb > 0.04045 ? Math.pow((bb + 0.055) / 1.055, 2.4) : bb / 12.92;

  // Linear RGB to XYZ (D65)
  let x = (rr * 0.4124564 + gg * 0.3575761 + bb * 0.1804375) / 0.95047;
  let y = (rr * 0.2126729 + gg * 0.7151522 + bb * 0.0721750);
  let z = (rr * 0.0193339 + gg * 0.1191920 + bb * 0.9503041) / 1.08883;

  // XYZ to Lab
  const epsilon = 0.008856;
  const kappa = 903.3;

  x = x > epsilon ? Math.cbrt(x) : (kappa * x + 16) / 116;
  y = y > epsilon ? Math.cbrt(y) : (kappa * y + 16) / 116;
  z = z > epsilon ? Math.cbrt(z) : (kappa * z + 16) / 116;

  const L = 116 * y - 16;
  const a = 500 * (x - y);
  const bVal = 200 * (y - z);

  return [L, a, bVal];
}

/**
 * Convert RGB to HSV color space.
 * Returns H in [0, 360), S in [0, 1], V in [0, 1].
 */
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;

  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rr) {
      h = 60 * (((gg - bb) / delta) % 6);
    } else if (max === gg) {
      h = 60 * ((bb - rr) / delta + 2);
    } else {
      h = 60 * ((rr - gg) / delta + 4);
    }
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return [h, s, v];
}

/**
 * Perceived brightness (luminance) of an RGB pixel.
 * Uses ITU-R BT.601 weights.
 */
export function brightness(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * CIE76 color difference in Lab space (squared, for speed).
 */
export function labDistanceSq(
  l1: number, a1: number, b1: number,
  l2: number, a2: number, b2: number
): number {
  const dL = l1 - l2;
  const da = a1 - a2;
  const db = b1 - b2;
  return dL * dL + da * da + db * db;
}

/**
 * Simple hash function for spatial dithering.
 */
function ditherHash(x: number, y: number): number {
  let h = x * 374761393 + y * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) & 0xFF;
}

/**
 * Pack a pixel into a sortable 64-bit key.
 *
 * Layout (most significant first):
 *   [1 bit: foreground flag]
 *   [8 bits: brightness]
 *   [6 bits: hue bucket]
 *   [4 bits: saturation bucket]
 *   [8 bits: dither hash]
 *   [16 bits: y coordinate]
 *   [16 bits: x coordinate]
 *
 * Total: 59 bits, fits safely in a double without precision loss up to 2^53,
 * but we use the high bits for the most important matching criteria.
 */
export function packPixelKey(
  r: number, g: number, b: number,
  x: number, y: number,
  isForeground: boolean
): number {
  const bright = Math.round(brightness(r, g, b)) & 0xFF;
  const [h, s] = rgbToHsv(r, g, b);
  const hueBucket = Math.floor(h / 5.625) & 0x3F; // 64 buckets
  const satBucket = Math.floor(s * 15) & 0x0F;     // 16 buckets
  const dither = ditherHash(x, y);

  // Build key: fg(1) | brightness(8) | hue(6) | sat(4) | dither(8) | y(12) | x(12)
  // Using 49 bits total, safe within Number precision
  const fgBit = isForeground ? 1 : 0;
  const key =
    fgBit * 2 ** 48 +
    bright * 2 ** 40 +
    hueBucket * 2 ** 34 +
    satBucket * 2 ** 30 +
    dither * 2 ** 22 +
    (y & 0x7FF) * 2 ** 11 +
    (x & 0x7FF);

  return key;
}

/**
 * Pack pixel key with Lab-based brightness for better perceptual matching.
 */
export function packLabKey(
  r: number, g: number, b: number,
  x: number, y: number,
  isForeground: boolean
): number {
  const [L, a, bVal] = rgbToLab(r, g, b);
  const lBucket = Math.floor((L / 100) * 255) & 0xFF;
  const aBucket = Math.floor(((a + 128) / 256) * 63) & 0x3F;
  const bBucket = Math.floor(((bVal + 128) / 256) * 15) & 0x0F;
  const dither = ditherHash(x, y);

  const fgBit = isForeground ? 1 : 0;
  const key =
    fgBit * 2 ** 48 +
    lBucket * 2 ** 40 +
    aBucket * 2 ** 34 +
    bBucket * 2 ** 30 +
    dither * 2 ** 22 +
    (y & 0x7FF) * 2 ** 11 +
    (x & 0x7FF);

  return key;
}

/**
 * Pack pixel key using HSV components for HSV matching.
 */
export function packHsvKey(
  r: number, g: number, b: number,
  x: number, y: number,
  isForeground: boolean
): number {
  const [h, s, v] = rgbToHsv(r, g, b);
  const hBucket = Math.floor(h / 5.625) & 0x3F;
  const sBucket = Math.floor(s * 15) & 0x0F;
  const vBucket = Math.round(v * 255) & 0xFF;
  const dither = ditherHash(x, y);

  const fgBit = isForeground ? 1 : 0;
  const key =
    fgBit * 2 ** 48 +
    vBucket * 2 ** 40 +
    hBucket * 2 ** 34 +
    sBucket * 2 ** 30 +
    dither * 2 ** 22 +
    (y & 0x7FF) * 2 ** 11 +
    (x & 0x7FF);

  return key;
}

/**
 * Pack a multi-dimensional key using combined features.
 */
export function packMultiKey(
  r: number, g: number, b: number,
  x: number, y: number,
  isForeground: boolean
): number {
  const bright = Math.round(brightness(r, g, b)) & 0xFF;
  const [h, s] = rgbToHsv(r, g, b);
  const [L] = rgbToLab(r, g, b);
  const lBucket = Math.floor((L / 100) * 63) & 0x3F;
  const hueBucket = Math.floor(h / 22.5) & 0x0F; // 16 hue buckets
  const satBucket = Math.floor(s * 7) & 0x07;
  const dither = ditherHash(x, y);

  const fgBit = isForeground ? 1 : 0;
  const key =
    fgBit * 2 ** 48 +
    bright * 2 ** 40 +
    lBucket * 2 ** 34 +
    hueBucket * 2 ** 30 +
    satBucket * 2 ** 27 +
    (dither & 0x1F) * 2 ** 22 +
    (y & 0x7FF) * 2 ** 11 +
    (x & 0x7FF);

  return key;
}
