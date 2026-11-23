// ============================================================
// PIXORA X — Results View with Multi-Format Export Center
// ============================================================

import { createButton } from './controls.ts';
import type { ReconstructionMetrics } from '../engine/types.ts';

export interface ResultsCallbacks {
  onExport: (format: string, quality: number) => void;
  onExportComparison: () => void;
  onCopyToClipboard: () => void;
  onBackToWorkspace: () => void;
  onNewReconstruction: () => void;
}

export function createResults(
  sourceCanvas: HTMLCanvasElement,
  targetCanvas: HTMLCanvasElement,
  reconstructedCanvas: HTMLCanvasElement,
  metrics: ReconstructionMetrics,
  recordedVideoBlob: Blob | null,
  callbacks: ResultsCallbacks
): HTMLElement {
  const results = document.createElement('div');
  results.className = 'view results';

  // Header
  const header = document.createElement('div');
  header.className = 'results-header';

  const title = document.createElement('h2');
  title.className = 'results-title';
  title.textContent = 'Reconstruction Complete';

  const navGroup = document.createElement('div');
  navGroup.className = 'results-nav-group';

  const backBtn = createButton('← Back to Workspace', 'primary', callbacks.onBackToWorkspace);
  backBtn.id = 'res-back-btn';
  backBtn.title = 'Return to workspace with current images preserved';

  const newBtn = createButton('+ New Images', 'secondary', callbacks.onNewReconstruction);
  newBtn.id = 'res-new-btn';
  newBtn.title = 'Start fresh with new source and target images';

  navGroup.append(backBtn, newBtn);
  header.append(title, navGroup);

  // 3-Stage Visual Pipeline Summary Strip
  const strip = document.createElement('div');
  strip.className = 'results-preview-strip';

  // 1. Source Card
  const srcCard = document.createElement('div');
  srcCard.className = 'results-strip-card';
  const srcImg = document.createElement('img');
  srcImg.src = sourceCanvas.toDataURL();
  srcImg.alt = 'Source image';
  const srcLbl = document.createElement('span');
  srcLbl.className = 'strip-label';
  srcLbl.textContent = '1. Source (Pixels)';
  srcCard.append(srcImg, srcLbl);

  // Arrow 1
  const arrow1 = document.createElement('div');
  arrow1.className = 'strip-arrow';
  arrow1.textContent = '➔';

  // 2. Reconstructed Card (Hero)
  const reconCard = document.createElement('div');
  reconCard.className = 'results-strip-card highlight';
  const reconImgThumb = document.createElement('img');
  reconImgThumb.src = reconstructedCanvas.toDataURL();
  reconImgThumb.alt = 'Reconstructed image';
  const reconLbl = document.createElement('span');
  reconLbl.className = 'strip-label';
  reconLbl.textContent = '2. Reconstructed (1:1)';
  reconCard.append(reconImgThumb, reconLbl);

  // Arrow 2
  const arrow2 = document.createElement('div');
  arrow2.className = 'strip-arrow';
  arrow2.textContent = 'vs';

  // 3. Target Card
  const tgtCard = document.createElement('div');
  tgtCard.className = 'results-strip-card';
  const tgtImgThumb = document.createElement('img');
  tgtImgThumb.src = targetCanvas.toDataURL();
  tgtImgThumb.alt = 'Target image';
  const tgtLbl = document.createElement('span');
  tgtLbl.className = 'strip-label';
  tgtLbl.textContent = '3. Target (Goal)';
  tgtCard.append(tgtImgThumb, tgtLbl);

  strip.append(srcCard, arrow1, reconCard, arrow2, tgtCard);

  // Interactive Comparison Viewer (Split Slider)
  const comparisonWrap = document.createElement('div');
  comparisonWrap.style.cssText = `
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    width: 100%;
  `;

  const comparisonContainer = document.createElement('div');
  comparisonContainer.className = 'split-comparison-container';
  comparisonContainer.style.cssText = `
    position: relative;
    max-width: 680px;
    width: 100%;
    aspect-ratio: ${targetCanvas.width} / ${targetCanvas.height};
    border-radius: var(--radius-lg);
    overflow: hidden;
    box-shadow: var(--shadow-lg);
    border: 1px solid var(--border-medium);
    user-select: none;
    touch-action: none;
    cursor: ew-resize;
    background: #000;
  `;

  // Original Target Image (Base)
  const baseImg = document.createElement('img');
  baseImg.src = targetCanvas.toDataURL();
  baseImg.style.cssText = 'position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none;';

  // Reconstructed Image (Clipped Overlay)
  const overlayWrap = document.createElement('div');
  overlayWrap.style.cssText = `
    position: absolute;
    inset: 0;
    width: 50%;
    overflow: hidden;
    pointer-events: none;
  `;

  const overlayImg = document.createElement('img');
  overlayImg.src = reconstructedCanvas.toDataURL();
  overlayImg.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: ${comparisonContainer.clientWidth || 680}px;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
  `;

  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      overlayImg.style.width = `${entry.contentRect.width}px`;
    }
  });
  ro.observe(comparisonContainer);

  overlayWrap.appendChild(overlayImg);

  // Divider Line & Handle
  const divider = document.createElement('div');
  divider.style.cssText = `
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 2px;
    background: #ffffff;
    box-shadow: 0 0 10px rgba(0,0,0,0.8);
    transform: translateX(-50%);
    pointer-events: none;
  `;

  const handle = document.createElement('div');
  handle.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--accent-gradient);
    border: 2px solid #ffffff;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 14px;
    pointer-events: none;
  `;
  handle.innerHTML = '‹ ›';
  divider.appendChild(handle);

  // Labels
  const labelLeft = document.createElement('div');
  labelLeft.style.cssText = 'position: absolute; top: 12px; left: 16px; background: rgba(0,0,0,0.65); backdrop-filter: blur(8px); padding: 5px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; pointer-events: none; color: #a5b4fc;';
  labelLeft.textContent = '✨ Reconstructed (Source Pixels)';

  const labelRight = document.createElement('div');
  labelRight.style.cssText = 'position: absolute; top: 12px; right: 16px; background: rgba(0,0,0,0.65); backdrop-filter: blur(8px); padding: 5px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; pointer-events: none; color: #e8e8f0;';
  labelRight.textContent = '🎯 Original Target';

  comparisonContainer.append(baseImg, overlayWrap, divider, labelLeft, labelRight);

  // Slider interaction
  let isDragging = false;
  function updateSlider(clientX: number) {
    const rect = comparisonContainer.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const pct = (x / rect.width) * 100;
    overlayWrap.style.width = `${pct}%`;
    divider.style.left = `${pct}%`;
  }

  comparisonContainer.addEventListener('pointerdown', (e) => {
    isDragging = true;
    comparisonContainer.setPointerCapture(e.pointerId);
    updateSlider(e.clientX);
  });
  comparisonContainer.addEventListener('pointermove', (e) => {
    if (isDragging) updateSlider(e.clientX);
  });
  const stopDrag = () => { isDragging = false; };
  comparisonContainer.addEventListener('pointerup', stopDrag);
  comparisonContainer.addEventListener('pointercancel', stopDrag);

  const sliderHint = document.createElement('div');
  sliderHint.style.cssText = 'font-size: 0.8rem; color: var(--text-muted);';
  sliderHint.textContent = 'Drag slider left/right to compare reconstructed source pixels against target geometry';
  comparisonWrap.append(comparisonContainer, sliderHint);

  // Metrics
  const metricsRow = document.createElement('div');
  metricsRow.className = 'results-metrics';

  const metricData = [
    { value: `${(metrics.quality * 100).toFixed(1)}%`, label: 'Quality Score' },
    { value: `${(metrics.duration / 1000).toFixed(2)}s`, label: 'Compute Time' },
    { value: metrics.algorithm, label: 'Algorithm' },
    { value: metrics.totalPixels.toLocaleString(), label: 'Pixels Mapped' },
    { value: `${metrics.width}×${metrics.height}`, label: 'Dimensions' },
    { value: '100% (1:1)', label: 'Pixel Provenance' },
  ];

  for (const m of metricData) {
    const card = document.createElement('div');
    card.className = 'metric-card';

    const val = document.createElement('div');
    val.className = 'metric-value';
    val.textContent = m.value;

    const lbl = document.createElement('div');
    lbl.className = 'metric-label';
    lbl.textContent = m.label;

    card.append(val, lbl);
    metricsRow.appendChild(card);
  }

  // Multi-Format Export Center
  const exportCenter = document.createElement('div');
  exportCenter.className = 'export-center';

  const exportTitle = document.createElement('div');
  exportTitle.className = 'export-center-title';
  exportTitle.textContent = 'Download & Export Options';

  const exportButtons = document.createElement('div');
  exportButtons.className = 'export-buttons-grid';

  // 1. Download PNG
  const pngBtn = createButton('💾 Download PNG (Lossless)', 'primary', () => {
    callbacks.onExport('image/png', 1.0);
  });

  // 2. Download JPEG
  const jpgBtn = createButton('🖼️ Download JPEG', 'secondary', () => {
    callbacks.onExport('image/jpeg', 0.95);
  });

  // 3. Download WebP
  const webpBtn = createButton('🌐 Download WebP', 'secondary', () => {
    callbacks.onExport('image/webp', 0.95);
  });

  // 4. Download Side-by-Side Comparison
  const compareBtn = createButton('📊 Download Comparison Card', 'secondary', () => {
    callbacks.onExportComparison();
  });

  // 5. Copy to Clipboard
  const copyBtn = createButton('📋 Copy Image to Clipboard', 'secondary', () => {
    callbacks.onCopyToClipboard();
  });

  exportButtons.append(pngBtn, jpgBtn, webpBtn, compareBtn, copyBtn);

  // 6. Download WebM Video (if recorded)
  if (recordedVideoBlob) {
    const videoBtn = createButton('🎥 Download Animation (WebM)', 'primary', () => {
      const url = URL.createObjectURL(recordedVideoBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pixora-x-reconstruction-animation.webm';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
    exportButtons.appendChild(videoBtn);
  }

  exportCenter.append(exportTitle, exportButtons);

  const footer = document.createElement('footer');
  footer.className = 'app-footer';
  footer.innerHTML = 'Made with <span class="heart-icon">♥</span> by <span class="author-name">Anil Chowdary</span>';

  results.append(header, strip, comparisonWrap, metricsRow, exportCenter, footer);

  return results;
}
