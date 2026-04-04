# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

papra-ai is a companion service for [Papra](https://github.com/papra-hq/papra) that adds LLM-powered OCR. It polls Papra for PDF documents, renders pages to images via pdf.js + @napi-rs/canvas, sends them to any OpenAI-compatible vision API, and writes structured markdown back to Papra. State is persisted as a JSON file (no database).

## Commands

```bash
pnpm install              # install dependencies
pnpm dev                  # dev server with hot reload (loads .env automatically)
pnpm build                # compile TypeScript to dist/
pnpm start                # run production build (node dist/index.js)
pnpm format               # format code with prettier
pnpm docker:build         # build Docker image locally
```

No test framework is configured yet.

## Architecture

Single-package TypeScript application (ES modules, Node >= 22).

**Entry point:** `src/index.ts` — loads config, wires up all components, starts the poller, handles SIGINT/SIGTERM.

**Core flow:** `OcrPoller` → `OcrProcessor` → `PapraClient` + `LlmClient`

- `src/config.ts` — Zod schema that validates env vars into a typed `Config` object. All configuration is environment-variable-driven.
- `src/logger.ts` — Pino logger factory.
- `src/papra-client.ts` — HTTP client for the Papra REST API (list/get/download/update documents).
- `src/ocr/poller.ts` — Interval-based polling loop that discovers unprocessed documents.
- `src/ocr/processor.ts` — Orchestrates per-document OCR: download PDF → render pages → call vision API → update Papra.
- `src/ocr/llm-client.ts` — Calls the OpenAI-compatible `/chat/completions` endpoint with base64 images.
- `src/ocr/pdf-renderer.ts` — Converts PDF pages to PNG buffers using pdfjs-dist + @napi-rs/canvas.
- `src/ocr/state.ts` — `ProcessedState` class that persists a Set of processed document IDs to `data/processed.json`.

## Code Conventions

- **Formatting:** Prettier with 4-space indentation and single quotes (`.prettierrc`).
- **Imports:** Use `.js` extensions in TypeScript imports (required by Node16 module resolution).
- **TypeScript:** Strict mode enabled, target ES2023, Node16 module resolution.
- **No linter** is configured (no ESLint).
