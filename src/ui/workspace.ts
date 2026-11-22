// ============================================================
// PIXORA X — Workspace View
// ============================================================

import { createSelect, createSlider, createButton, createImagePreview } from './controls.ts';
import type { AlgorithmType, QualityPreset, AnimationStyle } from '../engine/types.ts';
import { ALGORITHM_LABELS, PRESET_CONFIG, ANIMATION_LABELS } from '../engine/types.ts';

export interface WorkspaceCallbacks {
  onReconstruct: () => void;
  onBack: () => void;
  onDownloadOutput: (format: string) => void;
  onAlgorithmChange: (a: AlgorithmType) => void;
  onPresetChange: (p: QualityPreset) => void;
  onSegmentationToggle: (enabled: boolean) => void;
  onAnimStyleChange: (s: AnimationStyle) => void;
  onSpeedChange: (v: number) => void;
  onParticleSizeChange: (v: number) => void;
  onParticleCountChange: (v: number) => void;
  onMotionChange: (v: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
  onSkip: () => void;
}

export interface WorkspaceElements {
  container: HTMLElement;
  statusPhase: HTMLElement;
  statusFps: HTMLElement;
  statusBackend: HTMLElement;
  statusProgress: HTMLElement;
  progressFill: HTMLElement;
  processingOverlay: HTMLElement;
  processingText: HTMLElement;
  processingFill: HTMLElement;
  canvasContainer: HTMLElement;
  segmentationBtn: HTMLButtonElement;
  downloadBtn: HTMLButtonElement;
  reconstructBtn: HTMLButtonElement;
}

export function createWorkspace(
  sourceCanvas: HTMLCanvasElement,
  targetCanvas: HTMLCanvasElement,
  animCanvas: HTMLCanvasElement,
  algorithm: AlgorithmType,
  preset: QualityPreset,
  enableSegmentation: boolean,
  particleCount: number,
  callbacks: WorkspaceCallbacks
): WorkspaceElements {
  const workspace = document.createElement('div');
  workspace.className = 'view workspace';

  // ---- Toolbar ----
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';

  const toolbarLeft = document.createElement('div');
  toolbarLeft.className = 'toolbar-left';

  const backBtn = createButton('← Back', 'ghost', callbacks.onBack);

  const title = document.createElement('span');
  title.className = 'toolbar-title';
  title.textContent = 'PIXORA X';

  const sep1 = document.createElement('div');
  sep1.className = 'toolbar-sep';

  const algoSelect = createSelect(
    'Algorithm',
    Object.entries(ALGORITHM_LABELS).map(([value, label]) => ({ value, label })),
    algorithm,
    (v) => callbacks.onAlgorithmChange(v as AlgorithmType)
  );

  const presetSelect = createSelect(
    'Quality',
    Object.entries(PRESET_CONFIG).map(([value, { label }]) => ({ value, label })),
    preset,
    (v) => callbacks.onPresetChange(v as QualityPreset)
  );

  let isSegActive = enableSegmentation;
  const segmentationBtn = createButton(
    isSegActive ? '🎯 Saliency: ON' : '🎯 Saliency: OFF',
    isSegActive ? 'primary' : 'secondary',
    () => {
      isSegActive = !isSegActive;
      segmentationBtn.textContent = isSegActive ? '🎯 Saliency: ON' : '🎯 Saliency: OFF';
      segmentationBtn.className = `btn btn-${isSegActive ? 'primary' : 'secondary'} btn-sm`;
      callbacks.onSegmentationToggle(isSegActive);
    }
  );
  segmentationBtn.classList.add('btn-sm');
  segmentationBtn.title = 'Prioritize focal subject pixels over background pixels using saliency mapping';

  toolbarLeft.append(backBtn, sep1, title);

  const toolbarRight = document.createElement('div');
  toolbarRight.className = 'toolbar-right';

  const reconstructBtn = createButton('⚡ Reconstruct', 'primary', callbacks.onReconstruct);
  reconstructBtn.classList.add('btn-sm');

  // Prominent Download Output Button
  const downloadBtn = createButton('💾 Download Output', 'secondary', () => {
    callbacks.onDownloadOutput('image/png');
  });
  downloadBtn.classList.add('btn-sm');
  downloadBtn.title = 'Download the reconstructed output image (PNG)';

  toolbarRight.append(algoSelect, presetSelect, segmentationBtn, reconstructBtn, downloadBtn);
  toolbar.append(toolbarLeft, toolbarRight);

  // ---- Content ----
  const content = document.createElement('div');
  content.className = 'workspace-content';

  // Left panel: source preview
  const leftPanel = document.createElement('div');
  leftPanel.className = 'preview-panel';
  leftPanel.appendChild(createImagePreview(sourceCanvas, 'Source (Pixels)'));

  // Center: canvas
  const canvasContainer = document.createElement('div');
  canvasContainer.className = 'canvas-container';
  animCanvas.style.width = '100%';
  animCanvas.style.height = '100%';
  canvasContainer.appendChild(animCanvas);

  // Processing overlay
  const processingOverlay = document.createElement('div');
  processingOverlay.className = 'processing-overlay hidden';

  const spinner = document.createElement('div');
  spinner.className = 'processing-spinner';

  const processingText = document.createElement('div');
  processingText.className = 'processing-text';
  processingText.textContent = 'Processing...';

  const processingProgress = document.createElement('div');
  processingProgress.className = 'processing-progress';
  const processingFill = document.createElement('div');
  processingFill.className = 'processing-progress-fill';
  processingProgress.appendChild(processingFill);

  processingOverlay.append(spinner, processingText, processingProgress);
  canvasContainer.appendChild(processingOverlay);

  // Right panel: target preview
  const rightPanel = document.createElement('div');
  rightPanel.className = 'preview-panel';
  rightPanel.appendChild(createImagePreview(targetCanvas, 'Target (Structure)'));

  content.append(leftPanel, canvasContainer, rightPanel);

  // ---- Controls Bar ----
  const controls = document.createElement('div');
  controls.className = 'controls-bar';

  // Animation style buttons
  const styleGroup = document.createElement('div');
  styleGroup.className = 'control-group';
  const styleLabel = document.createElement('span');
  styleLabel.className = 'control-label';
  styleLabel.textContent = 'Style';
  styleGroup.appendChild(styleLabel);

  const styleBtnGroup = document.createElement('div');
  styleBtnGroup.className = 'btn-group';

  const styles = Object.entries(ANIMATION_LABELS) as [AnimationStyle, string][];
  for (const [value, label] of styles) {
    const btn = document.createElement('button');
    btn.className = 'btn-icon' + (value === 'flow' ? ' active' : '');
    btn.textContent = label.slice(0, 2);
    btn.title = label;
    btn.addEventListener('click', () => {
      styleBtnGroup.querySelectorAll('.btn-icon').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      callbacks.onAnimStyleChange(value);
    });
    styleBtnGroup.appendChild(btn);
  }
  styleGroup.appendChild(styleBtnGroup);

  const speedSlider = createSlider('Speed', 0.1, 3.0, 1.0, 0.1, callbacks.onSpeedChange);
  const sizeSlider = createSlider('Size', 1, 8, 2, 0.5, callbacks.onParticleSizeChange);
  const countSlider = createSlider('Particles', 50000, 1000000, particleCount, 50000, callbacks.onParticleCountChange);
  const motionSlider = createSlider('Motion', 0, 1, 0.5, 0.1, callbacks.onMotionChange);

  // Playback controls
  const playbackGroup = document.createElement('div');
  playbackGroup.className = 'control-group';

  const playBtn = createButton('▶', 'secondary', callbacks.onPlay);
  playBtn.classList.add('btn-icon');
  playBtn.title = 'Play';

  const pauseBtn = createButton('⏸', 'secondary', callbacks.onPause);
  pauseBtn.classList.add('btn-icon');
  pauseBtn.title = 'Pause';

  const restartBtn = createButton('↻', 'secondary', callbacks.onRestart);
  restartBtn.classList.add('btn-icon');
  restartBtn.title = 'Restart';

  const skipBtn = createButton('⏭', 'secondary', callbacks.onSkip);
  skipBtn.classList.add('btn-icon');
  skipBtn.title = 'Skip to End';

  playbackGroup.append(playBtn, pauseBtn, restartBtn, skipBtn);

  controls.append(styleGroup, speedSlider, sizeSlider, countSlider, motionSlider, playbackGroup);

  // ---- Status Bar ----
  const statusBar = document.createElement('div');
  statusBar.className = 'status-bar';

  const statusPhase = document.createElement('div');
  statusPhase.className = 'status-item';
  const phaseDot = document.createElement('span');
  phaseDot.className = 'status-dot';
  const phaseText = document.createElement('span');
  phaseText.textContent = 'Ready';
  statusPhase.append(phaseDot, phaseText);

  const statusBackend = document.createElement('div');
  statusBackend.className = 'status-item';
  statusBackend.innerHTML = '<span style="color:var(--accent-lighter); font-weight:600;">[GPU Engine]</span>';

  const progressWrap = document.createElement('div');
  progressWrap.className = 'progress-bar-wrap';
  const progressFill = document.createElement('div');
  progressFill.className = 'progress-bar-fill';
  progressWrap.appendChild(progressFill);

  const statusFps = document.createElement('div');
  statusFps.className = 'status-item';
  statusFps.textContent = '-- FPS';

  const statusProgress = document.createElement('div');
  statusProgress.className = 'status-item';
  statusProgress.textContent = '0%';

  statusBar.append(statusPhase, statusBackend, progressWrap, statusFps, statusProgress);

  // Assemble
  workspace.append(toolbar, content, controls, statusBar);

  return {
    container: workspace,
    statusPhase,
    statusFps,
    statusBackend,
    statusProgress,
    progressFill,
    processingOverlay,
    processingText,
    processingFill,
    canvasContainer,
    segmentationBtn,
    downloadBtn,
    reconstructBtn,
  };
}
