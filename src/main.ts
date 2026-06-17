import "./style.css";
import init, { generate_qr } from "./wasm/pkg/qr_engine.js";
import {
  buildSvg,
  buildUrlPayload,
  buildVCardPayload,
  buildWifiPayload,
  createFilename,
  getLogoLayout,
  getPixelDimension,
  PRESET_LOGOS as PRESET_LOGO_DEFS,
  type ErrorCorrection,
  type PayloadBuilders,
  type WifiEncryption,
} from "./qr-core";

type PayloadType = "contact" | "raw" | "url" | "wifi";

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
  payloadBuilders: PayloadBuilders;
  payloadType: PayloadType;
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

type ScanSafetyStatus = "good" | "notice" | "warning";

type ScanSafetyItem = {
  detail: string;
  label: string;
  status: ScanSafetyStatus;
};

type ShareableSettings = {
  background: string;
  border: number;
  content: string;
  errorCorrection: ErrorCorrection;
  foreground: string;
  logoPaddingX: number;
  logoPaddingY: number;
  logoPresetId: string | null;
  logoSize: number;
  payloadBuilders: PayloadBuilders;
  payloadType: PayloadType;
  scale: number;
  transparent: boolean;
};

type ConfigSettings = Pick<
  ShareableSettings,
  | "background"
  | "border"
  | "errorCorrection"
  | "foreground"
  | "logoPaddingX"
  | "logoPaddingY"
  | "logoPresetId"
  | "logoSize"
  | "scale"
  | "transparent"
>;

type ConfigEntry = ConfigSettings & {
  createdAt: number;
  id: string;
  label: string;
};

type HistoryEntry = ShareableSettings & {
  createdAt: number;
  id: string;
  label: string;
};

const LOGO_PADDING_STEP = 0.5;
const LOGO_PADDING_X_MAX = 8;
const LOGO_PADDING_X_MIN = 0;
const LOGO_PADDING_Y_MAX = 8;
const LOGO_PADDING_Y_MIN = -20;
const LOGO_SIZE_MAX = 60;
const LOGO_SIZE_MIN = 6;
const QUIET_ZONE_MAX = 8;
const QUIET_ZONE_MIN = 1;
const SCALE_MAX = 20;
const SCALE_MIN = 6;

const DEFAULT_PAYLOAD_BUILDERS: PayloadBuilders = {
  contact: {
    email: "avery@vectorqr.example",
    fullName: "Avery Rivera",
    organization: "Vector QR Studio",
    phone: "+1-555-010-2026",
    title: "Creative Technologist",
    url: "https://vectorqr.example",
  },
  url: {
    value: "https://mohsenhariri.github.io/qr",
  },
  wifi: {
    encryption: "WPA",
    hidden: false,
    password: "design-lab-2026",
    ssid: "Studio Guest",
  },
};

const CONTACT_EMAIL = "mxh1029@case.edu";
const CAPTCHA_COLORS = ["#1a1a1a", "#2a2a2a", "#0a0a0a", "#333333"];
const CONFIGS_KEY = "vector-qr-studio-configs";
const CONFIG_LIMIT = 6;
const HISTORY_KEY = "vector-qr-studio-history";
const HISTORY_LIMIT = 6;
const SETTINGS_KEY = "vector-qr-studio-settings";

const PRESET_LOGOS: PresetLogo[] = PRESET_LOGO_DEFS.map((logo) => ({
  id: logo.id,
  label: logo.label,
  source: new URL(`../assets/logo/${logo.file}`, import.meta.url).href,
}));

