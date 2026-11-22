// ============================================================
// Pixel Mosaic X — Reconstruction Web Worker
// ============================================================

import { runAlgorithm } from '../engine/algorithms.ts';
import type { ImageInfo, AlgorithmType } from '../engine/types.ts';

interface WorkerRequest {
  type: 'reconstruct';
  sourcePixels: Uint8ClampedArray;
  sourceWidth: number;
  sourceHeight: number;
  targetPixels: Uint8ClampedArray;
  targetWidth: number;
  targetHeight: number;
  algorithm: AlgorithmType;
  enableSegmentation?: boolean;
  maxPixels: number;
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;

  if (msg.type !== 'reconstruct') return;

  try {
    // Post: starting
    self.postMessage({
      type: 'progress',
      progress: { phase: 'prepare', progress: 0.1, message: 'Preparing images...' },
    });

    // Build ImageInfo
    const source: ImageInfo = {
      width: msg.sourceWidth,
      height: msg.sourceHeight,
      pixels: msg.sourcePixels,
      totalPixels: msg.sourceWidth * msg.sourceHeight,
    };

    const target: ImageInfo = {
      width: msg.targetWidth,
      height: msg.targetHeight,
      pixels: msg.targetPixels,
      totalPixels: msg.targetWidth * msg.targetHeight,
    };

    const segMsg = msg.enableSegmentation ? ' with AI segmentation' : '';
    self.postMessage({
      type: 'progress',
      progress: { phase: 'algorithm', progress: 0.3, message: `Running ${msg.algorithm} algorithm${segMsg}...` },
    });

    // Run algorithm
    const result = runAlgorithm(msg.algorithm, source, target, msg.enableSegmentation || false);

    self.postMessage({
      type: 'progress',
      progress: { phase: 'reconstruct', progress: 0.8, message: 'Building reconstruction...' },
    });

    // Build reconstructed pixels
    const n = target.totalPixels;
    const reconstructedPixels = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      const si = result.sourceIndices[i];
      const so = si * 4;
      const to = i * 4;
      reconstructedPixels[to] = source.pixels[so];
      reconstructedPixels[to + 1] = source.pixels[so + 1];
      reconstructedPixels[to + 2] = source.pixels[so + 2];
      reconstructedPixels[to + 3] = 255;
    }

    self.postMessage({
      type: 'progress',
      progress: { phase: 'done', progress: 1.0, message: 'Complete!' },
    });

    // Send result (transfer arrays for performance)
    (self as unknown as { postMessage: (msg: unknown, transfer?: Transferable[]) => void }).postMessage(
      {
        type: 'result',
        result: {
          sourceIndices: result.sourceIndices,
          quality: result.quality,
          duration: result.duration,
          algorithm: result.algorithm,
          reconstructedPixels,
          width: target.width,
          height: target.height,
        },
      },
      // Transfer the large arrays
      [result.sourceIndices.buffer, reconstructedPixels.buffer]
    );
  } catch (err) {
    self.postMessage({
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
