import type { Config } from '../config.js';
import type { Logger } from '../logger.js';

function buildMetadataPrompt(nameFormat?: string): string {
    const nameFormatSection = nameFormat
        ? `- Format the name as: ${nameFormat}
  where each placeholder is filled from the document content. Omit placeholders you cannot fill.
`
        : '';

    return `You are a document metadata extractor. Given the text content of a document's first page, extract a descriptive name, the document date, and applicable tags.

Rules:

name:
- Create a short, descriptive name that helps identify this specific document in a list.
- Include the sender or issuing organization.
- Include the document type (e.g. invoice, contract, notice, certificate, receipt).
- Optionally include a key identifier like a reference number, invoice number, policy number, or time period.
- Do NOT just copy the first heading or subject line verbatim -- synthesize a meaningful, identifiable name from the document content.
${nameFormatSection}- Keep it concise: aim for under 80 characters.
- Use the document's language for the name.
- If there is truly not enough information to construct a name, return null.

date:
- The document's date (e.g. letter date, invoice date, report date, publication date).
- Return in ISO 8601 format (e.g. "2024-01-15T00:00:00.000Z").
- If there is no clear date, return null.

tags:
- Select ONLY from the provided list of available tags.
- Only apply tags that clearly match the document's content or category.
- Be selective: pick the 1-3 most relevant tags rather than every tag that could loosely apply.
- If a tag looks like a workflow or status label (e.g. inbox, to-do, done, pending) rather than a content category, do not apply it unless the document text explicitly indicates that status.
- Return an empty array if no tags clearly apply or none are provided.

General:
- Do NOT guess or fabricate values -- only extract what is clearly present in the text.`;
}

function buildMetadataSchema(nameFormat?: string) {
    const nameDesc = nameFormat
        ? `A short, descriptive document name formatted as: ${nameFormat} — or null if not determinable`
        : 'A short, descriptive document name including sender and document type, or null if not determinable';

    return {
        type: 'json_schema' as const,
        json_schema: {
            name: 'document_metadata',
            schema: {
                type: 'object',
                properties: {
                    name: {
                        type: ['string', 'null'],
                        description: nameDesc,
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
                required: ['name', 'date', 'tags'],
                additionalProperties: false,
            },
        },
    };
}

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

    const url = `${config.apiUrl}/chat/completions`;

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
    name: string | null;
    date: string | null;
    tags: string[];
}

export async function extractDocumentMetadata(
    text: string,
    config: Config['ocr'],
    log: Logger,
    availableTagNames?: string[],
    nameFormat?: string,
): Promise<DocumentMetadata> {
    const tagSection =
        availableTagNames && availableTagNames.length > 0
            ? `\n\nAvailable tags: ${availableTagNames.join(', ')}`
            : '';

    const messages: ChatMessage[] = [
        { role: 'system', content: buildMetadataPrompt(nameFormat) },
        {
            role: 'user',
            content: `Extract the name, date, and applicable tags from this document text:${tagSection}\n\n${text}`,
        },
    ];

    const url = `${config.apiUrl}/chat/completions`;

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: config.model,
            messages,
            response_format: buildMetadataSchema(nameFormat),
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
