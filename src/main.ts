import "./style.css";
import init, { generate_qr } from "./wasm/pkg/qr_engine.js";

type ErrorCorrection = "low" | "medium" | "quartile" | "high";

type AppState = {
  background: string;
  border: number;
  content: string;
  errorCorrection: ErrorCorrection;
  foreground: string;
  logoDataUrl: string | null;
  logoName: string | null;
  logoPaddingX: number;
  logoPaddingY: number;
  logoPresetId: string | null;
  logoSize: number;
  scale: number;
  transparent: boolean;
};

type QrResult = {
  darkModules: number;
  modules: Uint8Array;
  size: number;
  svg: string;
  version: number;
};

type LogoPaddingDrag = {
  matrixPixelHeight: number;
  matrixPixelWidth: number;
  startPaddingX: number;
  startPaddingY: number;
  startX: number;
  startY: number;
};

type PresetLogo = {
  id: string;
  label: string;
  source: string;
};

const LOGO_PADDING_MAX = 8;
const LOGO_PADDING_MIN = 0;
const LOGO_PADDING_STEP = 0.5;

const PRESETS: Record<string, string> = {
  contact: [
    "BEGIN:VCARD",
    "VERSION:3.0",
    "N:Rivera;Avery;;;",
    "FN:Avery Rivera",
    "ORG:Vector QR Studio",
    "TITLE:Creative Technologist",
    "TEL:+1-555-010-2026",
    "EMAIL:avery@vectorqr.example",
    "URL:https://vectorqr.example",
    "END:VCARD",
  ].join("\n"),
  url: "https://mohsenhariri.github.io/qr",
  wifi: "WIFI:T:WPA;S:Studio Guest;P:design-lab-2026;;",
};

const CONTACT_EMAIL = "mxh1029@case.edu";
const CAPTCHA_COLORS = ["#1a1a1a", "#2a2a2a", "#0a0a0a", "#333333"];

const PRESET_LOGOS: PresetLogo[] = [
  {
    id: "github",
    label: "GitHub",
    source: new URL("../assets/logo/github.svg", import.meta.url).href,
  },
  {
    id: "arxiv",
    label: "arXiv",
    source: new URL("../assets/logo/arxiv.svg", import.meta.url).href,
  },
  {
    id: "pypi",
    label: "PyPI",
    source: new URL("../assets/logo/pypi.svg", import.meta.url).href,
  },
  {
    id: "qwen",
    label: "Qwen",
    source: new URL("../assets/logo/qwen.svg", import.meta.url).href,
  },
  { id: "acl", label: "ACL", source: new URL("../assets/logo/acl.svg", import.meta.url).href },
  {
    id: "rtd",
    label: "Docs",
    source: new URL("../assets/logo/rtd.svg", import.meta.url).href,
  },
  {
    id: "scorio",
    label: "Scorio",
    source: new URL("../assets/logo/scorio.svg", import.meta.url).href,
  },
];

const DEFAULT_STATE: AppState = {
  background: "#f7f1e6",
  border: 4,
  content: PRESETS.url,
  errorCorrection: "medium",
  foreground: "#103529",
  logoDataUrl: null,
  logoName: null,
  logoPaddingX: 3.5,
  logoPaddingY: 3.5,
  logoPresetId: null,
  logoSize: 11,
  scale: 12,
  transparent: false,
};