const DEFAULT_STATE: AppState = {
  background: "#f7f1e6",
  border: 4,
  content: buildUrlPayload(DEFAULT_PAYLOAD_BUILDERS.url),
  errorCorrection: "medium",
  foreground: "#103529",
  logoDataUrl: null,
  logoName: null,
  logoPaddingX: 3.5,
  logoPaddingY: 3.5,
  logoPresetId: null,
  logoSize: 11,
  payloadBuilders: clonePayloadBuilders(DEFAULT_PAYLOAD_BUILDERS),
  payloadType: "url",
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
  clipboardStatus: getElement<HTMLElement>("#clipboard-status", "clipboard status"),
  configClear: getElement<HTMLButtonElement>("#config-clear", "clear configs button"),
  configCount: getElement<HTMLElement>("#config-count", "config count"),
  configEmpty: getElement<HTMLElement>("#config-empty", "empty configs message"),
  configList: getElement<HTMLUListElement>("#config-list", "config list"),
  contactEmailInput: getElement<HTMLInputElement>("#contact-email-input", "contact email input"),
  contactNameInput: getElement<HTMLInputElement>("#contact-name-input", "contact name input"),
  contactOrgInput: getElement<HTMLInputElement>(
    "#contact-org-input",
    "contact organization input",
  ),
  contactPhoneInput: getElement<HTMLInputElement>("#contact-phone-input", "contact phone input"),
  contactTitleInput: getElement<HTMLInputElement>("#contact-title-input", "contact title input"),
  contactUrlInput: getElement<HTMLInputElement>("#contact-url-input", "contact URL input"),
  contentInput: getElement<HTMLTextAreaElement>("#content-input", "content input"),
  copySettingsLink: getElement<HTMLButtonElement>(
    "#copy-settings-link",
    "copy settings link button",
  ),
  copyPng: getElement<HTMLButtonElement>("#copy-png", "copy PNG button"),
  copySvg: getElement<HTMLButtonElement>("#copy-svg", "copy SVG button"),
  downloadPng: getElement<HTMLButtonElement>("#download-png", "download PNG button"),
  downloadSvg: getElement<HTMLButtonElement>("#download-svg", "download SVG button"),
  eccSelect: getElement<HTMLSelectElement>("#ecc-select", "error correction select"),
  emailModal: getElement<HTMLElement>("#email-modal", "email modal"),
  emailRevealBtn: getElement<HTMLButtonElement>("#email-reveal-btn", "email reveal button"),
  engineStatus: getElement<HTMLElement>("#engine-status", "engine status"),
  errorCopy: getElement<HTMLElement>("#error-copy", "error message"),
  footerYear: getElement<HTMLElement>("#footer-year", "footer year"),
  foregroundInput: getElement<HTMLInputElement>("#foreground-input", "foreground input"),
  historyClear: getElement<HTMLButtonElement>("#history-clear", "clear history button"),
  historyCount: getElement<HTMLElement>("#history-count", "history count"),
  historyEmpty: getElement<HTMLElement>("#history-empty", "empty history message"),
  historyList: getElement<HTMLUListElement>("#history-list", "history list"),
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
  payloadBuilder: getElement<HTMLElement>("#payload-builder", "payload builder"),
  payloadBuilderSections: Array.from(document.querySelectorAll<HTMLElement>("[data-builder]")),
  payloadTypeButtons: Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-payload-type]"),
  ),
  payloadUrlInput: getElement<HTMLInputElement>("#payload-url-input", "payload URL input"),
  preview: getElement<HTMLElement>("#qr-preview", "preview"),
  previewShell: getElement<HTMLElement>("#preview-shell", "preview shell"),
  refreshCaptcha: getElement<HTMLButtonElement>("#refresh-captcha", "refresh captcha button"),
  scaleRange: getElement<HTMLInputElement>("#scale-range", "scale range"),
  scaleValue: getElement<HTMLOutputElement>("#scale-value", "scale value"),
  scanCheckList: getElement<HTMLUListElement>("#scan-check-list", "scan safety checks"),
  scanSafety: getElement<HTMLElement>("#scan-safety", "scan safety"),
  scanSafetySummary: getElement<HTMLElement>("#scan-safety-summary", "scan safety summary"),
  statDark: getElement<HTMLElement>("#stat-dark", "dark modules stat"),
  statLength: getElement<HTMLElement>("#stat-length", "length stat"),
  statSize: getElement<HTMLElement>("#stat-size", "matrix size stat"),
  statVersion: getElement<HTMLElement>("#stat-version", "version stat"),
  transparentToggle: getElement<HTMLInputElement>("#transparent-toggle", "transparent toggle"),
  wifiEncryptionSelect: getElement<HTMLSelectElement>(
    "#wifi-encryption-select",
    "Wi-Fi encryption select",
  ),
  wifiHiddenToggle: getElement<HTMLInputElement>("#wifi-hidden-toggle", "hidden Wi-Fi toggle"),
  wifiPasswordInput: getElement<HTMLInputElement>("#wifi-password-input", "Wi-Fi password input"),
  wifiSsidInput: getElement<HTMLInputElement>("#wifi-ssid-input", "Wi-Fi SSID input"),
};

let appState: AppState = createDefaultState();
let configEntries: ConfigEntry[] = [];
let historyEntries: HistoryEntry[] = [];
let historySaveTimer = 0;
let lastFocusedElement: Element | null = null;
let lastResult: QrResult | null = null;
let logoPaddingDrag: LogoPaddingDrag | null = null;
let logoPresetLoadId = 0;
let pendingFrame = 0;
let settingsSaveTimer = 0;
const buttonFeedbackTimers = new Map<HTMLButtonElement, number>();

async function bootstrap() {
  renderPresetLogoButtons();
  configEntries = loadConfigEntries();
  renderConfigList();
  historyEntries = loadHistoryEntries();
  renderHistoryList();
  if (!hydrateStateFromShareUrl()) {
    hydrateStateFromSavedSettings();
  }
  hydrateControls(appState);
  setDownloadsEnabled(false);

  try {
    await init();
    setEngineStatus("Engine ready", true);
    renderLogoPresetOrQr();
  } catch (error) {
    setEngineStatus("Engine failed", false);
    showError(getErrorMessage(error));
  }

  bindEvents();
}

function configureControlRanges(state: AppState) {
  elements.borderRange.min = String(QUIET_ZONE_MIN);
  elements.borderRange.max = String(QUIET_ZONE_MAX);
  elements.logoPaddingXRange.min = String(LOGO_PADDING_X_MIN);
  elements.logoPaddingXRange.max = String(LOGO_PADDING_X_MAX);
  elements.logoPaddingYRange.min = String(getLogoPaddingYMin(state.logoSize));
  elements.logoPaddingYRange.max = String(LOGO_PADDING_Y_MAX);
  elements.logoSizeRange.min = String(LOGO_SIZE_MIN);
  elements.logoSizeRange.max = String(LOGO_SIZE_MAX);
  elements.scaleRange.min = String(SCALE_MIN);
  elements.scaleRange.max = String(SCALE_MAX);
}

function bindEvents() {
  bindFooterEvents();
  bindConfigEvents();
  bindHistoryEvents();

  elements.contentInput.addEventListener("input", () => {
    appState.content = elements.contentInput.value;
    appState.payloadType = "raw";
    syncPayloadBuilderUi();
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
    setLogoSize(Number(elements.logoSizeRange.value));
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

  elements.copySvg.addEventListener("click", async () => {
    if (!lastResult) {
      return;
    }

    try {
      await copyTextToClipboard(lastResult.svg);
      setClipboardFeedback(elements.copySvg, "Copied SVG");
      showError("");
    } catch {
      showError("Unable to copy SVG in the current browser context.");
    }
  });

  elements.copyPng.addEventListener("click", async () => {
    if (!lastResult) {
      return;
    }

    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      showError("PNG clipboard copy is not supported in this browser.");
      return;
    }

    const blob = await renderPngBlob(lastResult);
    if (!blob) {
      showError("Unable to render PNG for clipboard copy.");
      return;
    }

    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setClipboardFeedback(elements.copyPng, "Copied PNG");
      showError("");
    } catch {
      showError("Unable to copy PNG in the current browser context.");
    }
  });

  elements.copySettingsLink.addEventListener("click", async () => {
    try {
      await copyTextToClipboard(buildShareUrl());
      setIconButtonFeedback(elements.copySettingsLink, "Settings link copied");
      showError("");
    } catch {
      showError("Unable to copy the settings link in the current browser context.");
    }
  });

  for (const button of elements.payloadTypeButtons) {
    button.addEventListener("click", () => {
      const payloadType = button.dataset.payloadType as PayloadType | undefined;

      if (!payloadType) {
        return;
      }

      appState.payloadType = payloadType;
      if (payloadType !== "raw") {
        syncContentFromPayloadBuilder();
      }

      syncPayloadBuilderUi();
      scheduleRender();
    });
  }

  bindPayloadBuilderEvents();
}

