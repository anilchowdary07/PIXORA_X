// ============================================================
// PIXORA X — Results View with Interactive Split Comparison
// ============================================================

import { createButton, createSelect } from './controls.ts';
import type { ReconstructionMetrics } from '../engine/types.ts';

export function createResults(
  targetCanvas: HTMLCanvasElement,
  reconstructedCanvas: HTMLCanvasElement,
  metrics: ReconstructionMetrics,
  recordedVideoBlob: Blob | null,
  onExport: (format: string, quality: number) => void,
  onNewReconstruction: () => void
): HTMLElement {
  const results = document.createElement('div');
  results.className = 'view results';

  // Header
  const header = document.createElement('div');
  header.className = 'results-header';

  const title = document.createElement('h2');
  title.className = 'results-title';
  title.textContent = 'Reconstruction Complete';

  const newBtn = createButton('← New Reconstruction', 'secondary', onNewReconstruction);
  header.append(title, newBtn);

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

  // Update overlay width on container resize
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
  labelLeft.style.cssText = 'position: absolute; top: 12px; left: 16px; background: rgba(0,0,0,0.6); padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; pointer-events: none;';
  labelLeft.textContent = '✨ Reconstructed (Source Pixels)';

  const labelRight = document.createElement('div');
  labelRight.style.cssText = 'position: absolute; top: 12px; right: 16px; background: rgba(0,0,0,0.6); padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; pointer-events: none;';
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
  sliderHint.textContent = 'Drag slider left/right to inspect reconstruction quality against original target';
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

  // Export actions
  const actions = document.createElement('div');
  actions.className = 'results-actions';

  let selectedFormat = 'image/png';
  let selectedQuality = 0.95;

  const formatSelect = createSelect(
    'Format',
    [
      { value: 'image/png', label: 'PNG' },
      { value: 'image/jpeg', label: 'JPEG' },
      { value: 'image/webp', label: 'WebP' },
    ],
    'image/png',
    (v) => { selectedFormat = v; }
  );

  const exportBtn = createButton('💾 Download Image', 'primary', () => {
    onExport(selectedFormat, selectedQuality);
  });

  actions.append(formatSelect, exportBtn);

  // If video was recorded, show video download button
  if (recordedVideoBlob) {
    const videoBtn = createButton('🎥 Download Animation (WebM)', 'secondary', () => {
      const url = URL.createObjectURL(recordedVideoBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pixora-x-animation.webm';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
    actions.appendChild(videoBtn);
  }

  results.append(header, comparisonWrap, metricsRow, actions);

  return results;
}
