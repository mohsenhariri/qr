.PHONY: install dev check test build

install:
	npm install

dev:
	npm run dev

check:
	npm run check

test:
	cargo test --manifest-path wasm/qr-engine/Cargo.toml

build:
	npm run build