function bindConfigEvents() {
  elements.configList.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-config-id]");

    if (!button) {
      return;
    }

    const entry = configEntries.find((item) => item.id === button.dataset.configId);
    if (!entry) {
      return;
    }

    restoreConfigSettings(entry);
  });

  elements.configClear.addEventListener("click", () => {
    configEntries = [];
    persistConfigEntries();
    renderConfigList();
  });
}

function bindHistoryEvents() {
  elements.historyList.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-history-id]");

    if (!button) {
      return;
    }

    const entry = historyEntries.find((item) => item.id === button.dataset.historyId);
    if (!entry) {
      return;
    }

    restoreShareableSettings(entry);
  });

  elements.historyClear.addEventListener("click", () => {
    historyEntries = [];
    persistHistoryEntries();
    renderHistoryList();
  });
}

function bindPayloadBuilderEvents() {
  const syncFromActiveBuilder = () => {
    updatePayloadBuilderFromControls(appState.payloadType);
    syncContentFromPayloadBuilder();
    scheduleRender();
  };

  for (const input of [
    elements.payloadUrlInput,
    elements.wifiSsidInput,
    elements.wifiPasswordInput,
    elements.contactNameInput,
    elements.contactOrgInput,
    elements.contactTitleInput,
    elements.contactPhoneInput,
    elements.contactEmailInput,
    elements.contactUrlInput,
  ]) {
    input.addEventListener("input", syncFromActiveBuilder);
  }

  elements.wifiEncryptionSelect.addEventListener("change", syncFromActiveBuilder);
  elements.wifiHiddenToggle.addEventListener("change", syncFromActiveBuilder);
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
    if (requestId === logoPresetLoadId && !appState.logoDataUrl) {
      appState.logoPresetId = null;
      syncLogoUi();
    }

    scheduleRender();
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
    updatePreviewQrSize(size, appState);
    bindLogoPreviewEditor();
    elements.previewShell.dataset.ready = "true";
    elements.statVersion.textContent = String(version);
    elements.statSize.textContent = `${size} × ${size}`;
    elements.statDark.textContent = darkModules.toLocaleString();
    updateScanSafety(lastResult);
    queueSettingsSave();
    queueHistorySave();
  } catch (error) {
    lastResult = null;
    elements.previewShell.dataset.ready = "false";
    elements.preview.innerHTML = `<p class="placeholder-copy">Adjust the content or error correction level and try again.</p>`;
    elements.preview.style.removeProperty("--qr-preview-size");
    elements.statVersion.textContent = "-";
    elements.statSize.textContent = "-";
    elements.statDark.textContent = "-";
    updateScanSafety(null);
    setDownloadsEnabled(false);
    showError(getErrorMessage(error));
  }
}

function updatePreviewQrSize(matrixSize: number, state: AppState) {
  elements.preview.style.setProperty("--qr-preview-size", `${getPixelDimension(matrixSize, state)}px`);
}

async function renderPngBlob(result: QrResult): Promise<Blob | null> {
  const dimension = getPixelDimension(result.size, appState);
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
  configureControlRanges(state);
  elements.contentInput.value = state.content;
  hydratePayloadBuilderControls(state.payloadBuilders);
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
  syncPayloadBuilderUi();
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
  elements.copySvg.disabled = !enabled;
  elements.copyPng.disabled = !enabled;
}

function showError(message: string) {
  elements.errorCopy.textContent = message;
}

function updateLengthStat(content: string) {
  elements.statLength.textContent = String(content.trim().length);
}

function hydratePayloadBuilderControls(builders: PayloadBuilders) {
  elements.payloadUrlInput.value = builders.url.value;
  elements.wifiSsidInput.value = builders.wifi.ssid;
  elements.wifiPasswordInput.value = builders.wifi.password;
  elements.wifiEncryptionSelect.value = builders.wifi.encryption;
  elements.wifiHiddenToggle.checked = builders.wifi.hidden;
  elements.contactNameInput.value = builders.contact.fullName;
  elements.contactOrgInput.value = builders.contact.organization;
  elements.contactTitleInput.value = builders.contact.title;
  elements.contactPhoneInput.value = builders.contact.phone;
  elements.contactEmailInput.value = builders.contact.email;
  elements.contactUrlInput.value = builders.contact.url;
}

function syncPayloadBuilderUi() {
  const isRaw = appState.payloadType === "raw";

  elements.payloadBuilder.hidden = isRaw;
  for (const button of elements.payloadTypeButtons) {
    button.setAttribute(
      "aria-pressed",
      button.dataset.payloadType === appState.payloadType ? "true" : "false",
    );
  }

  for (const section of elements.payloadBuilderSections) {
    section.hidden = isRaw || section.dataset.builder !== appState.payloadType;
  }
}

