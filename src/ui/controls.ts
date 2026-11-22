// ============================================================
// Pixel Mosaic X — UI Controls (Pure Vanilla TS)
// ============================================================

/**
 * Create a styled slider control.
 */
export function createSlider(
  label: string,
  min: number,
  max: number,
  value: number,
  step: number,
  onChange: (v: number) => void
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'control-group';

  const lbl = document.createElement('span');
  lbl.className = 'control-label';
  lbl.textContent = label;

  const sliderWrap = document.createElement('div');
  sliderWrap.className = 'slider-wrap';

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);

  const valDisplay = document.createElement('span');
  valDisplay.className = 'slider-value';
  valDisplay.textContent = String(value);

  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    valDisplay.textContent = step >= 1 ? String(Math.round(v)) : v.toFixed(1);
    onChange(v);
  });

  sliderWrap.append(input, valDisplay);
  wrap.append(lbl, sliderWrap);
  return wrap;
}

/**
 * Create a styled select dropdown.
 */
export function createSelect(
  label: string,
  options: { value: string; label: string }[],
  selected: string,
  onChange: (v: string) => void
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'control-group';

  const lbl = document.createElement('span');
  lbl.className = 'control-label';
  lbl.textContent = label;

  const selectWrap = document.createElement('div');
  selectWrap.className = 'select-wrap';

  const sel = document.createElement('select');
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    if (opt.value === selected) o.selected = true;
    sel.appendChild(o);
  }

  sel.addEventListener('change', () => onChange(sel.value));

  selectWrap.appendChild(sel);
  wrap.append(lbl, selectWrap);
  return wrap;
}

/**
 * Create a styled button.
 */
export function createButton(
  text: string,
  variant: 'primary' | 'secondary' | 'ghost' = 'secondary',
  onClick: () => void,
  icon?: string
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = `btn btn-${variant}`;
  if (icon) {
    btn.innerHTML = `<span>${icon}</span> ${text}`;
  } else {
    btn.textContent = text;
  }
  btn.addEventListener('click', onClick);
  return btn;
}

/**
 * Create a progress bar.
 */
export function createProgressBar(): {
  element: HTMLElement;
  update: (progress: number, label?: string) => void;
} {
  const wrap = document.createElement('div');
  wrap.className = 'progress-bar-wrap';

  const fill = document.createElement('div');
  fill.className = 'progress-bar-fill';
  wrap.appendChild(fill);

  return {
    element: wrap,
    update: (progress: number) => {
      fill.style.width = `${Math.round(progress * 100)}%`;
    },
  };
}

/**
 * Create an image drop zone.
 */
export function createDropZone(
  label: string,
  description: string,
  onFile: (file: File) => void
): HTMLElement {
  const zone = document.createElement('div');
  zone.className = 'drop-zone';

  const icon = document.createElement('div');
  icon.className = 'drop-zone-icon';
  icon.textContent = label === 'SOURCE IMAGE' ? '🎨' : '🖼️';

  const lbl = document.createElement('div');
  lbl.className = 'drop-zone-label';
  lbl.textContent = label;

  const desc = document.createElement('div');
  desc.className = 'drop-zone-desc';
  desc.textContent = description;

  const hint = document.createElement('div');
  hint.className = 'drop-zone-hint';
  hint.textContent = 'Click or drag & drop';

  zone.append(icon, lbl, desc, hint);

  // Hidden file input
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
      handleFile(fileInput.files[0]);
    }
  });

  zone.appendChild(fileInput);

  zone.addEventListener('click', () => fileInput.click());

  // Drag and drop
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
  });

  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer?.files[0];
    if (file && file.type.startsWith('image/')) {
      handleFile(file);
    }
  });

  function handleFile(file: File) {
    zone.classList.add('has-image');

    // Show preview
    const existing = zone.querySelector('.drop-zone-preview');
    if (existing) existing.remove();

    const preview = document.createElement('img');
    preview.className = 'drop-zone-preview';
    preview.src = URL.createObjectURL(file);
    zone.appendChild(preview);

    // Update label
    lbl.textContent = `✓ ${file.name.slice(0, 20)}`;
    desc.textContent = `${(file.size / 1024).toFixed(0)} KB`;

    onFile(file);
  }

  return zone;
}

/**
 * Create a small image preview.
 */
export function createImagePreview(canvas: HTMLCanvasElement, label: string): HTMLElement {
  const wrap = document.createElement('div');

  const lbl = document.createElement('div');
  lbl.className = 'preview-label';
  lbl.textContent = label;

  const img = document.createElement('img');
  img.className = 'preview-img';
  img.src = canvas.toDataURL();

  const info = document.createElement('div');
  info.className = 'preview-info';
  info.textContent = `${canvas.width}×${canvas.height}`;

  wrap.append(lbl, img, info);
  return wrap;
}