function getElement<T extends Element>(selector: string, label: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required DOM element: ${label}`);
  }

  return element;
}

const elements = {
  backgroundInput: getElement<HTMLInputElement>("#background-input", "background input"),
  borderRange: getElement<HTMLInputElement>("#border-range", "border range"),
  borderValue: getElement<HTMLOutputElement>("#border-value", "border value"),
  captchaClose: getElement<HTMLButtonElement>("#captcha-close", "email modal close button"),
  captchaText: getElement<HTMLElement>("#captcha-text", "captcha text"),
  clearLogo: getElement<HTMLButtonElement>("#clear-logo", "clear logo button"),
  contentInput: getElement<HTMLTextAreaElement>("#content-input", "content input"),
  downloadPng: getElement<HTMLButtonElement>("#download-png", "download PNG button"),
  downloadSvg: getElement<HTMLButtonElement>("#download-svg", "download SVG button"),
  eccSelect: getElement<HTMLSelectElement>("#ecc-select", "error correction select"),
  emailModal: getElement<HTMLElement>("#email-modal", "email modal"),
  emailRevealBtn: getElement<HTMLButtonElement>("#email-reveal-btn", "email reveal button"),
  engineStatus: getElement<HTMLElement>("#engine-status", "engine status"),
  errorCopy: getElement<HTMLElement>("#error-copy", "error message"),
  footerYear: getElement<HTMLElement>("#footer-year", "footer year"),
  foregroundInput: getElement<HTMLInputElement>("#foreground-input", "foreground input"),
  logoInput: getElement<HTMLInputElement>("#logo-input", "logo input"),
  logoPaddingXRange: getElement<HTMLInputElement>(
    "#logo-padding-x-range",
    "logo padding width range",
  ),
  logoPaddingXValue: getElement<HTMLOutputElement>(
    "#logo-padding-x-value",
    "logo padding width value",
  ),
  logoPaddingYRange: getElement<HTMLInputElement>(
    "#logo-padding-y-range",
    "logo padding height range",
  ),
  logoPaddingYValue: getElement<HTMLOutputElement>(
    "#logo-padding-y-value",
    "logo padding height value",
  ),
  logoPreviewImage: getElement<HTMLImageElement>("#logo-preview-image", "logo preview image"),
  logoPreviewShell: getElement<HTMLElement>("#logo-preview-shell", "logo preview shell"),
  logoPresetGrid: getElement<HTMLElement>("#logo-preset-grid", "built-in logo choices"),
  logoSizeRange: getElement<HTMLInputElement>("#logo-size-range", "logo size range"),
  logoSizeValue: getElement<HTMLOutputElement>("#logo-size-value", "logo size value"),
  logoStatus: getElement<HTMLElement>("#logo-status", "logo status"),
  logoTuneFields: Array.from(
    document.querySelectorAll<HTMLElement>(".logo-size-field, .logo-padding-field"),
  ),
  noiseCanvas: getElement<HTMLCanvasElement>("#noise-canvas", "captcha noise canvas"),
  preview: getElement<HTMLElement>("#qr-preview", "preview"),
  previewShell: getElement<HTMLElement>("#preview-shell", "preview shell"),
  presetButtons: Array.from(document.querySelectorAll<HTMLButtonElement>(".preset-button")),
  refreshCaptcha: getElement<HTMLButtonElement>("#refresh-captcha", "refresh captcha button"),
  scaleRange: getElement<HTMLInputElement>("#scale-range", "scale range"),
  scaleValue: getElement<HTMLOutputElement>("#scale-value", "scale value"),
  statDark: getElement<HTMLElement>("#stat-dark", "dark modules stat"),
  statLength: getElement<HTMLElement>("#stat-length", "length stat"),
  statSize: getElement<HTMLElement>("#stat-size", "matrix size stat"),
  statVersion: getElement<HTMLElement>("#stat-version", "version stat"),
  transparentToggle: getElement<HTMLInputElement>("#transparent-toggle", "transparent toggle"),
};

let appState: AppState = { ...DEFAULT_STATE };
let lastFocusedElement: Element | null = null;
let lastResult: QrResult | null = null;
let logoPaddingDrag: LogoPaddingDrag | null = null;
let logoPresetLoadId = 0;
let pendingFrame = 0;

async function bootstrap() {
  renderPresetLogoButtons();
  hydrateControls(appState);
  setDownloadsEnabled(false);

  try {
    await init();
    setEngineStatus("Engine ready", true);
    scheduleRender();
  } catch (error) {
    setEngineStatus("Engine failed", false);
    showError(getErrorMessage(error));
  }

  bindEvents();
}

function bindEvents() {
  bindFooterEvents();

  elements.contentInput.addEventListener("input", () => {
    appState.content = elements.contentInput.value;
    scheduleRender();
  });

  elements.eccSelect.addEventListener("change", () => {
    const nextValue = elements.eccSelect.value as ErrorCorrection;

    if (appState.logoDataUrl && nextValue !== "high") {
      appState.errorCorrection = "high";
      elements.eccSelect.value = "high";
      syncLogoUi();
      scheduleRender();
      return;
    }

    appState.errorCorrection = nextValue;
    syncLogoUi();
    scheduleRender();
  });

  elements.borderRange.addEventListener("input", () => {
    appState.border = Number(elements.borderRange.value);
    elements.borderValue.textContent = `${appState.border} modules`;
    scheduleRender();
  });

  elements.scaleRange.addEventListener("input", () => {
    appState.scale = Number(elements.scaleRange.value);
    elements.scaleValue.textContent = `${appState.scale} px/module`;
    scheduleRender();
  });

  elements.foregroundInput.addEventListener("input", () => {
    appState.foreground = elements.foregroundInput.value;
    scheduleRender();
  });

  elements.logoInput.addEventListener("change", async () => {
    const file = elements.logoInput.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      showError("Choose a PNG, JPEG, WebP, or SVG image for the center logo.");
      elements.logoInput.value = "";
      return;
    }

    try {
      appState.logoDataUrl = await readFileAsDataUrl(file);
      appState.logoName = file.name;
      appState.logoPresetId = null;
      appState.errorCorrection = "high";
      elements.eccSelect.value = "high";
      elements.logoInput.value = "";
      syncLogoUi();
      showError("");
      scheduleRender();
    } catch {
      showError("The selected logo could not be read in the browser.");
      clearLogo();
    }
  });

  elements.logoSizeRange.addEventListener("input", () => {
    appState.logoSize = Number(elements.logoSizeRange.value);
    elements.logoSizeValue.textContent = formatPercent(appState.logoSize);
    syncLogoUi();
    scheduleRender();
  });

  elements.logoPaddingXRange.addEventListener("input", () => {
    setLogoPadding({ x: Number(elements.logoPaddingXRange.value) });
    scheduleRender();
  });

  elements.logoPaddingYRange.addEventListener("input", () => {
    setLogoPadding({ y: Number(elements.logoPaddingYRange.value) });
    scheduleRender();
  });

  elements.backgroundInput.addEventListener("input", () => {
    appState.background = elements.backgroundInput.value;
    scheduleRender();
  });

  elements.clearLogo.addEventListener("click", () => {
    clearLogo();
    showError("");
    scheduleRender();
  });

  elements.transparentToggle.addEventListener("change", () => {
    appState.transparent = elements.transparentToggle.checked;
    scheduleRender();
  });

  elements.downloadSvg.addEventListener("click", () => {
    if (!lastResult) {
      return;
    }

    downloadBlob(
      new Blob([lastResult.svg], { type: "image/svg+xml;charset=utf-8" }),
      `${createFilename(appState.content)}.svg`,
    );
  });

  elements.downloadPng.addEventListener("click", async () => {
    if (!lastResult) {
      return;
    }

    const blob = await renderPngBlob(lastResult);
    if (!blob) {
      showError("Unable to export PNG from the current browser context.");
      return;
    }

    downloadBlob(blob, `${createFilename(appState.content)}.png`);
  });

  for (const button of elements.presetButtons) {
    button.addEventListener("click", () => {
      const preset = button.dataset.preset ?? "";
      const value = PRESETS[preset];

      if (!value) {
        return;
      }

      appState.content = value;
      elements.contentInput.value = value;
      scheduleRender();
    });
  }
}

function renderPresetLogoButtons() {
  elements.logoPresetGrid.replaceChildren(
    ...PRESET_LOGOS.map((logo) => {
      const button = document.createElement("button");
      const image = document.createElement("img");
      const label = document.createElement("span");

      button.className = "logo-preset-button";
      button.dataset.logoPreset = logo.id;
      button.type = "button";
      button.setAttribute("aria-label", `Use ${logo.label} logo`);
      button.title = `Use ${logo.label} logo`;
      button.setAttribute("aria-pressed", "false");

      image.alt = "";
      image.decoding = "async";
      image.loading = "lazy";
      image.src = logo.source;

      label.textContent = logo.label;

      button.append(image, label);
      button.addEventListener("click", () => {
        void selectPresetLogo(logo);
      });

      return button;
    }),
  );
}

async function selectPresetLogo(logo: PresetLogo) {
  const requestId = logoPresetLoadId + 1;
  logoPresetLoadId = requestId;

  try {
    const response = await fetch(logo.source);

    if (!response.ok) {
      throw new Error(`Logo request failed with ${response.status}.`);
    }

    const dataUrl = await readFileAsDataUrl(await response.blob());

    if (requestId !== logoPresetLoadId) {
      return;
    }

    appState.logoDataUrl = dataUrl;
    appState.logoName = logo.label;
    appState.logoPresetId = logo.id;
    appState.errorCorrection = "high";
    elements.eccSelect.value = "high";
    elements.logoInput.value = "";
    syncLogoUi();
    showError("");
    scheduleRender();
  } catch {
    showError(`The ${logo.label} logo could not be loaded.`);
  }
}

function bindFooterEvents() {
  elements.footerYear.textContent = String(new Date().getFullYear());

  elements.emailRevealBtn.addEventListener("click", () => {
    openEmailModal();
  });

  elements.refreshCaptcha.addEventListener("click", () => {
    generateCaptcha();
  });

  elements.captchaClose.addEventListener("click", () => {
    closeEmailModal();
  });

  elements.emailModal.addEventListener("click", (event) => {
    if (event.target === elements.emailModal) {
      closeEmailModal();
    }
  });

  elements.emailModal.addEventListener("keydown", handleEmailModalKeydown);
}

function openEmailModal() {
  lastFocusedElement = document.activeElement;
  elements.emailModal.hidden = false;
  elements.emailModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  generateCaptcha();

  requestAnimationFrame(() => {
    elements.captchaClose.focus();
  });
}

function closeEmailModal() {
  elements.emailModal.hidden = true;
  elements.emailModal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";

  if (lastFocusedElement instanceof HTMLElement) {
    lastFocusedElement.focus();
  }
}

function handleEmailModalKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    closeEmailModal();
    return;
  }

  if (event.key !== "Tab") {
    return;
  }

  const focusableElements = Array.from(
    elements.emailModal.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hidden && element.offsetParent !== null);

  if (focusableElements.length === 0) {
    event.preventDefault();
    return;
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
  } else if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }
}

function generateCaptcha() {
  elements.captchaText.replaceChildren(
    ...CONTACT_EMAIL.split("").map((character) => {
      const span = document.createElement("span");
      const rotate = randomBetween(-12.5, 12.5);
      const skewX = randomBetween(-10, 10);
      const skewY = randomBetween(-7.5, 7.5);
      const scaleY = randomBetween(0.9, 1.2);
      const translateY = randomBetween(-4, 4);
      const fontSize = Math.round(randomBetween(30, 38));
      const color = CAPTCHA_COLORS[Math.floor(Math.random() * CAPTCHA_COLORS.length)];

      span.textContent = character;
      span.style.color = color;
      span.style.display = "inline-block";
      span.style.fontFamily = "'Times New Roman', Georgia, serif";
      span.style.fontSize = `${fontSize}px`;
      span.style.fontWeight = "700";
      span.style.letterSpacing = "1px";
      span.style.margin = "0 1px";
      span.style.textShadow =
        "1px 1px 0 rgba(0,0,0,0.1), -1px -1px 0 rgba(255,255,255,0.3), 2px 2px 3px rgba(0,0,0,0.05)";
      span.style.transform = `rotate(${rotate}deg) skewX(${skewX}deg) skewY(${skewY}deg) scaleY(${scaleY}) translateY(${translateY}px)`;

      return span;
    }),
  );

  generateNoise();
}

function generateNoise() {
  const context = elements.noiseCanvas.getContext("2d");

  if (!context) {
    return;
  }

  const imageData = context.createImageData(elements.noiseCanvas.width, elements.noiseCanvas.height);
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const noise = Math.random() * 255;
    data[index] = noise;
    data[index + 1] = noise;
    data[index + 2] = noise;
    data[index + 3] = 255;
  }

  context.putImageData(imageData, 0, 0);
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function scheduleRender() {
  if (pendingFrame) {
    cancelAnimationFrame(pendingFrame);
  }

  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = 0;
    render();
  });
}

function render() {
  updateLengthStat(appState.content);

  try {
    const result = generate_qr(appState.content, appState.errorCorrection);
    const modules = result.modules();
    const size = result.size;
    const darkModules = countDarkModules(modules);
    const version = Math.trunc((size - 17) / 4);
    const svg = buildSvg(modules, size, appState);

    lastResult = {
      darkModules,
      modules,
      size,
      svg,
      version,
    };

    showError("");
    setDownloadsEnabled(true);
    elements.preview.innerHTML = svg;
    bindLogoPreviewEditor();
    elements.previewShell.dataset.ready = "true";
    elements.statVersion.textContent = String(version);
    elements.statSize.textContent = `${size} × ${size}`;
    elements.statDark.textContent = darkModules.toLocaleString();
  } catch (error) {
    lastResult = null;
    elements.previewShell.dataset.ready = "false";
    elements.preview.innerHTML = `<p class="placeholder-copy">Adjust the content or error correction level and try again.</p>`;
    elements.statVersion.textContent = "-";
    elements.statSize.textContent = "-";
    elements.statDark.textContent = "-";
    setDownloadsEnabled(false);
    showError(getErrorMessage(error));
  }
}

function buildSvg(modules: Uint8Array, size: number, state: AppState): string {
  const totalSize = size + state.border * 2;
  let pathData = "";

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (modules[y * size + x] === 1) {
        const drawX = x + state.border;
        const drawY = y + state.border;
        pathData += `M${drawX} ${drawY}h1v1H${drawX}z`;
      }
    }
  }

  const background = state.transparent
    ? ""
    : `<rect width="${totalSize}" height="${totalSize}" fill="${state.background}" />`;
  const logo = buildLogoSvg(size, state);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" role="img" aria-label="Generated QR code">`,
    background,
    `<path fill="${state.foreground}" d="${pathData}" />`,
    logo,
    "</svg>",
  ].join("");
}

