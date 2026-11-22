// ============================================================
// Pixel Mosaic X — Worker Manager
// ============================================================

import type { ImageInfo, AlgorithmType, ProcessingProgress } from '../engine/types.ts';

export interface ReconstructionResult {
  mapping: Uint32Array;
  reconstructedPixels: Uint8ClampedArray;
  width: number;
  height: number;
  quality: number;
  duration: number;
  algorithm: string;
}

export class WorkerManager {
  private worker: Worker | null = null;

  private createWorker(): Worker {
    return new Worker(
      new URL('./reconstruction.worker.ts', import.meta.url),
      { type: 'module' }
    );
  }

  async reconstruct(
    source: ImageInfo,
    target: ImageInfo,
    algorithm: AlgorithmType,
    enableSegmentation: boolean,
    onProgress: (progress: ProcessingProgress) => void
  ): Promise<ReconstructionResult> {
    // Create worker
    this.dispose();
    this.worker = this.createWorker();

    return new Promise<ReconstructionResult>((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not available'));
        return;
      }

      this.worker.onmessage = (e) => {
        const msg = e.data;

        if (msg.type === 'progress' && msg.progress) {
          onProgress(msg.progress);
        } else if (msg.type === 'result' && msg.result) {
          resolve({
            mapping: msg.result.sourceIndices,
            reconstructedPixels: msg.result.reconstructedPixels,
            width: msg.result.width,
            height: msg.result.height,
            quality: msg.result.quality,
            duration: msg.result.duration,
            algorithm: msg.result.algorithm,
          });
        } else if (msg.type === 'error') {
          reject(new Error(msg.error || 'Worker error'));
        }
      };

      this.worker.onerror = (err) => {
        reject(new Error(err.message || 'Worker error'));
      };

      // Copy pixel arrays to avoid detachment issues
      const sourcePixels = new Uint8ClampedArray(source.pixels);
      const targetPixels = new Uint8ClampedArray(target.pixels);

      this.worker.postMessage(
        {
          type: 'reconstruct',
          sourcePixels,
          sourceWidth: source.width,
          sourceHeight: source.height,
          targetPixels,
          targetWidth: target.width,
          targetHeight: target.height,
          algorithm,
          enableSegmentation,
          maxPixels: source.totalPixels,
        },
        [sourcePixels.buffer, targetPixels.buffer] as unknown as Transferable[]
      );
    });
  }

  cancel(): void {
    this.dispose();
  }

  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
