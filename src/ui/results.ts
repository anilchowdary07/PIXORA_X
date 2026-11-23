// ============================================================
// PIXORA X — Results View with Multi-Format Export Center
// ============================================================

import { createButton, createSelect } from './controls.ts';
import { ALL_ALGORITHM_TYPES, ALGORITHM_LABELS, type AlgorithmType, type ReconstructionMetrics } from '../engine/types.ts';
import type { ReconstructionResult } from '../workers/worker-manager.ts';

export interface ResultsCallbacks {
  onExport: (format: string, quality: number) => void;
  onExportComparison: () => void;
  onExportMegaComparison?: () => void;
  onBatchDownloadAll?: () => void;
  onExportSingleMethod?: (algo: AlgorithmType) => void;
  onCopyToClipboard: () => void;
  onBackToWorkspace: () => void;
  onNewReconstruction: () => void;
  onAlgorithmChange?: (a: AlgorithmType) => void;
  onCompareAllMethods?: () => void;
  onSelectActiveResult?: (algo: AlgorithmType) => void;
}

export function createResults(
  sourceCanvas: HTMLCanvasElement,
  targetCanvas: HTMLCanvasElement,
  reconstructedCanvas: HTMLCanvasElement,
  metrics: ReconstructionMetrics,
  recordedVideoBlob: Blob | null,
  callbacks: ResultsCallbacks,
  multiResults: Record<AlgorithmType, ReconstructionResult> | null = null
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

  // Button to compare all 6 methods at once
  if (callbacks.onCompareAllMethods) {
    const compareAllBtn = createButton(
      multiResults ? '⚡ Re-run All 6 Methods' : '⚡ Compare All 6 Methods at Once',
      'primary',
      callbacks.onCompareAllMethods
    );
    compareAllBtn.id = 'res-compare-all-btn';
    compareAllBtn.title = 'Run all 6 algorithms simultaneously to inspect and compare their outputs';
    navGroup.appendChild(compareAllBtn);
  }

  const algoSelect = createSelect(
    'Algorithm',
    Object.entries(ALGORITHM_LABELS).map(([value, label]) => ({ value, label })),
    metrics.algorithm,
    (v) => {
      if (callbacks.onAlgorithmChange) {
        callbacks.onAlgorithmChange(v as AlgorithmType);
      }
    }
  );
  algoSelect.classList.add('results-algo-select');

  const backBtn = createButton('← Back to Workspace', 'secondary', callbacks.onBackToWorkspace);
  backBtn.id = 'res-back-btn';
  backBtn.title = 'Return to workspace with current images preserved';

  const newBtn = createButton('+ New Images', 'secondary', callbacks.onNewReconstruction);
  newBtn.id = 'res-new-btn';
  newBtn.title = 'Start fresh with new source and target images';

  navGroup.append(algoSelect, backBtn, newBtn);
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
  reconLbl.textContent = `2. Reconstructed (${ALGORITHM_LABELS[metrics.algorithm as AlgorithmType] || metrics.algorithm})`;
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

  // ---- 6-Method Comparison Matrix (When Available) ----
  let multiMatrixSection: HTMLElement | null = null;
  if (multiResults) {
    multiMatrixSection = document.createElement('div');
    multiMatrixSection.className = 'results-multi-section';

    const mmHeader = document.createElement('div');
    mmHeader.className = 'results-multi-header';
    mmHeader.innerHTML = `
      <div class="multi-header-left">
        <span class="multi-header-badge">⚡ 6-Method Side-by-Side Outputs</span>
        <h3 class="multi-header-title">All Method Outputs (Click Any Method to Load in Split Slider)</h3>
      </div>
    `;

    const mmActions = document.createElement('div');
    mmActions.className = 'multi-header-actions';

    if (callbacks.onExportMegaComparison) {
      const posterBtn = createButton('🖼️ Download All-Methods Poster', 'primary', callbacks.onExportMegaComparison);
      posterBtn.classList.add('btn-sm');
      posterBtn.title = 'Download a comprehensive high-res verification card showing all 6 methods + source + target';
      mmActions.appendChild(posterBtn);
    }

    if (callbacks.onBatchDownloadAll) {
      const batchBtn = createButton('📦 Batch Download All 6', 'secondary', callbacks.onBatchDownloadAll);
      batchBtn.classList.add('btn-sm');
      batchBtn.title = 'Download all 6 reconstructed images as individual lossless PNGs';
      mmActions.appendChild(batchBtn);
    }

    mmHeader.appendChild(mmActions);
    multiMatrixSection.appendChild(mmHeader);

    const matrixGrid = document.createElement('div');
    matrixGrid.className = 'multi-methods-grid';

    for (const algo of ALL_ALGORITHM_TYPES) {
      const r = multiResults[algo];
      if (!r) continue;

      const card = document.createElement('div');
      const isActive = algo === metrics.algorithm;
      card.className = `multi-method-card${isActive ? ' active' : ''}`;

      // Create thumbnail canvas
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = r.width;
      thumbCanvas.height = r.height;
      const tCtx = thumbCanvas.getContext('2d')!;
      const imgData = tCtx.createImageData(r.width, r.height);
      imgData.data.set(r.reconstructedPixels);
      tCtx.putImageData(imgData, 0, 0);

      const topBar = document.createElement('div');
      topBar.className = 'method-card-top';

      const algoName = document.createElement('span');
      algoName.className = 'method-card-name';
      algoName.textContent = ALGORITHM_LABELS[algo];

      const scoreBadge = document.createElement('span');
      scoreBadge.className = 'method-card-score';
      scoreBadge.textContent = `${(r.quality * 100).toFixed(1)}%`;

      topBar.append(algoName, scoreBadge);

      const imgWrapper = document.createElement('div');
      imgWrapper.className = 'method-card-img-wrap';
      const img = document.createElement('img');
      img.src = thumbCanvas.toDataURL();
      img.alt = ALGORITHM_LABELS[algo];
      imgWrapper.appendChild(img);

      const bottomBar = document.createElement('div');
      bottomBar.className = 'method-card-bottom';

      const statusBadge = document.createElement('span');
      statusBadge.className = `method-status-pill${isActive ? ' active-pill' : ''}`;
      statusBadge.textContent = isActive ? '✓ In Split Slider' : '👁️ Click to View';

      const dlBtn = document.createElement('button');
      dlBtn.className = 'btn-icon-dl';
      dlBtn.innerHTML = '💾 PNG';
      dlBtn.title = `Download ${ALGORITHM_LABELS[algo]} output (PNG)`;
      dlBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (callbacks.onExportSingleMethod) {
          callbacks.onExportSingleMethod(algo);
        }
      });

      bottomBar.append(statusBadge, dlBtn);

      card.append(topBar, imgWrapper, bottomBar);

      // Clicking card selects it as the active result in the split slider
      card.addEventListener('click', () => {
        if (callbacks.onSelectActiveResult) {
          callbacks.onSelectActiveResult(algo);
        }
      });

      matrixGrid.appendChild(card);
    }

    multiMatrixSection.appendChild(matrixGrid);
  }

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

  // Multi-Method downloads if available
  if (multiResults) {
    if (callbacks.onExportMegaComparison) {
      const posterBtn = createButton('🖼️ Download All-Methods Poster', 'primary', callbacks.onExportMegaComparison);
      posterBtn.title = 'Download full 6-method side-by-side comparison poster (PNG)';
      exportButtons.appendChild(posterBtn);
    }
    if (callbacks.onBatchDownloadAll) {
      const batchBtn = createButton('📦 Batch Download All 6 (PNG)', 'secondary', callbacks.onBatchDownloadAll);
      batchBtn.title = 'Download each of the 6 reconstructed algorithm images as lossless PNG files';
      exportButtons.appendChild(batchBtn);
    }
  } else if (callbacks.onCompareAllMethods) {
    const compareAllBtn = createButton('⚡ Compare All 6 Methods', 'primary', callbacks.onCompareAllMethods);
    compareAllBtn.title = 'Run all 6 reconstruction methods at once to compare their outputs';
    exportButtons.appendChild(compareAllBtn);
  }

  // 1. Download PNG
  const pngBtn = createButton(`💾 Download ${ALGORITHM_LABELS[metrics.algorithm as AlgorithmType] || metrics.algorithm} (PNG)`, 'secondary', () => {
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
  const compareBtn = createButton('📊 Download 3-Panel Card', 'secondary', () => {
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

  if (multiMatrixSection) {
    results.append(header, strip, comparisonWrap, metricsRow, multiMatrixSection, exportCenter, footer);
  } else {
    results.append(header, strip, comparisonWrap, metricsRow, exportCenter, footer);
  }

  return results;
}
