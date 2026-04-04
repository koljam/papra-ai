import type { Config } from '../config.js';
import type { Logger } from '../logger.js';
import { PapraClient } from '../papra-client.js';
import { renderPdfPages } from './pdf-renderer.js';
import { extractTextFromImage } from './llm-client.js';

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

        await this.papra.updateDocumentContent(documentId, fullText);
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
