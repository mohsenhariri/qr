// Pure, environment-agnostic QR rendering and payload logic.
//
// This module is the single source of truth for how Vector QR Studio turns a
// QR matrix into a styled SVG. It is imported by both the browser UI
// (`src/main.ts`) and the headless CLI (`bin/qr.ts`) so the two cannot drift.
// Keep it free of DOM, canvas, fetch, and Node APIs: only string/number math.

export type ErrorCorrection = "low" | "medium" | "quartile" | "high";
export type WifiEncryption = "WEP" | "WPA" | "nopass";

export type PayloadBuilders = {
  contact: {
    email: string;
    fullName: string;
    organization: string;
    phone: string;
    title: string;
    url: string;
  };
  url: {
    value: string;
  };
  wifi: {
    encryption: WifiEncryption;
    hidden: boolean;
    password: string;
    ssid: string;
  };
};

// The subset of studio state the renderers actually read. `AppState` in the
// browser UI is a structural superset, so it satisfies this interface.
export type RenderState = {
  background: string;
  border: number;
  foreground: string;
  logoDataUrl: string | null;
  logoPaddingX: number;
  logoPaddingY: number;
  logoSize: number;
  scale: number;
  transparent: boolean;
  // Optional fixed output dimension in px. When set, the SVG renders at this
  // exact width/height regardless of matrix version, so a batch of QR codes
  // with different payload lengths still shares one display size. When unset,
  // the dimension is derived from `scale` (px per module).
  pixelSize?: number | null;
};

// Shared visual defaults so the CLI matches the studio's out-of-the-box look.
export const RENDER_DEFAULTS = {
  background: "#f7f1e6",
  border: 4,
  foreground: "#103529",
  logoPaddingX: 3.5,
  logoPaddingY: 3.5,
  logoSize: 11,
  scale: 12,
  transparent: false,
} as const;

// Preset logo registry. `id` doubles as the filename stem under `assets/logo/`
// (e.g. `arxiv` -> `assets/logo/arxiv.svg`). The browser UI builds bundler URLs
// from these entries; the CLI resolves them to files on disk.
export const PRESET_LOGOS: { id: string; label: string; file: string }[] = [
  { id: "github", label: "GitHub", file: "github.svg" },
  { id: "arxiv", label: "arXiv", file: "arxiv.svg" },
  { id: "pypi", label: "PyPI", file: "pypi.svg" },
  { id: "qwen", label: "Qwen", file: "qwen.svg" },
  { id: "acl", label: "ACL", file: "acl.svg" },
  { id: "rtd", label: "Docs", file: "rtd.svg" },
  { id: "scorio", label: "Scorio", file: "scorio.svg" },
];

export function getPixelDimension(matrixSize: number, state: RenderState): number {
  return (matrixSize + state.border * 2) * state.scale;
}

export function buildSvg(modules: Uint8Array, size: number, state: RenderState): string {
  const totalSize = size + state.border * 2;
  const dimension =
    state.pixelSize != null && state.pixelSize > 0
      ? state.pixelSize
      : getPixelDimension(size, state);
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
    `<svg xmlns="http://www.w3.org/2000/svg" width="${dimension}" height="${dimension}" viewBox="0 0 ${totalSize} ${totalSize}" role="img" aria-label="Generated QR code">`,
    background,
    `<path fill="${state.foreground}" d="${pathData}" />`,
    logo,
    "</svg>",
  ].join("");
}

export function buildLogoSvg(matrixSize: number, state: RenderState): string {
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

export function getLogoLayout(
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

export function createFilename(content: string): string {
  const cleaned = content
    .trim()
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return cleaned || "qr-code";
}

export function buildUrlPayload(builder: PayloadBuilders["url"]): string {
  return normalizeUrl(builder.value);
}

export function buildWifiPayload(builder: PayloadBuilders["wifi"]): string {
  const security = builder.encryption;
  const parts = [`WIFI:T:${security}`, `S:${escapeWifiValue(builder.ssid)}`];

  if (security !== "nopass") {
    parts.push(`P:${escapeWifiValue(builder.password)}`);
  }

  if (builder.hidden) {
    parts.push("H:true");
  }

  return `${parts.join(";")};;`;
}

export function buildVCardPayload(builder: PayloadBuilders["contact"]): string {
  const fullName = builder.fullName.trim() || "Contact";
  const { firstName, lastName } = splitFullName(fullName);
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${escapeVCardValue(lastName)};${escapeVCardValue(firstName)};;;`,
    `FN:${escapeVCardValue(fullName)}`,
  ];

  if (builder.organization.trim()) {
    lines.push(`ORG:${escapeVCardValue(builder.organization.trim())}`);
  }

  if (builder.title.trim()) {
    lines.push(`TITLE:${escapeVCardValue(builder.title.trim())}`);
  }

  if (builder.phone.trim()) {
    lines.push(`TEL:${escapeVCardValue(builder.phone.trim())}`);
  }

  if (builder.email.trim()) {
    lines.push(`EMAIL:${escapeVCardValue(builder.email.trim())}`);
  }

  if (builder.url.trim()) {
    lines.push(`URL:${escapeVCardValue(normalizeUrl(builder.url))}`);
  }

  lines.push("END:VCARD");

  return lines.join("\n");
}

export function normalizeUrl(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function escapeWifiValue(value: string): string {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

export function escapeVCardValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);

  if (parts.length <= 1) {
    return { firstName: parts[0] ?? fullName, lastName: "" };
  }

  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
  };
}
