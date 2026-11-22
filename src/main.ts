// ============================================================
// PIXORA X — Main Application Entry Point
// ============================================================

import './styles/main.css';
import { createLanding } from './ui/landing.ts';
import { createWorkspace, type WorkspaceElements } from './ui/workspace.ts';
import { createResults } from './ui/results.ts';
import { WorkerManager, type ReconstructionResult } from './workers/worker-manager.ts';
import { ParticleRenderer, AnimationRecorder } from './renderer/particle-renderer.ts';
import { prepareParticleData } from './renderer/renderer-utils.ts';
import { loadImage, resizeImage, imageInfoToCanvas, imageDataToBlob, matchDimensions } from './engine/image-utils.ts';
import { generateDemoSource, generateDemoTarget } from './engine/demo-images.ts';
import type {
  ImageInfo,
  AlgorithmType,
  QualityPreset,
  AnimationStyle,
  AnimationConfig,
  ReconstructionMetrics,
} from './engine/types.ts';
import { DEFAULT_ANIMATION_CONFIG, DEFAULT_PROCESSING_CONFIG, PRESET_CONFIG } from './engine/types.ts';

// ---- Application State ----

interface AppState {
  view: 'landing' | 'workspace' | 'results';
  sourceImage: ImageInfo | null;
  targetImage: ImageInfo | null;
  processedSource: ImageInfo | null;
  processedTarget: ImageInfo | null;
  algorithm: AlgorithmType;
  preset: QualityPreset;
  enableSegmentation: boolean;
  animConfig: AnimationConfig;
  result: ReconstructionResult | null;
  recordedVideoBlob: Blob | null;
  isProcessing: boolean;
}

const state: AppState = {
  view: 'landing',
  sourceImage: null,
  targetImage: null,
  processedSource: null,
  processedTarget: null,
  algorithm: DEFAULT_PROCESSING_CONFIG.algorithm,
  preset: DEFAULT_PROCESSING_CONFIG.preset,
  enableSegmentation: true,
  animConfig: { ...DEFAULT_ANIMATION_CONFIG },
  result: null,
  recordedVideoBlob: null,
  isProcessing: false,
};

// ---- Globals ----

const app = document.getElementById('app')!;
const workerManager = new WorkerManager();
const recorder = new AnimationRecorder();
let renderer: ParticleRenderer | null = null;
let workspaceElements: WorkspaceElements | null = null;
let animCanvas: HTMLCanvasElement | null = null;
let animFPSInterval: number | null = null;

// ---- Initialize ----

function init() {
  showLanding();
}

// ---- View Management ----

function clearViews() {
  if (animFPSInterval) {
    clearInterval(animFPSInterval);
    animFPSInterval = null;
  }
  const existing = app.querySelectorAll('.view');
  existing.forEach((v) => v.classList.remove('active'));
  setTimeout(() => {
    existing.forEach((v) => v.remove());
  }, 400);
}

function showView(element: HTMLElement) {
  app.appendChild(element);
  void element.offsetWidth; // Force reflow for CSS transition
  requestAnimationFrame(() => element.classList.add('active'));
}

// ---- Landing ----

function showLanding() {
  clearViews();
  state.view = 'landing';
  state.sourceImage = null;
  state.targetImage = null;
  state.result = null;
  state.recordedVideoBlob = null;

  const landing = createLanding(
    handleSourceUpload,
    handleTargetUpload,
    handleDemo
  );

  showView(landing);
}

function handleSourceUpload(file: File) {
  loadImage(file).then((info) => {
    state.sourceImage = info;
    tryTransitionToWorkspace();
  }).catch((err) => console.error('Failed to load source:', err));
}

function handleTargetUpload(file: File) {
  loadImage(file).then((info) => {
    state.targetImage = info;
    tryTransitionToWorkspace();
  }).catch((err) => console.error('Failed to load target:', err));
}

function handleDemo() {
  state.sourceImage = generateDemoSource(400, 400);
  state.targetImage = generateDemoTarget(400, 400);
  tryTransitionToWorkspace();
}

function tryTransitionToWorkspace() {
  if (state.sourceImage && state.targetImage) {
    showWorkspace();
  }
}

// ---- Workspace ----

