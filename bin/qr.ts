#!/usr/bin/env node
// Headless CLI for Vector QR Studio.
//
// Generates the same styled SVG the browser UI produces, with no browser:
// it reuses the shared render core (`src/qr-core.ts`) and the Rust/WASM
// encoder (`src/wasm/pkg`). Intended for agents and scripts that need
// house-style QR codes as files.
//
// Runs directly on Node >= 22 via native TypeScript type-stripping:
//   node bin/qr.ts --url https://example.com --logo arxiv --out qr.svg
//
// It deliberately emits SVG only. PNG export in the UI depends on a browser
// canvas; rasterize the SVG downstream (e.g. with `rsvg-convert` or `sharp`)
// if you need PNG.

import { readFile, writeFile, stat, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildSvg,
  buildUrlPayload,
  createFilename,
  PRESET_LOGOS,
  RENDER_DEFAULTS,
  type ErrorCorrection,
  type RenderState,
} from "../src/qr-core.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WASM_DIR = path.join(REPO_ROOT, "src", "wasm", "pkg");
const LOGO_DIR = path.join(REPO_ROOT, "assets", "logo");

const ECC_VALUES: ErrorCorrection[] = ["low", "medium", "quartile", "high"];

const LOGO_MIME: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

const HELP = `Vector QR Studio — headless QR code generator

Usage:
  node bin/qr.ts (--url <url> | --content <text>) [options]

Content (exactly one required):
  -u, --url <url>          URL payload (adds https:// if no scheme is present)
  -c, --content <text>     Raw payload, used verbatim

Styling (defaults match the studio):
  -l, --logo <id|path>     Center logo: a preset id or a path to an image file
  -e, --ecc <level>        Error correction: low | medium | quartile | high
                           (defaults to high when a logo is set, else medium)
      --fg <color>         Foreground/module color   (default ${RENDER_DEFAULTS.foreground})
      --bg <color>         Background color           (default ${RENDER_DEFAULTS.background})
      --transparent        Transparent background (no background rect)
      --border <n>         Quiet-zone modules         (default ${RENDER_DEFAULTS.border})
      --scale <n>          Pixels per module          (default ${RENDER_DEFAULTS.scale})
      --size <px>          Fixed output px (width=height), ignores --scale.
                           Use to keep a batch the same display size despite
                           different payload lengths.
      --logo-size <n>      Logo size, % of QR         (default ${RENDER_DEFAULTS.logoSize})
      --logo-padding-x <n> Logo patch padding X, %    (default ${RENDER_DEFAULTS.logoPaddingX})
      --logo-padding-y <n> Logo patch padding Y, %    (default ${RENDER_DEFAULTS.logoPaddingY})

Output:
  -o, --out <file>         Write SVG to this path (default: stdout)
      --list-logos         List available preset logo ids and exit
  -h, --help               Show this help and exit

Examples:
  node bin/qr.ts --url arxiv.org/abs/2506.00000 --logo arxiv --out 02_arxiv.svg
  node bin/qr.ts --url github.com/me/proj --logo github -o 01_github.svg
  node bin/qr.ts --content "WIFI:T:WPA;S:Lab;P:secret;;" -o wifi.svg
`;

function fail(message: string): never {
  process.stderr.write(`qr: ${message}\n`);
  process.exit(1);
}

type ParsedArgs = {
  content?: string;
  url?: string;
  logo?: string;
  ecc?: string;
  fg?: string;
  bg?: string;
  transparent: boolean;
  border?: string;
  scale?: string;
  size?: string;
  logoSize?: string;
  logoPaddingX?: string;
  logoPaddingY?: string;
  out?: string;
  listLogos: boolean;
  help: boolean;
};

const VALUE_FLAGS: Record<string, keyof ParsedArgs> = {
  "--url": "url",
  "-u": "url",
  "--content": "content",
  "-c": "content",
  "--logo": "logo",
  "-l": "logo",
  "--ecc": "ecc",
  "-e": "ecc",
  "--fg": "fg",
  "--bg": "bg",
  "--border": "border",
  "--scale": "scale",
  "--size": "size",
  "--logo-size": "logoSize",
  "--logo-padding-x": "logoPaddingX",
  "--logo-padding-y": "logoPaddingY",
  "--out": "out",
  "-o": "out",
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { transparent: false, listLogos: false, help: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "-h" || arg === "--help") {
      parsed.help = true;
      continue;
    }
    if (arg === "--transparent") {
      parsed.transparent = true;
      continue;
    }
    if (arg === "--list-logos") {
      parsed.listLogos = true;
      continue;
    }

    const eq = arg.indexOf("=");
    const name = eq === -1 ? arg : arg.slice(0, eq);
    const key = VALUE_FLAGS[name];

    if (!key) {
      fail(`unknown argument "${arg}". Run with --help for usage.`);
    }

    let value: string;
    if (eq !== -1) {
      value = arg.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next === undefined) {
        fail(`missing value for ${name}.`);
      }
      value = next;
      i += 1;
    }

    (parsed[key] as string) = value;
  }

  return parsed;
}

function parseNumber(value: string | undefined, fallback: number, label: string): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    fail(`${label} must be a number, got "${value}".`);
  }
  return parsed;
}

