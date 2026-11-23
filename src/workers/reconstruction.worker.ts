// ============================================================
// Pixel Mosaic X — Reconstruction Web Worker
// ============================================================

import { runAlgorithm } from '../engine/algorithms.ts';
import { ALL_ALGORITHM_TYPES, ALGORITHM_LABELS, type ImageInfo, type AlgorithmType } from '../engine/types.ts';

interface WorkerRequest {
  type: 'reconstruct' | 'reconstruct-all';
  sourcePixels: Uint8ClampedArray;
  sourceWidth: number;
  sourceHeight: number;
  targetPixels: Uint8ClampedArray;
  targetWidth: number;
  targetHeight: number;
  algorithm?: AlgorithmType;
  enableSegmentation?: boolean;
  maxPixels: number;
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;

  if (msg.type !== 'reconstruct' && msg.type !== 'reconstruct-all') return;

  try {
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

    if (msg.type === 'reconstruct-all') {
      const results: Record<string, {
        mapping: Uint32Array;
        reconstructedPixels: Uint8ClampedArray;
        width: number;
        height: number;
        quality: number;
        duration: number;
        algorithm: string;
      }> = {};
      const transferBuffers: Transferable[] = [];

      for (let idx = 0; idx < ALL_ALGORITHM_TYPES.length; idx++) {
        const algo = ALL_ALGORITHM_TYPES[idx];
        const algoLabel = ALGORITHM_LABELS[algo];

        self.postMessage({
          type: 'progress',
          progress: {
            phase: 'algorithm',
            progress: 0.05 + (idx / ALL_ALGORITHM_TYPES.length) * 0.9,
            message: `Computing method ${idx + 1}/6: ${algoLabel}...`,
          },
        });

        const result = runAlgorithm(algo, source, target, msg.enableSegmentation || false);
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

        results[algo] = {
          mapping: result.sourceIndices,
          reconstructedPixels,
          width: target.width,
          height: target.height,
          quality: result.quality,
          duration: result.duration,
          algorithm: algo,
        };

        transferBuffers.push(result.sourceIndices.buffer, reconstructedPixels.buffer);
      }

      self.postMessage({
        type: 'progress',
        progress: { phase: 'done', progress: 1.0, message: 'All 6 methods complete!' },
      });

      (self as unknown as { postMessage: (msg: unknown, transfer?: Transferable[]) => void }).postMessage(
        {
          type: 'result-all',
          results,
        },
        transferBuffers
      );
      return;
    }

    // Single algorithm reconstruction
    const algo = msg.algorithm || 'lab';
    const segMsg = msg.enableSegmentation ? ' with AI segmentation' : '';
    self.postMessage({
      type: 'progress',
      progress: { phase: 'algorithm', progress: 0.3, message: `Running ${algo} algorithm${segMsg}...` },
    });

    const result = runAlgorithm(algo, source, target, msg.enableSegmentation || false);

    self.postMessage({
      type: 'progress',
      progress: { phase: 'reconstruct', progress: 0.8, message: 'Building reconstruction...' },
    });

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
      [result.sourceIndices.buffer, reconstructedPixels.buffer]
    );
  } catch (err) {
    self.postMessage({
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
