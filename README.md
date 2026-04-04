# papra-ai

A companion service for [Papra](https://github.com/papra-hq/papra) that adds LLM-powered OCR to your document library.

## Features

### LLM OCR

Polls Papra for PDF documents, converts pages to images, sends them to any OpenAI-compatible vision API, and writes structured markdown back to Papra.

- **Polling-based** -- discovers and processes new PDFs automatically
- **Any OpenAI-compatible API** -- OpenRouter, Ollama, OpenAI, etc.
- **Markdown output** -- preserves headings, tables, lists, and document structure
- **Persistent state** -- tracks processed documents so work is never repeated
- **First-run control** -- choose whether to OCR all existing documents or only new uploads

### Document Metadata Extraction

After OCR, the first page text is sent back to the LLM to automatically extract:

- **Document name** -- renames the document in Papra to match its actual title (e.g. "scan_001.pdf" becomes "Invoice #1234.pdf")
- **Document date** -- sets the document date in Papra based on dates found in the text
- **Tags** -- matches document content against your existing Papra tags and applies any that fit

Each extraction type can be individually enabled or disabled via environment variables. All three are enabled by default.

### Reprocess API

A lightweight HTTP server runs alongside the poller, allowing you to trigger reprocessing of specific documents:

```bash
curl -X POST http://localhost:7777/reprocess/doc_abc123
```

This removes the document from the processed list so it gets picked up on the next poll cycle. Useful for re-extracting metadata after updating your tags or fixing a bad OCR result.

## Quick Start

Add to your Papra `docker-compose.yml`:

```yaml
papra-ai:
    image: ghcr.io/koljam/papra-ai:latest
    environment:
        PAPRA_API_URL: http://papra:1221
        PAPRA_API_KEY: ppapi_your_key_here
        PAPRA_ORG_ID: org_your_org_id
        OCR_API_URL: https://openrouter.ai/api/v1
        OCR_API_KEY: sk-or-v1-your_key_here
        OCR_MODEL: google/gemini-2.5-flash
    ports:
        - 7777:7777 # reprocess API
    volumes:
        - papra-ai-data:/app/data # persist processed state across restarts
```

> **Important:** Set `DOCUMENTS_CONTENT_EXTRACTION_ENABLED=false` in your Papra configuration to disable the built-in Tesseract OCR. Running both Tesseract and papra-ai simultaneously will cause race conditions.

> **First run with many existing documents?** Set `OCR_PROCESS_EXISTING=false` to skip them and only process documents uploaded after the service starts. You can always re-OCR later by deleting the `data/processed.json` file.

## Configuration

| Variable                    | Required | Default                       | Description                                            |
| --------------------------- | -------- | ----------------------------- | ------------------------------------------------------ |
| `PAPRA_API_URL`             | yes      | --                            | Papra instance URL (e.g. `http://papra:1221`)          |
| `PAPRA_API_KEY`             | yes      | --                            | Papra API key with document read/write access          |
| `PAPRA_ORG_ID`              | yes      | --                            | Papra organization ID                                  |
| `OCR_API_URL`               | yes      | --                            | OpenAI-compatible vision API base URL                  |
| `OCR_API_KEY`               | yes      | --                            | API key for the vision model provider                  |
| `OCR_MODEL`                 | no       | `google/gemini-2.5-flash` | Vision model identifier                                |
| `OCR_CONCURRENCY`           | no       | `3`                           | Number of PDF pages processed in parallel per document |
| `OCR_IMAGE_SCALE`           | no       | `2`                           | Scale factor for PDF page rendering                    |
| `OCR_POLL_INTERVAL_SECONDS` | no       | `60`                          | Seconds between polling for new documents              |
| `OCR_PROCESS_EXISTING`      | no       | `true`                        | Set to `false` to skip existing documents on first run |
| `OCR_EXTRACT_NAME`          | no       | `true`                        | Extract document title from first page and rename      |
| `OCR_EXTRACT_DATE`          | no       | `true`                        | Extract document date from first page                  |
| `OCR_EXTRACT_TAGS`          | no       | `true`                        | Match and apply existing Papra tags to documents       |
| `API_PORT`                  | no       | `7777`                        | Port for the reprocess API server                      |
| `DATA_DIR`                  | no       | `./data`                      | Directory for persisting processed document state      |
| `LOG_LEVEL`                 | no       | `info`                        | Log level (`debug`, `info`, `warn`, `error`)           |

### Reprocessing documents

To reprocess a single document:

```bash
curl -X POST http://localhost:7777/reprocess/DOCUMENT_ID
```

To re-process everything from scratch, stop the service, delete `data/processed.json`, and restart with `OCR_PROCESS_EXISTING=true` (the default).

## Development

```bash
pnpm install
pnpm dev          # starts with hot reload (.env loaded automatically)
pnpm build        # builds for production
pnpm docker:build # builds Docker image
```

## License

MIT