function showWorkspace() {
  clearViews();
  state.view = 'workspace';

  if (!state.sourceImage || !state.targetImage) return;

  // Resize images based on quality preset
  const maxPixels = PRESET_CONFIG[state.preset].maxPixels;
  state.processedSource = resizeImage(state.sourceImage, maxPixels);
  state.processedTarget = resizeImage(state.targetImage, maxPixels);

  // Match dimensions
  const matched = matchDimensions(state.processedSource, state.processedTarget);
  state.processedSource = matched.source;
  state.processedTarget = matched.target;

  // Create preview canvases
  const sourceCanvas = imageInfoToCanvas(state.processedSource);
  const targetCanvas = imageInfoToCanvas(state.processedTarget);

  // Create animation canvas
  animCanvas = document.createElement('canvas');

  const elements = createWorkspace(
    sourceCanvas,
    targetCanvas,
    animCanvas,
    state.algorithm,
    state.preset,
    state.enableSegmentation,
    state.animConfig.particleCount,
    {
      onReconstruct: startReconstruction,
      onBack: showLanding,
      onAlgorithmChange: (a) => { state.algorithm = a; },
      onPresetChange: (p) => {
        state.preset = p;
        if (state.sourceImage && state.targetImage) {
          const mp = PRESET_CONFIG[p].maxPixels;
          state.processedSource = resizeImage(state.sourceImage, mp);
          state.processedTarget = resizeImage(state.targetImage, mp);
          const m = matchDimensions(state.processedSource, state.processedTarget);
          state.processedSource = m.source;
          state.processedTarget = m.target;
        }
      },
      onSegmentationToggle: (enabled) => {
        state.enableSegmentation = enabled;
      },
      onAnimStyleChange: (s) => {
        state.animConfig.style = s;
        if (renderer) renderer.setConfig({ style: s });
      },
      onSpeedChange: (v) => {
        state.animConfig.speed = v;
        if (renderer) renderer.setConfig({ speed: v });
      },
      onParticleSizeChange: (v) => {
        state.animConfig.particleSize = v;
        if (renderer) renderer.setConfig({ particleSize: v });
      },
      onParticleCountChange: (v) => {
        state.animConfig.particleCount = v;
      },
      onMotionChange: (v) => {
        state.animConfig.motionIntensity = v;
        if (renderer) renderer.setConfig({ motionIntensity: v });
      },
      onPlay: () => {
        if (renderer) {
          if (renderer.getProgress() >= 1) {
            renderer.restart();
          } else {
            renderer.resume();
          }
        }
      },
      onPause: () => { if (renderer) renderer.pause(); },
      onRestart: () => { if (renderer) renderer.restart(); },
      onSkip: () => {
        if (renderer) {
          renderer.skipToEnd();
        }
      },
    }
  );

  workspaceElements = elements;
  showView(elements.container);

  // Measure canvas and probe GPU
  requestAnimationFrame(async () => {
    if (animCanvas && workspaceElements) {
      const container = workspaceElements.canvasContainer;
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(100, Math.floor(rect.width - 32));
      const h = Math.max(100, Math.floor(rect.height - 32));
      animCanvas.style.width = `${w}px`;
      animCanvas.style.height = `${h}px`;
      animCanvas.width = w * dpr;
      animCanvas.height = h * dpr;

      // Probe GPU backend
      if (!renderer) {
        renderer = new ParticleRenderer(animCanvas, state.animConfig);
        await renderer.initWebGPUIfSupported();
        const backend = renderer.getBackend();
        const badgeColor = backend === 'WebGPU' ? '#10b981' : '#6366f1';
        workspaceElements.statusBackend.innerHTML = `<span style="color:${badgeColor}; font-weight:600;">[${backend}]</span>`;
      }
    }
  });
}

// ---- Reconstruction ----