function updatePayloadBuilderFromControls(type: PayloadType) {
  if (type === "url") {
    appState.payloadBuilders.url.value = elements.payloadUrlInput.value;
    return;
  }

  if (type === "wifi") {
    appState.payloadBuilders.wifi.ssid = elements.wifiSsidInput.value;
    appState.payloadBuilders.wifi.password = elements.wifiPasswordInput.value;
    appState.payloadBuilders.wifi.encryption = elements.wifiEncryptionSelect.value as WifiEncryption;
    appState.payloadBuilders.wifi.hidden = elements.wifiHiddenToggle.checked;
    return;
  }

  if (type === "contact") {
    appState.payloadBuilders.contact.fullName = elements.contactNameInput.value;
    appState.payloadBuilders.contact.organization = elements.contactOrgInput.value;
    appState.payloadBuilders.contact.title = elements.contactTitleInput.value;
    appState.payloadBuilders.contact.phone = elements.contactPhoneInput.value;
    appState.payloadBuilders.contact.email = elements.contactEmailInput.value;
    appState.payloadBuilders.contact.url = elements.contactUrlInput.value;
  }
}

function syncContentFromPayloadBuilder() {
  const content = buildPayloadFromBuilder(appState.payloadType, appState.payloadBuilders);

  if (content === null) {
    return;
  }

  appState.content = content;
  elements.contentInput.value = content;
}

function buildPayloadFromBuilder(
  type: PayloadType,
  builders: PayloadBuilders,
): string | null {
  if (type === "url") {
    return buildUrlPayload(builders.url);
  }

  if (type === "wifi") {
    return buildWifiPayload(builders.wifi);
  }

  if (type === "contact") {
    return buildVCardPayload(builders.contact);
  }

  return null;
}

function clonePayloadBuilders(builders: PayloadBuilders): PayloadBuilders {
  return {
    contact: { ...builders.contact },
    url: { ...builders.url },
    wifi: { ...builders.wifi },
  };
}

function createDefaultState(): AppState {
  return {
    ...DEFAULT_STATE,
    payloadBuilders: clonePayloadBuilders(DEFAULT_STATE.payloadBuilders),
  };
}

function hydrateStateFromShareUrl(): boolean {
  const settings = readShareableSettings();

  if (!settings) {
    return false;
  }

  applyShareableSettings(settings);
  return true;
}

function hydrateStateFromSavedSettings() {
  const settings = loadSavedSettings();

  if (!settings) {
    return;
  }

  applyShareableSettings(settings);
}

function restoreShareableSettings(settings: ShareableSettings) {
  applyShareableSettings(settings);
  hydrateControls(appState);
  renderLogoPresetOrQr();
}

function restoreConfigSettings(settings: ConfigSettings) {
  applyConfigSettings(settings);
  hydrateControls(appState);
  renderLogoPresetOrQr();
}

function applyShareableSettings(settings: ShareableSettings) {
  appState = {
    ...appState,
    background: settings.background,
    border: settings.border,
    content:
      settings.payloadType === "raw"
        ? settings.content
        : buildPayloadFromBuilder(settings.payloadType, settings.payloadBuilders) ?? settings.content,
    errorCorrection: settings.errorCorrection,
    foreground: settings.foreground,
    logoDataUrl: null,
    logoName: null,
    logoPaddingX: settings.logoPaddingX,
    logoPaddingY: settings.logoPaddingY,
    logoPresetId: getPresetLogo(settings.logoPresetId)?.id ?? null,
    logoSize: settings.logoSize,
    payloadBuilders: clonePayloadBuilders(settings.payloadBuilders),
    payloadType: settings.payloadType,
    scale: settings.scale,
    transparent: settings.transparent,
  };
}

function applyConfigSettings(settings: ConfigSettings) {
  appState = {
    ...appState,
    background: settings.background,
    border: settings.border,
    errorCorrection: settings.errorCorrection,
    foreground: settings.foreground,
    logoDataUrl: null,
    logoName: null,
    logoPaddingX: settings.logoPaddingX,
    logoPaddingY: settings.logoPaddingY,
    logoPresetId: getPresetLogo(settings.logoPresetId)?.id ?? null,
    logoSize: settings.logoSize,
    scale: settings.scale,
    transparent: settings.transparent,
  };
}

function renderLogoPresetOrQr() {
  const sharedLogo = getPresetLogo(appState.logoPresetId);

  if (sharedLogo) {
    void selectPresetLogo(sharedLogo);
  } else {
    scheduleRender();
  }
}

function readShareableSettings(): ShareableSettings | null {
  const hash = window.location.hash.replace(/^#/, "");

  if (!hash.startsWith("s=")) {
    return null;
  }

  try {
    const decoded = JSON.parse(decodeBase64Url(hash.slice(2))) as unknown;

    return readSettingsRecord(decoded);
  } catch {
    return null;
  }
}

function loadSavedSettings(): ShareableSettings | null {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);

    return stored ? readSettingsRecord(JSON.parse(stored) as unknown) : null;
  } catch {
    return null;
  }
}

function buildShareUrl(): string {
  const url = new URL(window.location.href);

  url.hash = `s=${encodeBase64Url(JSON.stringify(toShareableSettings()))}`;

  return url.toString();
}

function toShareableSettings(): ShareableSettings {
  return {
    background: appState.background,
    border: appState.border,
    content: appState.content,
    errorCorrection: appState.errorCorrection,
    foreground: appState.foreground,
    logoPaddingX: appState.logoPaddingX,
    logoPaddingY: appState.logoPaddingY,
    logoPresetId: appState.logoPresetId,
    logoSize: appState.logoSize,
    payloadBuilders: clonePayloadBuilders(appState.payloadBuilders),
    payloadType: appState.payloadType,
    scale: appState.scale,
    transparent: appState.transparent,
  };
}

