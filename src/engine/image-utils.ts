// ============================================================
// PIXORA X — Image Loading & Processing Utilities
// ============================================================

import type { ImageInfo } from './types.ts';

/**
 * Load an image File, Blob, or URL into an ImageInfo struct.
 */
export function loadImage(input: File | Blob | string): Promise<ImageInfo> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const isUrl = typeof input === 'string';
    const url = isUrl ? input : URL.createObjectURL(input);

    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      if (!isUrl) URL.revokeObjectURL(url);

      resolve({
        width: img.width,
        height: img.height,
        pixels: imageData.data,
        totalPixels: img.width * img.height,
      });
    };

    img.onerror = (e) => {
      if (!isUrl) URL.revokeObjectURL(url);
      reject(new Error(`Failed to load image: ${e}`));
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
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const imgData = ctx.createImageData(w, h);
  const result = imgData.data;

  for (let i = 0; i < n; i++) {
    const si = mapping[i];
    const so = si * 4;
    const to = i * 4;
    result[to] = source.pixels[so];
    result[to + 1] = source.pixels[so + 1];
    result[to + 2] = source.pixels[so + 2];
    result[to + 3] = 255;
  }

  return imgData;
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
  quality: number = 0.95
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
  quality: number = 0.95
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(imageData, 0, 0);
  return canvasToBlob(canvas, format, quality);
}

/**
 * Download a Blob to the user's filesystem.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate a branded 3-panel side-by-side comparison canvas:
 * [Source Image (Pixels)] -> [Reconstructed Image (1:1)] -> [Target Image (Structure)]
 */
export function createComparisonCanvas(
  source: ImageInfo,
  target: ImageInfo,
  reconstructedPixels: Uint8ClampedArray,
  qualityPct: string,
  algorithm: string
): HTMLCanvasElement {
  const w = target.width;
  const h = target.height;
  const gap = 20;
  const headerH = 70;
  const footerH = 48;
  const totalW = w * 3 + gap * 2 + 32;
  const totalH = h + headerH + footerH;

  const canvas = document.createElement('canvas');
  canvas.width = totalW;
  canvas.height = totalH;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, totalW, totalH);

  // Top header branding
  ctx.fillStyle = '#e8e8f0';
  ctx.font = '700 20px Inter, sans-serif';
  ctx.fillText('PIXORA X', 16, 40);

  ctx.fillStyle = '#818cf8';
  ctx.font = '600 13px Inter, sans-serif';
  ctx.fillText('100% Strict Pixel Provenance', 125, 40);

  ctx.fillStyle = '#8888a0';
  ctx.font = '400 13px Inter, sans-serif';
  ctx.fillText('• Full 3-Panel Verification Card', 335, 40);

  // 1. Draw Source Image (Panel 1)
  const x1 = 16;
  const srcCanvas = imageInfoToCanvas(source);
  ctx.drawImage(srcCanvas, x1, headerH, w, h);

  // 2. Draw Reconstructed Image (Panel 2)
  const x2 = 16 + w + gap;
  const reconCanvas = document.createElement('canvas');
  reconCanvas.width = w;
  reconCanvas.height = h;
  const reconCtx = reconCanvas.getContext('2d')!;
  const reconImgData = reconCtx.createImageData(w, h);
  reconImgData.data.set(reconstructedPixels);
  reconCtx.putImageData(reconImgData, 0, 0);
  ctx.drawImage(reconCanvas, x2, headerH, w, h);

  // 3. Draw Original Target Image (Panel 3)
  const x3 = 16 + (w + gap) * 2;
  const tgtCanvas = imageInfoToCanvas(target);
  ctx.drawImage(tgtCanvas, x3, headerH, w, h);

  // Card subheadings
  const bannerH = 30;
  ctx.fillStyle = 'rgba(10, 10, 15, 0.85)';
  ctx.fillRect(x1, headerH, w, bannerH);
  ctx.fillRect(x2, headerH, w, bannerH);
  ctx.fillRect(x3, headerH, w, bannerH);

  ctx.font = '700 11px Inter, sans-serif';
  ctx.fillStyle = '#f59e0b';
  ctx.fillText('① SOURCE IMAGE (PIXEL PALETTE)', x1 + 12, headerH + 20);

  ctx.fillStyle = '#a5b4fc';
  ctx.fillText('② RECONSTRUCTED (1:1 PROVENANCE)', x2 + 12, headerH + 20);

  ctx.fillStyle = '#10b981';
  ctx.fillText('③ ORIGINAL TARGET (GOAL STRUCTURE)', x3 + 12, headerH + 20);

  // Accent borders
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x1, headerH, w, h);
  ctx.strokeRect(x2, headerH, w, h);
  ctx.strokeRect(x3, headerH, w, h);

  // Footer metrics
  ctx.fillStyle = '#818cf8';
  ctx.font = '600 12px Inter, sans-serif';
  ctx.fillText(`Algorithm: ${algorithm.toUpperCase()}  |  Quality Score: ${qualityPct}  |  Pixel Provenance: 100% (Bijective)`, 16, totalH - 18);

  ctx.fillStyle = '#8888a0';
  ctx.font = '500 11px Inter, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Made with ♥ by Anil Chowdary  |  anilchowdary07.github.io/PIXORA_X', totalW - 16, totalH - 18);

  return canvas;
}