async function renderPngBlob(result: QrResult): Promise<Blob | null> {
  const totalSize = result.size + appState.border * 2;
  const dimension = totalSize * appState.scale;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  canvas.width = dimension;
  canvas.height = dimension;

  if (!appState.transparent) {
    context.fillStyle = appState.background;
    context.fillRect(0, 0, dimension, dimension);
  } else {
    context.clearRect(0, 0, dimension, dimension);
  }

  context.fillStyle = appState.foreground;

  for (let y = 0; y < result.size; y += 1) {
    for (let x = 0; x < result.size; x += 1) {
      if (result.modules[y * result.size + x] === 1) {
        const drawX = (x + appState.border) * appState.scale;
        const drawY = (y + appState.border) * appState.scale;
        context.fillRect(drawX, drawY, appState.scale, appState.scale);
      }
    }
  }

  if (appState.logoDataUrl) {
    try {
      await drawLogoOnCanvas(context, result.size, appState);
    } catch {
      return null;
    }
  }

  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

function hydrateControls(state: AppState) {
  elements.contentInput.value = state.content;
  elements.eccSelect.value = state.errorCorrection;
  elements.borderRange.value = String(state.border);
  elements.logoPaddingXRange.value = String(state.logoPaddingX);
  elements.logoPaddingYRange.value = String(state.logoPaddingY);
  elements.logoSizeRange.value = String(state.logoSize);
  elements.scaleRange.value = String(state.scale);
  elements.foregroundInput.value = state.foreground;
  elements.backgroundInput.value = state.background;
  elements.transparentToggle.checked = state.transparent;
  elements.borderValue.textContent = `${state.border} modules`;
  elements.logoPaddingXValue.textContent = formatPercent(state.logoPaddingX);
  elements.logoPaddingYValue.textContent = formatPercent(state.logoPaddingY);
  elements.logoSizeValue.textContent = formatPercent(state.logoSize);
  elements.scaleValue.textContent = `${state.scale} px/module`;
  syncLogoUi();
  updateLengthStat(state.content);
}

function setEngineStatus(message: string, ready: boolean) {
  elements.engineStatus.textContent = message;
  elements.engineStatus.dataset.ready = ready ? "true" : "false";
}

function setDownloadsEnabled(enabled: boolean) {
  elements.downloadSvg.disabled = !enabled;
  elements.downloadPng.disabled = !enabled;
}

function showError(message: string) {
  elements.errorCopy.textContent = message;
}

function updateLengthStat(content: string) {
  elements.statLength.textContent = String(content.trim().length);
}

function syncLogoUi() {
  const hasLogo = Boolean(appState.logoDataUrl);

  elements.logoPreviewShell.dataset.empty = hasLogo ? "false" : "true";
  elements.clearLogo.disabled = !hasLogo;
  for (const field of elements.logoTuneFields) {
    field.hidden = !hasLogo;
  }
  for (const button of elements.logoPresetGrid.querySelectorAll<HTMLButtonElement>(
    ".logo-preset-button",
  )) {
    button.setAttribute(
      "aria-pressed",
      button.dataset.logoPreset === appState.logoPresetId ? "true" : "false",
    );
  }
  elements.logoPreviewImage.hidden = !hasLogo;
  elements.logoPreviewImage.src = appState.logoDataUrl ?? "";
  elements.logoStatus.textContent = hasLogo
    ? `${appState.logoName ?? "Logo"} is centered at ${formatPercent(appState.logoSize)} with ${formatPercent(appState.logoPaddingX)} × ${formatPercent(appState.logoPaddingY)} padding.`
    : "No logo selected.";
}

function countDarkModules(modules: Uint8Array): number {
  let total = 0;

  for (const value of modules) {
    total += value;
  }

  return total;
}

function createFilename(content: string): string {
  const cleaned = content
    .trim()
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return cleaned || "qr-code";
}

function buildLogoSvg(matrixSize: number, state: AppState): string {
  if (!state.logoDataUrl) {
    return "";
  }

  const layout = getLogoLayout(
    matrixSize,
    state.border,
    1,
    state.logoSize,
    state.logoPaddingX,
    state.logoPaddingY,
  );
  const patchFill = state.transparent ? "#ffffff" : state.background;

  return [
    `<g class="qr-logo-layer" data-logo-editor="padding">`,
    `<rect x="${layout.boxX}" y="${layout.boxY}" width="${layout.boxWidth}" height="${layout.boxHeight}" rx="${layout.cornerRadius}" fill="${patchFill}" />`,
    `<image href="${state.logoDataUrl}" x="${layout.imageX}" y="${layout.imageY}" width="${layout.imageSize}" height="${layout.imageSize}" preserveAspectRatio="xMidYMid meet" />`,
    `</g>`,
  ].join("");
}

function bindLogoPreviewEditor() {
  const svg = elements.preview.querySelector<SVGSVGElement>("svg");
  const logoLayer = elements.preview.querySelector<SVGGElement>("[data-logo-editor='padding']");
  const renderedResult = lastResult;

  if (!svg || !logoLayer || !renderedResult) {
    return;
  }

  logoLayer.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }

    const svgBounds = svg.getBoundingClientRect();
    const totalSize = renderedResult.size + appState.border * 2;
    const matrixPixelWidth = svgBounds.width * (renderedResult.size / totalSize);
    const matrixPixelHeight = svgBounds.height * (renderedResult.size / totalSize);

    if (matrixPixelWidth <= 0 || matrixPixelHeight <= 0) {
      return;
    }

    event.preventDefault();
    logoPaddingDrag = {
      matrixPixelHeight,
      matrixPixelWidth,
      startPaddingX: appState.logoPaddingX,
      startPaddingY: appState.logoPaddingY,
      startX: event.clientX,
      startY: event.clientY,
    };
    document.documentElement.dataset.logoPaddingDrag = "true";

    document.addEventListener("pointermove", handleLogoPaddingDrag);
    document.addEventListener("pointerup", stopLogoPaddingDrag, { once: true });
    document.addEventListener("pointercancel", stopLogoPaddingDrag, { once: true });
  });
}

