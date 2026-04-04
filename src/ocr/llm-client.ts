import type { Config } from '../config.js';
import type { Logger } from '../logger.js';

const METADATA_SYSTEM_PROMPT = `You are a document metadata extractor. Given the text content of a document's first page, extract the document title, date, and applicable tags.

Rules:
- title: The main title, heading, or name of the document as it appears in the text. If there is no clear title, return null.
- date: The document's date (e.g. letter date, invoice date, report date, publication date). Return in ISO 8601 format (e.g. "2024-01-15T00:00:00.000Z"). If there is no clear date, return null.
- tags: Select ONLY from the provided list of available tags. Pick tags that clearly apply to the document content. Return an empty array if no tags apply or none are provided.
- Do NOT guess or fabricate values -- only extract what is clearly present in the text.`;

const METADATA_SCHEMA = {
    type: 'json_schema' as const,
    json_schema: {
        name: 'document_metadata',
        schema: {
            type: 'object',
            properties: {
                title: {
                    type: ['string', 'null'],
                    description:
                        'The document title or name as it appears on the document, or null if not determinable',
                },
                date: {
                    type: ['string', 'null'],
                    description:
                        'The document date in ISO 8601 format (e.g. 2024-01-15T00:00:00.000Z), or null if not determinable',
                },
                tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description:
                        'Tag names from the available set that apply to this document, or empty array if none apply',
                },
            },
            required: ['title', 'date', 'tags'],
            additionalProperties: false,
        },
    },
};

const SYSTEM_PROMPT = `You are a document OCR assistant. Extract ALL text from the provided document image(s).

Rules:
- Output the text as clean markdown
- Preserve the document's structure: headings, paragraphs, tables, lists
- For tables, use markdown table syntax
- Preserve the original language -- do NOT translate
- Do NOT add commentary, summaries, or explanations
- Do NOT wrap the output in code blocks
- If a page is blank or unreadable, skip it silently`;

interface ChatMessage {
    role: 'system' | 'user';
    content:
        | string
        | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

export async function extractTextFromImage(
    image: Buffer,
    config: Config['ocr'],
    log: Logger,
): Promise<string> {
    const base64 = image.toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;

    const messages: ChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        {
            role: 'user',
            content: [
                {
                    type: 'image_url',
                    image_url: { url: dataUrl },
                },
                {
                    type: 'text',
                    text: 'Extract all text from this document page.',
                },
            ],
        },
    ];

    const url = `${config.apiUrl.replace(/\/$/, '')}/chat/completions`;

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: config.model,
            messages,
            max_tokens: 4096,
            temperature: 0,
        }),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`LLM API error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as {
        choices: Array<{ message: { content: string } }>;
    };

    const text = data.choices[0]?.message?.content ?? '';

    log.debug({ textLength: text.length }, 'LLM extraction complete');
    return text;
}

export interface DocumentMetadata {
    title: string | null;
    date: string | null;
    tags: string[];
}

export async function extractDocumentMetadata(
    text: string,
    config: Config['ocr'],
    log: Logger,
    availableTagNames?: string[],
): Promise<DocumentMetadata> {
    const tagSection =
        availableTagNames && availableTagNames.length > 0
            ? `\n\nAvailable tags: ${availableTagNames.join(', ')}`
            : '';

    const messages: ChatMessage[] = [
        { role: 'system', content: METADATA_SYSTEM_PROMPT },
        {
            role: 'user',
            content: `Extract the title, date, and applicable tags from this document text:${tagSection}\n\n${text}`,
        },
    ];

    const url = `${config.apiUrl.replace(/\/$/, '')}/chat/completions`;

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: config.model,
            messages,
            response_format: METADATA_SCHEMA,
            temperature: 0,
        }),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`LLM API error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as {
        choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices[0]?.message?.content ?? '{}';
    const metadata = JSON.parse(content) as DocumentMetadata;

    log.debug({ metadata }, 'Metadata extraction complete');
    return metadata;
}