function toConfigSettings(): ConfigSettings {
  return {
    background: appState.background,
    border: appState.border,
    errorCorrection: appState.errorCorrection,
    foreground: appState.foreground,
    logoPaddingX: appState.logoPaddingX,
    logoPaddingY: appState.logoPaddingY,
    logoPresetId: appState.logoPresetId,
    logoSize: appState.logoSize,
    scale: appState.scale,
    transparent: appState.transparent,
  };
}

function getPresetLogo(id: string | null): PresetLogo | null {
  if (!id) {
    return null;
  }

  return PRESET_LOGOS.find((logo) => logo.id === id) ?? null;
}

function readSettingsRecord(value: unknown): ShareableSettings | null {
  if (!isRecord(value)) {
    return null;
  }

  const payloadBuilders = readPayloadBuilders(value.payloadBuilders);
  const payloadType = readPayloadType(value.payloadType, "raw");
  const logoSize = readNumber(value.logoSize, DEFAULT_STATE.logoSize, LOGO_SIZE_MIN, LOGO_SIZE_MAX);

  return {
    background: readHexColor(value.background, DEFAULT_STATE.background),
    border: readNumber(value.border, DEFAULT_STATE.border, QUIET_ZONE_MIN, QUIET_ZONE_MAX),
    content: readString(value.content, DEFAULT_STATE.content),
    errorCorrection: readErrorCorrection(value.errorCorrection, DEFAULT_STATE.errorCorrection),
    foreground: readHexColor(value.foreground, DEFAULT_STATE.foreground),
    logoPaddingX: readNumber(
      value.logoPaddingX,
      DEFAULT_STATE.logoPaddingX,
      LOGO_PADDING_X_MIN,
      LOGO_PADDING_X_MAX,
    ),
    logoPaddingY: readNumber(
      value.logoPaddingY,
      DEFAULT_STATE.logoPaddingY,
      getLogoPaddingYMin(logoSize),
      LOGO_PADDING_Y_MAX,
    ),
    logoPresetId: readNullableString(value.logoPresetId),
    logoSize,
    payloadBuilders,
    payloadType,
    scale: readNumber(value.scale, DEFAULT_STATE.scale, SCALE_MIN, SCALE_MAX),
    transparent: readBoolean(value.transparent, DEFAULT_STATE.transparent),
  };
}

function readConfigSettingsRecord(value: unknown): ConfigSettings | null {
  if (!isRecord(value)) {
    return null;
  }

  const logoSize = readNumber(value.logoSize, DEFAULT_STATE.logoSize, LOGO_SIZE_MIN, LOGO_SIZE_MAX);

  return {
    background: readHexColor(value.background, DEFAULT_STATE.background),
    border: readNumber(value.border, DEFAULT_STATE.border, QUIET_ZONE_MIN, QUIET_ZONE_MAX),
    errorCorrection: readErrorCorrection(value.errorCorrection, DEFAULT_STATE.errorCorrection),
    foreground: readHexColor(value.foreground, DEFAULT_STATE.foreground),
    logoPaddingX: readNumber(
      value.logoPaddingX,
      DEFAULT_STATE.logoPaddingX,
      LOGO_PADDING_X_MIN,
      LOGO_PADDING_X_MAX,
    ),
    logoPaddingY: readNumber(
      value.logoPaddingY,
      DEFAULT_STATE.logoPaddingY,
      getLogoPaddingYMin(logoSize),
      LOGO_PADDING_Y_MAX,
    ),
    logoPresetId: readNullableString(value.logoPresetId),
    logoSize,
    scale: readNumber(value.scale, DEFAULT_STATE.scale, SCALE_MIN, SCALE_MAX),
    transparent: readBoolean(value.transparent, DEFAULT_STATE.transparent),
  };
}

function readPayloadBuilders(value: unknown): PayloadBuilders {
  if (!isRecord(value)) {
    return clonePayloadBuilders(DEFAULT_PAYLOAD_BUILDERS);
  }

  const url = isRecord(value.url) ? value.url : {};
  const wifi = isRecord(value.wifi) ? value.wifi : {};
  const contact = isRecord(value.contact) ? value.contact : {};

  return {
    contact: {
      email: readString(contact.email, DEFAULT_PAYLOAD_BUILDERS.contact.email),
      fullName: readString(contact.fullName, DEFAULT_PAYLOAD_BUILDERS.contact.fullName),
      organization: readString(
        contact.organization,
        DEFAULT_PAYLOAD_BUILDERS.contact.organization,
      ),
      phone: readString(contact.phone, DEFAULT_PAYLOAD_BUILDERS.contact.phone),
      title: readString(contact.title, DEFAULT_PAYLOAD_BUILDERS.contact.title),
      url: readString(contact.url, DEFAULT_PAYLOAD_BUILDERS.contact.url),
    },
    url: {
      value: readString(url.value, DEFAULT_PAYLOAD_BUILDERS.url.value),
    },
    wifi: {
      encryption: readWifiEncryption(wifi.encryption, DEFAULT_PAYLOAD_BUILDERS.wifi.encryption),
      hidden: readBoolean(wifi.hidden, DEFAULT_PAYLOAD_BUILDERS.wifi.hidden),
      password: readString(wifi.password, DEFAULT_PAYLOAD_BUILDERS.wifi.password),
      ssid: readString(wifi.ssid, DEFAULT_PAYLOAD_BUILDERS.wifi.ssid),
    },
  };
}

function readPayloadType(value: unknown, fallback: PayloadType): PayloadType {
  return value === "contact" || value === "raw" || value === "url" || value === "wifi"
    ? value
    : fallback;
}

function readErrorCorrection(value: unknown, fallback: ErrorCorrection): ErrorCorrection {
  return value === "low" || value === "medium" || value === "quartile" || value === "high"
    ? value
    : fallback;
}

function readWifiEncryption(value: unknown, fallback: WifiEncryption): WifiEncryption {
  return value === "WEP" || value === "WPA" || value === "nopass" ? value : fallback;
}

function readHexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

function queueSettingsSave() {
  if (settingsSaveTimer) {
    window.clearTimeout(settingsSaveTimer);
  }

  settingsSaveTimer = window.setTimeout(() => {
    settingsSaveTimer = 0;
    persistSavedSettings();
    saveCurrentConfig();
  }, 300);
}

function persistSavedSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(toShareableSettings()));
  } catch {
    // localStorage can be unavailable or full; the generator should keep working.
  }
}

function saveCurrentConfig() {
  const settings = toConfigSettings();
  const id = hashString(JSON.stringify(settings));
  const entry: ConfigEntry = {
    ...settings,
    createdAt: Date.now(),
    id,
    label: createConfigLabel(settings),
  };

  configEntries = [entry, ...configEntries.filter((item) => item.id !== id)].slice(
    0,
    CONFIG_LIMIT,
  );
  persistConfigEntries();
  renderConfigList();
}

function loadConfigEntries(): ConfigEntry[] {
  try {
    const stored = localStorage.getItem(CONFIGS_KEY);
    const parsed = stored ? (JSON.parse(stored) as unknown) : [];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(readConfigEntry)
      .filter((entry): entry is ConfigEntry => Boolean(entry))
      .slice(0, CONFIG_LIMIT);
  } catch {
    return [];
  }
}

function readConfigEntry(value: unknown): ConfigEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const settings = readConfigSettingsRecord(value);

  if (!settings) {
    return null;
  }

  return {
    ...settings,
    createdAt: readNumber(value.createdAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
    id: readString(value.id, hashString(JSON.stringify(settings))),
    label: readString(value.label, createConfigLabel(settings)),
  };
}

function persistConfigEntries() {
  try {
    localStorage.setItem(CONFIGS_KEY, JSON.stringify(configEntries));
  } catch {
    // localStorage can be unavailable or full; the generator should keep working.
  }
}

function renderConfigList() {
  elements.configCount.textContent =
    configEntries.length === 1 ? "1 saved locally" : `${configEntries.length} saved locally`;
  elements.configEmpty.hidden = configEntries.length > 0;
  elements.configClear.disabled = configEntries.length === 0;
  elements.configList.replaceChildren(...configEntries.map(createConfigEntryElement));
}

function createConfigEntryElement(entry: ConfigEntry): HTMLLIElement {
  const item = document.createElement("li");
  const button = document.createElement("button");
  const row = document.createElement("span");
  const swatches = document.createElement("span");
  const foregroundSwatch = document.createElement("span");
  const backgroundSwatch = document.createElement("span");
  const label = document.createElement("span");
  const meta = document.createElement("span");

  button.className = "history-item config-item";
  button.type = "button";
  button.dataset.configId = entry.id;

  row.className = "config-label-row";
  swatches.className = "config-swatches";
  foregroundSwatch.className = "config-swatch";
  foregroundSwatch.style.backgroundColor = entry.foreground;
  backgroundSwatch.className = "config-swatch";
  backgroundSwatch.style.backgroundColor = entry.transparent ? "" : entry.background;
  backgroundSwatch.dataset.transparent = String(entry.transparent);
  label.className = "history-label";
  label.textContent = entry.label;
  meta.className = "history-meta";
  meta.textContent = createConfigMeta(entry);

  swatches.append(foregroundSwatch, backgroundSwatch);
  row.append(swatches, label);
  button.append(row, meta);
  item.append(button);

  return item;
}

function queueHistorySave() {
  if (!appState.content.trim()) {
    return;
  }

  if (historySaveTimer) {
    window.clearTimeout(historySaveTimer);
  }

  historySaveTimer = window.setTimeout(() => {
    historySaveTimer = 0;
    saveCurrentToHistory();
  }, 900);
}

function saveCurrentToHistory() {
  const settings = toShareableSettings();

  if (!settings.content.trim()) {
    return;
  }

  const id = hashString(JSON.stringify(settings));
  const entry: HistoryEntry = {
    ...settings,
    createdAt: Date.now(),
    id,
    label: createHistoryLabel(settings),
  };

  historyEntries = [entry, ...historyEntries.filter((item) => item.id !== id)].slice(
    0,
    HISTORY_LIMIT,
  );
  persistHistoryEntries();
  renderHistoryList();
}

function loadHistoryEntries(): HistoryEntry[] {
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    const parsed = stored ? (JSON.parse(stored) as unknown) : [];

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(readHistoryEntry)
      .filter((entry): entry is HistoryEntry => Boolean(entry))
      .slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function readHistoryEntry(value: unknown): HistoryEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const settings = readSettingsRecord(value);

  if (!settings) {
    return null;
  }

  return {
    ...settings,
    createdAt: readNumber(value.createdAt, Date.now(), 0, Number.MAX_SAFE_INTEGER),
    id: readString(value.id, hashString(JSON.stringify(settings))),
    label: readString(value.label, createHistoryLabel(settings)),
  };
}

function persistHistoryEntries() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(historyEntries));
  } catch {
    // localStorage can be unavailable or full; the generator should keep working.
  }
}

function renderHistoryList() {
  elements.historyCount.textContent =
    historyEntries.length === 1 ? "1 saved locally" : `${historyEntries.length} saved locally`;
  elements.historyEmpty.hidden = historyEntries.length > 0;
  elements.historyClear.disabled = historyEntries.length === 0;
  elements.historyList.replaceChildren(...historyEntries.map(createHistoryEntryElement));
}

function createHistoryEntryElement(entry: HistoryEntry): HTMLLIElement {
  const item = document.createElement("li");
  const button = document.createElement("button");
  const label = document.createElement("span");
  const meta = document.createElement("span");

  button.className = "history-item";
  button.type = "button";
  button.dataset.historyId = entry.id;
  label.className = "history-label";
  label.textContent = entry.label;
  meta.className = "history-meta";
  meta.textContent = `${formatPayloadType(entry.payloadType)} • ${formatHistoryTime(entry.createdAt)}`;
  button.append(label, meta);
  item.append(button);

  return item;
}