function handleLogoPaddingDrag(event: PointerEvent) {
  if (!logoPaddingDrag) {
    return;
  }

  const deltaXPercent =
    ((event.clientX - logoPaddingDrag.startX) / logoPaddingDrag.matrixPixelWidth) * 100;
  const deltaYPercent =
    ((event.clientY - logoPaddingDrag.startY) / logoPaddingDrag.matrixPixelHeight) * 100;

  setLogoPadding({
    x: logoPaddingDrag.startPaddingX + deltaXPercent,
    y: logoPaddingDrag.startPaddingY + deltaYPercent,
  });
  scheduleRender();
}

function stopLogoPaddingDrag() {
  logoPaddingDrag = null;
  delete document.documentElement.dataset.logoPaddingDrag;
  document.removeEventListener("pointermove", handleLogoPaddingDrag);
  document.removeEventListener("pointerup", stopLogoPaddingDrag);
  document.removeEventListener("pointercancel", stopLogoPaddingDrag);
}

async function drawLogoOnCanvas(
  context: CanvasRenderingContext2D,
  matrixSize: number,
  state: AppState,
) {
  if (!state.logoDataUrl) {
    return;
  }

  const logo = await loadImage(state.logoDataUrl);
  const layout = getLogoLayout(
    matrixSize,
    state.border,
    state.scale,
    state.logoSize,
    state.logoPaddingX,
    state.logoPaddingY,
  );

  context.fillStyle = state.transparent ? "#ffffff" : state.background;
  fillRoundedRect(
    context,
    layout.boxX,
    layout.boxY,
    layout.boxWidth,
    layout.boxHeight,
    layout.cornerRadius,
  );

  drawImageContain(context, logo, layout.imageX, layout.imageY, layout.imageSize, layout.imageSize);
}

