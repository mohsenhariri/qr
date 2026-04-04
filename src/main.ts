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

const DEFAULT_STATE: AppState = {
  background: "#f7f1e6",
  border: 4,
  content: PRESETS.url,
  errorCorrection: "medium",
  foreground: "#103529",
  logoDataUrl: null,
  logoName: null,
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
  clearLogo: getElement<HTMLButtonElement>("#clear-logo", "clear logo button"),
  contentInput: getElement<HTMLTextAreaElement>("#content-input", "content input"),
  downloadPng: getElement<HTMLButtonElement>("#download-png", "download PNG button"),
  downloadSvg: getElement<HTMLButtonElement>("#download-svg", "download SVG button"),
  eccSelect: getElement<HTMLSelectElement>("#ecc-select", "error correction select"),
  engineStatus: getElement<HTMLElement>("#engine-status", "engine status"),
  errorCopy: getElement<HTMLElement>("#error-copy", "error message"),
  foregroundInput: getElement<HTMLInputElement>("#foreground-input", "foreground input"),
  logoInput: getElement<HTMLInputElement>("#logo-input", "logo input"),
  logoPreviewImage: getElement<HTMLImageElement>("#logo-preview-image", "logo preview image"),
  logoPreviewShell: getElement<HTMLElement>("#logo-preview-shell", "logo preview shell"),
  logoStatus: getElement<HTMLElement>("#logo-status", "logo status"),
  preview: getElement<HTMLElement>("#qr-preview", "preview"),
  previewShell: getElement<HTMLElement>("#preview-shell", "preview shell"),
  presetButtons: Array.from(document.querySelectorAll<HTMLButtonElement>(".preset-button")),
  scaleRange: getElement<HTMLInputElement>("#scale-range", "scale range"),
  scaleValue: getElement<HTMLOutputElement>("#scale-value", "scale value"),
  statDark: getElement<HTMLElement>("#stat-dark", "dark modules stat"),
  statLength: getElement<HTMLElement>("#stat-length", "length stat"),
  statSize: getElement<HTMLElement>("#stat-size", "matrix size stat"),
  statVersion: getElement<HTMLElement>("#stat-version", "version stat"),
  transparentToggle: getElement<HTMLInputElement>("#transparent-toggle", "transparent toggle"),
};

let appState: AppState = { ...DEFAULT_STATE };
let lastResult: QrResult | null = null;
let pendingFrame = 0;

async function bootstrap() {
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
  elements.scaleRange.value = String(state.scale);
  elements.foregroundInput.value = state.foreground;
  elements.backgroundInput.value = state.background;
  elements.transparentToggle.checked = state.transparent;
  elements.borderValue.textContent = `${state.border} modules`;
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
  elements.logoPreviewImage.hidden = !hasLogo;
  elements.logoPreviewImage.src = appState.logoDataUrl ?? "";
  elements.logoStatus.textContent = hasLogo
    ? `${appState.logoName ?? "Logo"} is centered with High error correction locked for scan reliability.`
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

  const layout = getLogoLayout(matrixSize, state.border, 1);
  const patchFill = state.transparent ? "#ffffff" : state.background;

  return [
    `<rect x="${layout.boxX}" y="${layout.boxY}" width="${layout.boxSize}" height="${layout.boxSize}" rx="${layout.cornerRadius}" fill="${patchFill}" />`,
    `<image href="${state.logoDataUrl}" x="${layout.imageX}" y="${layout.imageY}" width="${layout.imageSize}" height="${layout.imageSize}" preserveAspectRatio="xMidYMid meet" />`,
  ].join("");
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
  const layout = getLogoLayout(matrixSize, state.border, state.scale);

  context.fillStyle = state.transparent ? "#ffffff" : state.background;
  fillRoundedRect(
    context,
    layout.boxX,
    layout.boxY,
    layout.boxSize,
    layout.boxSize,
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

function getLogoLayout(matrixSize: number, border: number, unit: number) {
  const paddedQrSize = matrixSize * unit;
  const offset = border * unit;
  const boxSize = paddedQrSize * 0.18;
  const imageSize = paddedQrSize * 0.11;
  const boxX = offset + (paddedQrSize - boxSize) / 2;
  const boxY = offset + (paddedQrSize - boxSize) / 2;
  const imageX = offset + (paddedQrSize - imageSize) / 2;
  const imageY = offset + (paddedQrSize - imageSize) / 2;

  return {
    boxSize,
    boxX,
    boxY,
    cornerRadius: boxSize * 0.18,
    imageSize,
    imageX,
    imageY,
  };
}

function clearLogo() {
  appState.logoDataUrl = null;
  appState.logoName = null;
  elements.logoInput.value = "";
  syncLogoUi();
}

function readFileAsDataUrl(file: File): Promise<string> {
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
