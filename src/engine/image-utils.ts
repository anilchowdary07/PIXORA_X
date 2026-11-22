// ============================================================
// Pixel Mosaic X — Image Loading & Processing Utilities
// ============================================================

import type { ImageInfo } from './types.ts';

/**
 * Load an image File into an ImageInfo struct.
 */
export function loadImage(file: File): Promise<ImageInfo> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      URL.revokeObjectURL(url);

      resolve({
        width: img.width,
        height: img.height,
        pixels: imageData.data,
        totalPixels: img.width * img.height,
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Resize an image to fit within maxPixels total, maintaining aspect ratio.
 */
export function resizeImage(info: ImageInfo, maxPixels: number): ImageInfo {
  if (info.totalPixels <= maxPixels) return info;

  const scale = Math.sqrt(maxPixels / info.totalPixels);
  const newW = Math.max(1, Math.round(info.width * scale));
  const newH = Math.max(1, Math.round(info.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = newW;
  canvas.height = newH;
  const ctx = canvas.getContext('2d')!;

  // Create source canvas
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = info.width;
  srcCanvas.height = info.height;
  const srcCtx = srcCanvas.getContext('2d')!;
  const srcData = srcCtx.createImageData(info.width, info.height);
  srcData.data.set(info.pixels);
  srcCtx.putImageData(srcData, 0, 0);

  ctx.drawImage(srcCanvas, 0, 0, newW, newH);
  const resized = ctx.getImageData(0, 0, newW, newH);

  return {
    width: newW,
    height: newH,
    pixels: resized.data,
    totalPixels: newW * newH,
  };
}

/**
 * Ensure source and target have the same total pixel count.
 * Resizes both to the same dimensions (using the smaller area).
 */
export function matchDimensions(
  source: ImageInfo,
  target: ImageInfo
): { source: ImageInfo; target: ImageInfo } {
  if (source.totalPixels === target.totalPixels &&
      source.width === target.width &&
      source.height === target.height) {
    return { source, target };
  }

  // Use target dimensions as the reference, resize source to match
  const targetW = target.width;
  const targetH = target.height;
  const targetPixels = targetW * targetH;

  // Resize source to have the same total pixels as target
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = targetW;
  srcCanvas.height = targetH;
  const srcCtx = srcCanvas.getContext('2d')!;

  const origSrcCanvas = document.createElement('canvas');
  origSrcCanvas.width = source.width;
  origSrcCanvas.height = source.height;
  const origCtx = origSrcCanvas.getContext('2d')!;
  const origData = origCtx.createImageData(source.width, source.height);
  origData.data.set(source.pixels);
  origCtx.putImageData(origData, 0, 0);

  srcCtx.drawImage(origSrcCanvas, 0, 0, targetW, targetH);
  const resizedSrc = srcCtx.getImageData(0, 0, targetW, targetH);

  return {
    source: {
      width: targetW,
      height: targetH,
      pixels: resizedSrc.data,
      totalPixels: targetPixels,
    },
    target,
  };
}

/**
 * Apply a pixel mapping to reconstruct the target image using source pixels.
 */
export function reconstructImage(
  source: ImageInfo,
  target: ImageInfo,
  mapping: Uint32Array
): ImageData {
  const w = target.width;
  const h = target.height;
  const n = w * h;
  const result = new Uint8ClampedArray(n * 4);

  for (let i = 0; i < n; i++) {
    const si = mapping[i];
    const so = si * 4;
    const to = i * 4;
    result[to] = source.pixels[so];
    result[to + 1] = source.pixels[so + 1];
    result[to + 2] = source.pixels[so + 2];
    result[to + 3] = 255;
  }

  return new ImageData(result, w, h);
}

/**
 * Calculate quality score (simplified SSIM-like metric).
 */
export function calculateQuality(
  original: ImageInfo,
  reconstructed: ImageData
): number {
  const n = Math.min(original.totalPixels, reconstructed.width * reconstructed.height);
  const sampleSize = Math.min(n, 20000);
  const step = Math.max(1, Math.floor(n / sampleSize));
  let totalDiff = 0;
  let count = 0;

  for (let i = 0; i < n; i += step) {
    const oo = i * 4;
    const ro = i * 4;
    const dr = original.pixels[oo] - reconstructed.data[ro];
    const dg = original.pixels[oo + 1] - reconstructed.data[ro + 1];
    const db = original.pixels[oo + 2] - reconstructed.data[ro + 2];
    totalDiff += Math.sqrt(dr * dr + dg * dg + db * db);
    count++;
  }

  return Math.max(0, 1 - totalDiff / (count * 441.7));
}

/**
 * Render an ImageInfo to a canvas element.
 */
export function imageInfoToCanvas(info: ImageInfo): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = info.width;
  canvas.height = info.height;
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(info.width, info.height);
  imgData.data.set(info.pixels);
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * Convert canvas to downloadable Blob.
 */
export function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: string = 'image/png',
  quality: number = 0.92
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create blob'));
      },
      format,
      quality
    );
  });
}

/**
 * Convert ImageData to a downloadable Blob.
 */
export function imageDataToBlob(
  imageData: ImageData,
  format: string = 'image/png',
  quality: number = 0.92
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(imageData, 0, 0);
  return canvasToBlob(canvas, format, quality);
}
