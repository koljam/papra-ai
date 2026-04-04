import type { Config } from '../config.js';
import type { Logger } from '../logger.js';

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
