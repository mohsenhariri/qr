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