function createConfigLabel(settings: ConfigSettings): string {
  const foreground = settings.foreground.toUpperCase();
  const background = settings.transparent ? "transparent" : settings.background.toUpperCase();

  return `${foreground} on ${background}`;
}

function createConfigMeta(settings: ConfigEntry): string {
  const parts = [
    formatErrorCorrection(settings.errorCorrection),
    `Quiet ${settings.border}m`,
    `${settings.scale}px/mod`,
  ];
  const logo = getPresetLogo(settings.logoPresetId);

  if (logo) {
    parts.push(logo.label);
  }

  if (settings.transparent) {
    parts.push("Transparent");
  }

  parts.push(formatHistoryTime(settings.createdAt));

  return parts.join(" • ");
}

function createHistoryLabel(settings: ShareableSettings): string {
  if (settings.payloadType === "url") {
    return settings.payloadBuilders.url.value || settings.content;
  }

  if (settings.payloadType === "wifi") {
    return settings.payloadBuilders.wifi.ssid || "Wi-Fi network";
  }

  if (settings.payloadType === "contact") {
    return settings.payloadBuilders.contact.fullName || "vCard contact";
  }

  return settings.content.replace(/\s+/g, " ").trim() || "Custom text";
}

function formatErrorCorrection(errorCorrection: ErrorCorrection): string {
  if (errorCorrection === "low") {
    return "Low EC";
  }

  if (errorCorrection === "medium") {
    return "Medium EC";
  }

  if (errorCorrection === "quartile") {
    return "Quartile EC";
  }

  return "High EC";
}

function formatPayloadType(type: PayloadType): string {
  if (type === "contact") {
    return "vCard";
  }

  if (type === "wifi") {
    return "Wi-Fi";
  }

  return type === "url" ? "Link" : "Custom";
}

function formatHistoryTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}

function hashString(value: string): string {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash).toString(36);
}

function updateScanSafety(result: QrResult | null) {
  if (!result) {
    elements.scanSafety.dataset.status = "notice";
    elements.scanSafetySummary.textContent = "Unavailable";
    elements.scanCheckList.replaceChildren(createScanSafetyItemElement({
      detail: "Generate a valid QR code first.",
      label: "No matrix",
      status: "notice",
    }));
    return;
  }

  const items = evaluateScanSafety(result);
  const status = getWorstScanSafetyStatus(items);

  elements.scanSafety.dataset.status = status;
  elements.scanSafetySummary.textContent =
    status === "good" ? "Ready" : status === "notice" ? "Check print" : "Risky";
  elements.scanCheckList.replaceChildren(...items.map(createScanSafetyItemElement));
}

function evaluateScanSafety(result: QrResult): ScanSafetyItem[] {
  const contrastItem = getContrastSafetyItem();
  const quietZoneItem = getQuietZoneSafetyItem();
  const logoItem = getLogoSafetyItem();
  const payloadItem = getPayloadSafetyItem(result.version);
  const densityItem = getDensitySafetyItem();

  return [contrastItem, quietZoneItem, logoItem, payloadItem, densityItem];
}

function getContrastSafetyItem(): ScanSafetyItem {
  if (appState.transparent) {
    return {
      detail: "Transparent exports depend on the final surface color.",
      label: "Surface unknown",
      status: "notice",
    };
  }

  const ratio = getContrastRatio(appState.foreground, appState.background);

  if (ratio >= 4.5) {
    return {
      detail: `Foreground/background contrast is ${ratio.toFixed(1)}:1.`,
      label: `Contrast ${ratio.toFixed(1)}`,
      status: "good",
    };
  }

  if (ratio >= 3) {
    return {
      detail: `Foreground/background contrast is ${ratio.toFixed(1)}:1.`,
      label: `Contrast ${ratio.toFixed(1)}`,
      status: "notice",
    };
  }

  return {
    detail: `Foreground/background contrast is ${ratio.toFixed(1)}:1.`,
    label: `Contrast ${ratio.toFixed(1)}`,
    status: "warning",
  };
}

function getQuietZoneSafetyItem(): ScanSafetyItem {
  if (appState.border >= 4) {
    return {
      detail: `${appState.border} quiet-zone modules.`,
      label: `Quiet ${appState.border}m`,
      status: "good",
    };
  }

  if (appState.border >= 2) {
    return {
      detail: `${appState.border} quiet-zone modules.`,
      label: `Quiet ${appState.border}m`,
      status: "notice",
    };
  }

  return {
    detail: `${appState.border} quiet-zone module.`,
    label: `Quiet ${appState.border}m`,
    status: "warning",
  };
}

function getLogoSafetyItem(): ScanSafetyItem {
  if (!appState.logoDataUrl) {
    return {
      detail: "No center logo is covering modules.",
      label: "No logo",
      status: "good",
    };
  }

  const coverWidth = appState.logoSize + appState.logoPaddingX * 2;
  const coverHeight = appState.logoSize + appState.logoPaddingY * 2;
  const cover = Math.max(coverWidth, coverHeight);

  if (cover <= 24) {
    return {
      detail: `Logo clear patch covers about ${cover.toFixed(0)}% of the matrix width.`,
      label: "Logo safe",
      status: "good",
    };
  }

  if (cover <= 30) {
    return {
      detail: `Logo clear patch covers about ${cover.toFixed(0)}% of the matrix width.`,
      label: "Logo large",
      status: "notice",
    };
  }

  return {
    detail: `Logo clear patch covers about ${cover.toFixed(0)}% of the matrix width.`,
    label: "Logo risky",
    status: "warning",
  };
}

