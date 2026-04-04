import type { Config } from '../config.js';
import type { Logger } from '../logger.js';
import { PapraClient } from '../papra-client.js';
import { renderPdfPages } from './pdf-renderer.js';
import { extractTextFromImage, extractDocumentMetadata } from './llm-client.js';
import type { PapraTag } from '../papra-client.js';
import { extname } from 'node:path';

export class OcrProcessor {
    private papra: PapraClient;
    private config: Config;
    private log: Logger;

    constructor(config: Config, papra: PapraClient, log: Logger) {
        this.config = config;
        this.papra = papra;
        this.log = log.child({ module: 'ocr-processor' });
    }

    async processDocument(documentId: string): Promise<void> {
        const log = this.log.child({ documentId });

        log.info('Starting OCR processing');

        const doc = await this.papra.getDocument(documentId);

        if (doc.mimeType !== 'application/pdf') {
            log.info({ mimeType: doc.mimeType }, 'Skipping non-PDF document');
            return;
        }

        log.info({ name: doc.name }, 'Downloading document');
        const pdfBuffer = await this.papra.downloadDocument(documentId);

        log.info('Rendering PDF pages');
        const pages = await renderPdfPages(
            pdfBuffer,
            { scale: this.config.ocr.imageScale },
            log,
        );

        if (pages.length === 0) {
            log.warn('No pages rendered from PDF');
            return;
        }

        const { concurrency } = this.config.ocr;
        log.info(
            { pageCount: pages.length, concurrency },
            'Extracting text from pages',
        );
        const pageTexts = await this.processPages(
            pages.map((p) => p.image),
            concurrency,
            log,
        );

        const fullText = pageTexts.filter(Boolean).join('\n\n---\n\n');

        if (!fullText.trim()) {
            log.warn('No text extracted from document');
            return;
        }

        const updates: {
            content: string;
            name?: string;
            documentDate?: string;
        } = { content: fullText };

        const { extractName, extractDate, extractTags } = this.config.ocr;
        const firstPageText = pageTexts[0];
        const needsMetadata = extractName || extractDate || extractTags;

        if (firstPageText && needsMetadata) {
            try {
                let availableTags: PapraTag[] = [];
                if (extractTags) {
                    availableTags = await this.papra.listTags();
                    log.debug(
                        { tagCount: availableTags.length },
                        'Fetched available tags',
                    );
                }

                const tagNames = availableTags.map((t) => t.name);
                const metadata = await extractDocumentMetadata(
                    firstPageText,
                    this.config.ocr,
                    log,
                    tagNames.length > 0 ? tagNames : undefined,
                    this.config.ocr.nameFormat,
                );

                if (extractName && metadata.name) {
                    const ext = extname(doc.name) || '.pdf';
                    updates.name = `${metadata.name}${ext}`;
                    log.info(
                        { newName: updates.name },
                        'Extracted document name',
                    );
                }

                if (extractDate && metadata.date) {
                    updates.documentDate = metadata.date;
                    log.info(
                        { documentDate: metadata.date },
                        'Extracted document date',
                    );
                }

                if (extractTags && metadata.tags.length > 0) {
                    const tagMap = new Map(
                        availableTags.map((t) => [t.name.toLowerCase(), t.id]),
                    );

                    for (const tagName of metadata.tags) {
                        const tagId = tagMap.get(tagName.toLowerCase());
                        if (tagId) {
                            await this.papra.addTagToDocument(
                                documentId,
                                tagId,
                            );
                            log.info({ tagName }, 'Added tag to document');
                        } else {
                            log.warn(
                                { tagName },
                                'LLM returned unknown tag, skipping',
                            );
                        }
                    }
                }
            } catch (err) {
                log.error({ err }, 'Failed to extract document metadata');
            }
        }

        await this.papra.updateDocument(documentId, updates);
        log.info(
            { textLength: fullText.length, pages: pages.length },
            'OCR complete',
        );
    }

    private async processPages(
        images: Buffer[],
        concurrency: number,
        log: Logger,
    ): Promise<string[]> {
        const results: string[] = new Array(images.length).fill('');

        for (let i = 0; i < images.length; i += concurrency) {
            const batch = images.slice(i, i + concurrency);
            const batchResults = await Promise.all(
                batch.map((image, j) => {
                    const pageNum = i + j + 1;
                    log.info(
                        { page: pageNum, total: images.length },
                        'Processing page',
                    );
                    return extractTextFromImage(
                        image,
                        this.config.ocr,
                        log,
                    ).catch((err) => {
                        log.error(
                            { page: pageNum, err },
                            'Failed to extract text from page',
                        );
                        return '';
                    });
                }),
            );

            for (let j = 0; j < batchResults.length; j++) {
                results[i + j] = batchResults[j];
            }
        }

        return results;
    }
}