async function startReconstruction() {
  if (state.isProcessing || !state.processedSource || !state.processedTarget) return;
  state.isProcessing = true;

  if (!workspaceElements) return;

  workspaceElements.processingOverlay.classList.remove('hidden');
  workspaceElements.processingText.textContent = 'Calculating optimal pixel assignment...';
  workspaceElements.processingFill.style.width = '0%';

  const phaseDot = workspaceElements.statusPhase.querySelector('.status-dot');
  if (phaseDot) phaseDot.classList.add('processing');

  try {
    const result = await workerManager.reconstruct(
      state.processedSource,
      state.processedTarget,
      state.algorithm,
      state.enableSegmentation,
      (progress) => {
        if (!workspaceElements) return;
        workspaceElements.processingText.textContent = progress.message;
        workspaceElements.processingFill.style.width = `${Math.round(progress.progress * 100)}%`;
        workspaceElements.progressFill.style.width = `${Math.round(progress.progress * 100)}%`;
      }
    );

    state.result = result;
    state.isProcessing = false;

    workspaceElements.processingOverlay.classList.add('hidden');
    if (phaseDot) {
      phaseDot.classList.remove('processing');
      phaseDot.classList.add('active');
    }

    // Launch GPU Animation
    await startAnimation(result);
  } catch (err) {
    state.isProcessing = false;
    if (workspaceElements) {
      workspaceElements.processingOverlay.classList.add('hidden');
      workspaceElements.processingText.textContent = `Error: ${err}`;
    }
    console.error('Reconstruction error:', err);
  }
}

async function startAnimation(result: ReconstructionResult) {
  if (!state.processedSource || !state.processedTarget || !animCanvas) return;

  const maxParticles = Math.min(state.animConfig.particleCount, result.mapping.length);
  const particleData = prepareParticleData(
    state.processedSource,
    state.processedTarget,
    result.mapping,
    maxParticles
  );

  if (renderer) renderer.dispose();
  renderer = new ParticleRenderer(animCanvas, state.animConfig);
  await renderer.initWebGPUIfSupported();
  renderer.resize();

  if (workspaceElements) {
    const backend = renderer.getBackend();
    const badgeColor = backend === 'WebGPU' ? '#10b981' : '#6366f1';
    workspaceElements.statusBackend.innerHTML = `<span style="color:${badgeColor}; font-weight:600;">[${backend}]</span>`;
  }

  renderer.setParticles(
    particleData.sourcePositions,
    particleData.targetPositions,
    particleData.colors,
    state.processedTarget.width,
    state.processedTarget.height
  );

  // Track FPS
  animFPSInterval = window.setInterval(() => {
    if (renderer && workspaceElements) {
      workspaceElements.statusFps.textContent = `${Math.round(renderer.getFPS())} FPS`;
    }
  }, 400);

  // Attempt recording for video export
  recorder.start(animCanvas, 60);

  renderer.play(
    async () => {
      // Stop recorder
      state.recordedVideoBlob = await recorder.stop();

      // Transition to results
      setTimeout(() => showResults(result), 600);
    },
    (progress) => {
      if (workspaceElements) {
        workspaceElements.progressFill.style.width = `${Math.round(progress * 100)}%`;
        workspaceElements.statusProgress.textContent = `${Math.round(progress * 100)}%`;
      }
    }
  );

  if (workspaceElements) {
    const phaseText = workspaceElements.statusPhase.querySelector('span:last-child');
    if (phaseText) phaseText.textContent = 'Transforming';
  }
}

// ---- Results ----

function showResults(result: ReconstructionResult) {
  if (!state.processedTarget) return;
  clearViews();
  state.view = 'results';

  const targetCanvas = imageInfoToCanvas(state.processedTarget);

  const reconCanvas = document.createElement('canvas');
  reconCanvas.width = result.width;
  reconCanvas.height = result.height;
  const ctx = reconCanvas.getContext('2d')!;
  const imgData = ctx.createImageData(result.width, result.height);
  imgData.data.set(result.reconstructedPixels);
  ctx.putImageData(imgData, 0, 0);

  const metrics: ReconstructionMetrics = {
    quality: result.quality,
    duration: result.duration,
    algorithm: result.algorithm,
    totalPixels: result.width * result.height,
    width: result.width,
    height: result.height,
  };

  const resultsView = createResults(
    targetCanvas,
    reconCanvas,
    metrics,
    state.recordedVideoBlob,
    async (format, quality) => {
      try {
        const blob = await imageDataToBlob(imgData, format, quality);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ext = format.split('/')[1] || 'png';
        a.download = `pixora-x-reconstruction.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Export error:', err);
      }
    },
    showLanding
  );

  showView(resultsView);
}

// ---- Start ----

init();