function getPayloadSafetyItem(version: number): ScanSafetyItem {
  if (version <= 7) {
    return {
      detail: `QR version ${version}.`,
      label: `Payload v${version}`,
      status: "good",
    };
  }

  if (version <= 14) {
    return {
      detail: `QR version ${version}.`,
      label: `Payload v${version}`,
      status: "notice",
    };
  }

  return {
    detail: `QR version ${version}.`,
    label: `Payload v${version}`,
    status: "warning",
  };
}

function getDensitySafetyItem(): ScanSafetyItem {
  if (appState.scale >= 10) {
    return {
      detail: `${appState.scale} pixels per module for preview and export.`,
      label: `${appState.scale}px/mod`,
      status: "good",
    };
  }

  if (appState.scale >= 8) {
    return {
      detail: `${appState.scale} pixels per module for preview and export.`,
      label: `${appState.scale}px/mod`,
      status: "notice",
    };
  }

  return {
    detail: `${appState.scale} pixels per module for preview and export.`,
    label: `${appState.scale}px/mod`,
    status: "warning",
  };
}

function createScanSafetyItemElement(item: ScanSafetyItem): HTMLLIElement {
  const element = document.createElement("li");

  element.className = "scan-check";
  element.dataset.status = item.status;
  element.textContent = item.label;
  element.title = item.detail;

  return element;
}

function getWorstScanSafetyStatus(items: ScanSafetyItem[]): ScanSafetyStatus {
  if (items.some((item) => item.status === "warning")) {
    return "warning";
  }

  if (items.some((item) => item.status === "notice")) {
    return "notice";
  }

  return "good";
}

function getContrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = getRelativeLuminance(hexToRgb(foreground));
  const backgroundLuminance = getRelativeLuminance(hexToRgb(background));
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

function getRelativeLuminance([red, green, blue]: [number, number, number]): number {
  const [linearRed, linearGreen, linearBlue] = [red, green, blue].map((channel) => {
    const value = channel / 255;

    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * linearRed + 0.7152 * linearGreen + 0.0722 * linearBlue;
}

function hexToRgb(color: string): [number, number, number] {
  const normalized = color.replace("#", "");
  const hex =
    normalized.length === 3
      ? normalized
          .split("")
          .map((character) => `${character}${character}`)
          .join("")
      : normalized.padEnd(6, "0").slice(0, 6);

  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
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

function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function setLogoSize(value: number) {
  appState.logoSize = clamp(value, LOGO_SIZE_MIN, LOGO_SIZE_MAX);
  configureControlRanges(appState);
  elements.logoSizeRange.value = String(appState.logoSize);
  elements.logoSizeValue.textContent = formatPercent(appState.logoSize);
  appState.logoPaddingY = normalizeLogoPadding(
    appState.logoPaddingY,
    getLogoPaddingYMin(appState.logoSize),
    LOGO_PADDING_Y_MAX,
  );
  elements.logoPaddingYRange.value = String(appState.logoPaddingY);
  elements.logoPaddingYValue.textContent = formatPercent(appState.logoPaddingY);
  syncLogoUi();
}

function setLogoPadding(next: { x?: number; y?: number }) {
  if (typeof next.x === "number") {
    appState.logoPaddingX = normalizeLogoPadding(next.x, LOGO_PADDING_X_MIN, LOGO_PADDING_X_MAX);
    elements.logoPaddingXRange.value = String(appState.logoPaddingX);
    elements.logoPaddingXValue.textContent = formatPercent(appState.logoPaddingX);
  }

  if (typeof next.y === "number") {
    appState.logoPaddingY = normalizeLogoPadding(
      next.y,
      getLogoPaddingYMin(appState.logoSize),
      LOGO_PADDING_Y_MAX,
    );
    elements.logoPaddingYRange.value = String(appState.logoPaddingY);
    elements.logoPaddingYValue.textContent = formatPercent(appState.logoPaddingY);
  }

  syncLogoUi();
}

function normalizeLogoPadding(value: number, min: number, max: number): number {
  return clamp(roundToStep(value, LOGO_PADDING_STEP), min, max);
}

function getLogoPaddingYMin(logoSize: number): number {
  return Math.max(LOGO_PADDING_Y_MIN, -(logoSize / 2));
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

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Copy command failed.");
    }
  } finally {
    textarea.remove();
  }
}

function setClipboardFeedback(button: HTMLButtonElement, message: string) {
  const label = button.querySelector<HTMLElement>(".button-label");

  if (!label) {
    return;
  }

  const originalLabel = button.dataset.defaultLabel || label.textContent || "";
  button.dataset.defaultLabel = originalLabel;
  label.textContent = message;
  elements.clipboardStatus.textContent = message;

  const previousTimer = buttonFeedbackTimers.get(button);
  if (previousTimer) {
    window.clearTimeout(previousTimer);
  }

  const timer = window.setTimeout(() => {
    label.textContent = originalLabel;
    buttonFeedbackTimers.delete(button);
  }, 1600);

  buttonFeedbackTimers.set(button, timer);
}

function setIconButtonFeedback(button: HTMLButtonElement, message: string) {
  const originalLabel = button.dataset.defaultLabel || button.getAttribute("aria-label") || "";

  button.dataset.defaultLabel = originalLabel;
  button.dataset.copied = "true";
  button.setAttribute("aria-label", message);
  button.title = message;
  elements.clipboardStatus.textContent = message;

  const previousTimer = buttonFeedbackTimers.get(button);
  if (previousTimer) {
    window.clearTimeout(previousTimer);
  }

  const timer = window.setTimeout(() => {
    button.dataset.copied = "false";
    button.setAttribute("aria-label", originalLabel);
    button.title = originalLabel;
    buttonFeedbackTimers.delete(button);
  }, 1600);

  buttonFeedbackTimers.set(button, timer);
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