function drawImageContain(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const drawX = x + (width - drawWidth) / 2;
  const drawY = y + (height - drawHeight) / 2;

  context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

function fillRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
  context.fill();
}

function getLogoLayout(
  matrixSize: number,
  border: number,
  unit: number,
  logoSize: number,
  logoPaddingX: number,
  logoPaddingY: number,
) {
  const paddedQrSize = matrixSize * unit;
  const offset = border * unit;
  const imageSize = paddedQrSize * (logoSize / 100);
  const boxWidth = paddedQrSize * ((logoSize + logoPaddingX * 2) / 100);
  const boxHeight = paddedQrSize * ((logoSize + logoPaddingY * 2) / 100);
  const boxX = offset + (paddedQrSize - boxWidth) / 2;
  const boxY = offset + (paddedQrSize - boxHeight) / 2;
  const imageX = offset + (paddedQrSize - imageSize) / 2;
  const imageY = offset + (paddedQrSize - imageSize) / 2;

  return {
    boxHeight,
    boxWidth,
    boxX,
    boxY,
    cornerRadius: Math.min(boxWidth, boxHeight) * 0.18,
    imageSize,
    imageX,
    imageY,
  };
}

function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function setLogoPadding(next: { x?: number; y?: number }) {
  if (typeof next.x === "number") {
    appState.logoPaddingX = normalizeLogoPadding(next.x);
    elements.logoPaddingXRange.value = String(appState.logoPaddingX);
    elements.logoPaddingXValue.textContent = formatPercent(appState.logoPaddingX);
  }

  if (typeof next.y === "number") {
    appState.logoPaddingY = normalizeLogoPadding(next.y);
    elements.logoPaddingYRange.value = String(appState.logoPaddingY);
    elements.logoPaddingYValue.textContent = formatPercent(appState.logoPaddingY);
  }

  syncLogoUi();
}

function normalizeLogoPadding(value: number): number {
  return clamp(roundToStep(value, LOGO_PADDING_STEP), LOGO_PADDING_MIN, LOGO_PADDING_MAX);
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function clearLogo() {
  appState.logoDataUrl = null;
  appState.logoName = null;
  appState.logoPresetId = null;
  elements.logoInput.value = "";
  syncLogoUi();
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unexpected file reader result."));
    });

    reader.addEventListener("error", () => reject(reader.error ?? new Error("File read failed.")));
    reader.readAsDataURL(file);
  });
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", () => reject(new Error("Image load failed.")));
    image.src = source;
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "The QR engine could not generate a code for the current input.";
}
bootstrap();
