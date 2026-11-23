// ============================================================
// PIXORA X — Image Loading & Processing Utilities
// ============================================================

import type { ImageInfo, AlgorithmType } from './types.ts';
import { ALL_ALGORITHM_TYPES, ALGORITHM_LABELS } from './types.ts';
import type { ReconstructionResult } from '../workers/worker-manager.ts';

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

/**
 * Generate a comprehensive 6-method comparison poster canvas:
 * Top: Reference Source & Target
 * Bottom: 3x2 Grid displaying all 6 reconstruction algorithm outputs side-by-side
 */
export function createMegaComparisonCanvas(
  source: ImageInfo,
  target: ImageInfo,
  results: Record<AlgorithmType, ReconstructionResult>
): HTMLCanvasElement {
  const cellW = Math.max(260, Math.min(380, target.width));
  const cellH = Math.round(cellW * (target.height / target.width));
  const gap = 16;
  const pad = 24;
  const cols = 3;
  const rows = 2;

  const gridW = cols * cellW + (cols - 1) * gap;
  const totalW = gridW + pad * 2;

  // Header height: 70px
  const headerH = 70;
  // Reference row height: refCellH + 50px
  const refCellW = Math.round((gridW - gap) / 2);
  const refCellH = Math.round(refCellW * (target.height / target.width));
  const refSectionH = refCellH + 50;

  // 6-method grid height
  const gridSectionH = rows * (cellH + 30) + (rows - 1) * gap;

  // Footer height
  const footerH = 50;

  const totalH = headerH + refSectionH + gridSectionH + footerH + pad;

  const canvas = document.createElement('canvas');
  canvas.width = totalW;
  canvas.height = totalH;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, totalW, totalH);

  // Header Title
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 22px Inter, sans-serif';
  ctx.fillText('PIXORA X — ALL METHODS COMPARISON MATRIX', pad, 38);

  ctx.fillStyle = '#818cf8';
  ctx.font = '600 13px Inter, sans-serif';
  ctx.fillText(`6 Reconstructions from Same Source Pixels • 100% Strict Provenance • ${target.width}×${target.height} px`, pad, 58);

  // Draw Reference Panels (Source & Target)
  let curY = headerH;
  const srcCanvas = imageInfoToCanvas(source);
  const tgtCanvas = imageInfoToCanvas(target);

  // Ref 1: Source
  ctx.drawImage(srcCanvas, pad, curY + 26, refCellW, refCellH);
  ctx.fillStyle = 'rgba(15, 15, 25, 0.88)';
  ctx.fillRect(pad, curY, refCellW, 26);
  ctx.fillStyle = '#f59e0b';
  ctx.font = '700 11px Inter, sans-serif';
  ctx.fillText('① SOURCE IMAGE (EXACT PIXEL PALETTE)', pad + 10, curY + 18);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.strokeRect(pad, curY, refCellW, refCellH + 26);

  // Ref 2: Target
  const tgtX = pad + refCellW + gap;
  ctx.drawImage(tgtCanvas, tgtX, curY + 26, refCellW, refCellH);
  ctx.fillStyle = 'rgba(15, 15, 25, 0.88)';
  ctx.fillRect(tgtX, curY, refCellW, 26);
  ctx.fillStyle = '#10b981';
  ctx.font = '700 11px Inter, sans-serif';
  ctx.fillText('② ORIGINAL TARGET (GOAL STRUCTURE & GEOMETRY)', tgtX + 10, curY + 18);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.strokeRect(tgtX, curY, refCellW, refCellH + 26);

  // Draw 6 Methods Grid
  curY += refSectionH + 10;
  const algoList = ALL_ALGORITHM_TYPES;

  for (let idx = 0; idx < algoList.length; idx++) {
    const algo = algoList[idx];
    const res = results[algo];
    if (!res) continue;

    const c = idx % cols;
    const r = Math.floor(idx / cols);
    const x = pad + c * (cellW + gap);
    const y = curY + r * (cellH + 30 + gap);

    // Render reconstructed image onto an offscreen canvas
    const rCanvas = document.createElement('canvas');
    rCanvas.width = target.width;
    rCanvas.height = target.height;
    const rCtx = rCanvas.getContext('2d')!;
    const imgData = rCtx.createImageData(target.width, target.height);
    imgData.data.set(res.reconstructedPixels);
    rCtx.putImageData(imgData, 0, 0);

    // Draw Image
    ctx.drawImage(rCanvas, x, y + 28, cellW, cellH);

    // Card banner
    ctx.fillStyle = 'rgba(15, 15, 25, 0.9)';
    ctx.fillRect(x, y, cellW, 28);

    // Algorithm title & Quality badge
    ctx.fillStyle = '#a5b4fc';
    ctx.font = '700 11px Inter, sans-serif';
    ctx.fillText(`${idx + 1}. ${ALGORITHM_LABELS[algo].toUpperCase()}`, x + 10, y + 19);

    ctx.fillStyle = '#10b981';
    ctx.font = '600 11px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${(res.quality * 100).toFixed(1)}% | ${res.duration.toFixed(0)}ms`, x + cellW - 10, y + 19);
    ctx.textAlign = 'left';

    // Border
    ctx.strokeStyle = 'rgba(99, 102, 241, 0.25)';
    ctx.strokeRect(x, y, cellW, cellH + 28);
  }

  // Footer
  ctx.fillStyle = '#818cf8';
  ctx.font = '600 12px Inter, sans-serif';
  ctx.fillText('100% Client-Side GPU Processing • Zero AI Hallucinations • Bijective Provenance', pad, totalH - 18);

  ctx.fillStyle = '#8888a0';
  ctx.font = '500 11px Inter, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Made with ♥ by Anil Chowdary  |  anilchowdary07.github.io/PIXORA_X', totalW - pad, totalH - 18);
  ctx.textAlign = 'left';

  return canvas;
}
