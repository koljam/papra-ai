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
| `DATA_DIR`                  | no       | `./data`                      | Directory for persisting processed document state      |
| `LOG_LEVEL`                 | no       | `info`                        | Log level (`debug`, `info`, `warn`, `error`)           |

### Re-OCR all documents

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