async function resolveLogoDataUrl(value: string): Promise<string> {
  const preset = PRESET_LOGOS.find((logo) => logo.id === value);
  const filePath = preset
    ? path.join(LOGO_DIR, preset.file)
    : path.resolve(process.cwd(), value);

  let bytes: Buffer;
  try {
    bytes = await readFile(filePath);
  } catch {
    if (preset) {
      fail(`preset logo "${value}" not found at ${filePath}.`);
    }
    fail(
      `logo "${value}" is neither a known preset id nor a readable file. ` +
        `Run --list-logos to see presets.`,
    );
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = LOGO_MIME[ext];
  if (!mime) {
    fail(`unsupported logo type "${ext}". Use SVG, PNG, JPEG, WebP, or GIF.`);
  }

  return `data:${mime};base64,${bytes.toString("base64")}`;
}

async function listLogos(): Promise<void> {
  process.stdout.write("Preset logos:\n");
  for (const logo of PRESET_LOGOS) {
    process.stdout.write(`  ${logo.id.padEnd(10)} ${logo.label}\n`);
  }

  // Surface any extra files on disk that are not in the registry, so the list
  // never silently hides usable logos.
  try {
    const onDisk = (await readdir(LOGO_DIR))
      .filter((name) => path.extname(name).toLowerCase() in LOGO_MIME)
      .map((name) => path.basename(name, path.extname(name)))
      .filter((id) => !PRESET_LOGOS.some((logo) => logo.id === id));
    if (onDisk.length > 0) {
      process.stdout.write(`\nOther files in assets/logo: ${onDisk.join(", ")}\n`);
    }
  } catch {
    // assets/logo missing is not fatal for listing presets.
  }
}

async function loadEncoder(): Promise<(content: string, ecc: string) => { size: number; modules: () => Uint8Array }> {
  const jsPath = path.join(WASM_DIR, "qr_engine.js");
  const wasmPath = path.join(WASM_DIR, "qr_engine_bg.wasm");

  let mod: typeof import("../src/wasm/pkg/qr_engine.js");
  let wasmBytes: Buffer;
  try {
    wasmBytes = await readFile(wasmPath);
    mod = await import(jsPath);
  } catch {
    fail(
      `WASM engine not found in ${WASM_DIR}. ` +
        `Build it first with: npm run wasm:dev (dev) or npm run wasm (release).`,
    );
  }

  await mod.default({ module_or_path: wasmBytes });
  return mod.generate_qr as never;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(HELP);
    return;
  }
  if (args.listLogos) {
    await listLogos();
    return;
  }

  if (args.url !== undefined && args.content !== undefined) {
    fail("pass either --url or --content, not both.");
  }

  let content: string;
  if (args.url !== undefined) {
    content = buildUrlPayload({ value: args.url });
  } else if (args.content !== undefined) {
    content = args.content;
  } else {
    fail("provide content with --url <url> or --content <text>. Run --help for usage.");
  }
  if (content.trim() === "") {
    fail("content is empty after normalization.");
  }

  const hasLogo = args.logo !== undefined;
  const logoDataUrl = hasLogo ? await resolveLogoDataUrl(args.logo as string) : null;

  // Mirror the studio: a center logo punches a hole in the matrix, so it needs
  // high error correction to stay scannable. Honor an explicit --ecc, but warn
  // when the user pairs a logo with weaker correction.
  let ecc: ErrorCorrection;
  if (args.ecc !== undefined) {
    if (!ECC_VALUES.includes(args.ecc as ErrorCorrection)) {
      fail(`--ecc must be one of ${ECC_VALUES.join(", ")}.`);
    }
    ecc = args.ecc as ErrorCorrection;
    if (hasLogo && ecc !== "high") {
      process.stderr.write(
        `qr: warning: logo set with --ecc ${ecc}; the studio uses "high" for logos.\n`,
      );
    }
  } else {
    ecc = hasLogo ? "high" : "medium";
  }

  const state: RenderState = {
    background: args.bg ?? RENDER_DEFAULTS.background,
    border: parseNumber(args.border, RENDER_DEFAULTS.border, "--border"),
    foreground: args.fg ?? RENDER_DEFAULTS.foreground,
    logoDataUrl,
    logoPaddingX: parseNumber(args.logoPaddingX, RENDER_DEFAULTS.logoPaddingX, "--logo-padding-x"),
    logoPaddingY: parseNumber(args.logoPaddingY, RENDER_DEFAULTS.logoPaddingY, "--logo-padding-y"),
    logoSize: parseNumber(args.logoSize, RENDER_DEFAULTS.logoSize, "--logo-size"),
    scale: parseNumber(args.scale, RENDER_DEFAULTS.scale, "--scale"),
    pixelSize: args.size !== undefined ? parseNumber(args.size, 0, "--size") : null,
    transparent: args.transparent,
  };

  const generateQr = await loadEncoder();

  let result: { size: number; modules: () => Uint8Array };
  try {
    result = generateQr(content, ecc);
  } catch (error) {
    fail(typeof error === "string" ? error : `failed to encode QR code: ${String(error)}`);
  }

  const svg = buildSvg(result.modules(), result.size, state);

  if (args.out === undefined) {
    process.stdout.write(svg);
    if (process.stdout.isTTY) {
      process.stdout.write("\n");
    }
    return;
  }

  // Allow --out to be a directory; name the file from the payload like the UI.
  let outPath = path.resolve(process.cwd(), args.out);
  try {
    if ((await stat(outPath)).isDirectory()) {
      outPath = path.join(outPath, `${createFilename(args.url ?? content)}.svg`);
    }
  } catch {
    // Path does not exist yet; treat --out as the target file.
  }

  await writeFile(outPath, svg, "utf8");
  process.stderr.write(`qr: wrote ${path.relative(process.cwd(), outPath) || outPath}\n`);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
