# QR Code Generator

QR code generator powered by Rust WebAssembly.

## Stack

- Vite + TypeScript for the static site shell
- Rust + `wasm-bindgen` for QR matrix generation
- `qrcodegen` for the QR encoding algorithm

## Commands

```bash
npm install
npm run dev
npm run build
```

`npm run build` compiles the Rust crate to WebAssembly first, then emits a static site into `dist/`.

## Headless CLI

`bin/qr.ts` generates the **same styled SVG** as the web UI without a browser, for
scripts and AI agents. It reuses the shared render core (`src/qr-core.ts`) and the
Rust/WASM encoder, so its output cannot drift from the studio.

It requires the WASM engine to be built once (`npm run wasm:dev` or `npm run wasm`)
and Node >= 22 (it runs TypeScript directly via native type-stripping).

```bash
# URL QR with a preset logo, written to a file
node bin/qr.ts --url arxiv.org/abs/2506.00000 --logo arxiv --out 02_arxiv.svg

# Raw payload to stdout
node bin/qr.ts --content "WIFI:T:WPA;S:Lab;P:secret;;"

# List preset logos / full help
node bin/qr.ts --list-logos
node bin/qr.ts --help
```

Notes:

- Exactly one of `--url` (scheme auto-added) or `--content` (verbatim) is required.
- A center logo forces `high` error correction unless you override `--ecc`.
- Output is SVG only; rasterize downstream if you need PNG.
- Errors go to stderr with a non-zero exit; there are no silent fallbacks.
