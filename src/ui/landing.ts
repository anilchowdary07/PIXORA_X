// ============================================================
// PIXORA X — Premium Landing Page
// ============================================================

import { createDropZone, createButton } from './controls.ts';
import { SHOWCASES, type DemoShowcase } from '../engine/demo-images.ts';

export function createLanding(
  onSourceUpload: (file: File) => void,
  onTargetUpload: (file: File) => void,
  onShowcaseSelect: (showcase: DemoShowcase) => void
): HTMLElement {
  const landing = document.createElement('div');
  landing.className = 'view landing';

  // Animated background
  const bg = document.createElement('div');
  bg.className = 'animated-bg';
  landing.appendChild(bg);

  // Top Nav
  const nav = document.createElement('header');
  nav.className = 'landing-nav';
  nav.innerHTML = `
    <div class="nav-brand">
      <svg width="24" height="24" viewBox="0 0 32 32" style="border-radius:6px; overflow:hidden;">
        <rect width="32" height="32" fill="#6366f1"/>
        <rect x="4" y="4" width="10" height="10" rx="2" fill="#ffffff" opacity="0.9"/>
        <rect x="18" y="4" width="10" height="10" rx="2" fill="#ffffff" opacity="0.6"/>
        <rect x="4" y="18" width="10" height="10" rx="2" fill="#ffffff" opacity="0.4"/>
        <rect x="18" y="18" width="10" height="10" rx="2" fill="#ffffff" opacity="0.8"/>
      </svg>
      <span class="nav-title">PIXORA X</span>
      <span class="nav-badge">WebGPU ⚡</span>
    </div>
    <div class="nav-links">
      <a href="https://github.com/anilchowdary07/PIXORA_X" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">
        <span>⭐ GitHub</span>
      </a>
    </div>
  `;
  landing.appendChild(nav);

  // Hero section
  const hero = document.createElement('div');
  hero.className = 'landing-hero';

  const pill = document.createElement('div');
  pill.className = 'hero-pill';
  pill.innerHTML = '<span class="pill-dot"></span> Next-Gen In-Browser Pixel Reconstruction';

  const logo = document.createElement('h1');
  logo.className = 'landing-logo';
  logo.textContent = 'PIXORA X';

  const subtitle = document.createElement('p');
  subtitle.className = 'landing-subtitle';
  subtitle.textContent =
    'Reconstruct any target photograph using exclusively the pixels from a source photograph. Watch millions of particles transform in real-time through hardware-accelerated GPU simulation.';

  hero.append(pill, logo, subtitle);

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

  // Showcase section
  const showcaseSection = document.createElement('div');
  showcaseSection.className = 'showcase-section';

  const showcaseTitle = document.createElement('div');
  showcaseTitle.className = 'section-title';
  showcaseTitle.innerHTML = '<span>Or Try Interactive Showcases</span>';

  const showcaseGrid = document.createElement('div');
  showcaseGrid.className = 'showcase-grid';

  for (const sc of SHOWCASES) {
    const card = document.createElement('div');
    card.className = 'showcase-card';

    const swatches = document.createElement('div');
    swatches.className = 'showcase-swatches';
    swatches.innerHTML = `
      <div class="swatch-wrap">
        <div class="swatch-box" style="background: ${sc.sourcePreview};"></div>
        <span class="swatch-label">Source</span>
      </div>
      <div class="swatch-arrow">➔</div>
      <div class="swatch-wrap">
        <div class="swatch-box" style="background: ${sc.targetPreview};"></div>
        <span class="swatch-label">Target</span>
      </div>
    `;

    const titleEl = document.createElement('div');
    titleEl.className = 'showcase-card-title';
    titleEl.textContent = sc.title;

    const btn = createButton('Load Showcase ⚡', 'secondary', () => {
      onShowcaseSelect(sc);
    });
    btn.classList.add('btn-sm');

    card.append(swatches, titleEl, btn);
    showcaseGrid.appendChild(card);
  }

  showcaseSection.append(showcaseTitle, showcaseGrid);

  // How it works
  const howItWorks = document.createElement('div');
  howItWorks.className = 'how-it-works';
  howItWorks.innerHTML = `
    <div class="section-title"><span>How PIXORA X Works</span></div>
    <div class="steps-grid">
      <div class="step-card">
        <div class="step-number">01</div>
        <div class="step-title">Strict Pixel Provenance</div>
        <div class="step-desc">Every pixel in the output is sourced 1:1 from your original photo. Zero AI hallucinations, zero invented pixels.</div>
      </div>
      <div class="step-card">
        <div class="step-number">02</div>
        <div class="step-title">AI Subject Saliency</div>
        <div class="step-desc">In-browser background-prior segmentation ensures subject pixels preserve the focal subject rather than background.</div>
      </div>
      <div class="step-card">
        <div class="step-number">03</div>
        <div class="step-title">WebGPU Particle Storm</div>
        <div class="step-desc">Compute & vertex shaders simulate up to millions of particles fluidly at 60+ FPS on your GPU.</div>
      </div>
    </div>
  `;

  // Feature pills footer
  const features = document.createElement('div');
  features.className = 'landing-features';

  const featureList = [
    'WebGPU & WebGL Accelerated',
    'Strict 1:1 Pixel Provenance',
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

  landing.append(hero, uploadRow, showcaseSection, howItWorks, features);

  return landing;
}
