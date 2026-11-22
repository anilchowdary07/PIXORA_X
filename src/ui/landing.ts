// ============================================================
// PIXORA X — Landing Page
// ============================================================

import { createDropZone, createButton } from './controls.ts';

export function createLanding(
  onSourceUpload: (file: File) => void,
  onTargetUpload: (file: File) => void,
  onDemo: () => void
): HTMLElement {
  const landing = document.createElement('div');
  landing.className = 'view landing';

  // Animated background
  const bg = document.createElement('div');
  bg.className = 'animated-bg';
  landing.appendChild(bg);

  // Hero section
  const hero = document.createElement('div');
  hero.className = 'landing-hero';

  const logo = document.createElement('h1');
  logo.className = 'landing-logo';
  logo.textContent = 'PIXORA X';

  const subtitle = document.createElement('p');
  subtitle.className = 'landing-subtitle';
  subtitle.textContent = 'Reconstruct any image using exclusively the pixels from another. Watch millions of particles transform in real-time with GPU-powered simulation.';

  hero.append(logo, subtitle);

  // Upload zones
  const uploadRow = document.createElement('div');
  uploadRow.className = 'landing-upload-row';

  const sourceZone = createDropZone(
    'SOURCE IMAGE',
    'Provides the source pixels for reconstruction',
    onSourceUpload
  );

  const targetZone = createDropZone(
    'TARGET IMAGE',
    'The target structure to recreate',
    onTargetUpload
  );

  uploadRow.append(sourceZone, targetZone);

  // Demo button
  const orText = document.createElement('div');
  orText.className = 'landing-or';
  orText.textContent = 'or';

  const demoBtn = createButton('✨ Try Interactive Demo', 'secondary', onDemo);
  demoBtn.classList.add('btn-lg');

  // Features
  const features = document.createElement('div');
  features.className = 'landing-features';

  const featureList = [
    'WebGPU & WebGL Acceleration',
    'Strict Pixel Provenance (1:1)',
    'AI Subject Saliency',
    '100% Client-Side & Free',
  ];

  for (const f of featureList) {
    const badge = document.createElement('div');
    badge.className = 'feature-badge';
    const dot = document.createElement('span');
    dot.className = 'feature-dot';
    const text = document.createElement('span');
    text.textContent = f;
    badge.append(dot, text);
    features.appendChild(badge);
  }

  landing.append(hero, uploadRow, orText, demoBtn, features);

  return landing;
}
