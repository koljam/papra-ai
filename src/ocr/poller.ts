import type { Config } from '../config.js';
import type { Logger } from '../logger.js';
import { PapraClient } from '../papra-client.js';
import { OcrProcessor } from './processor.js';
import { ProcessedState } from './state.js';

export class OcrPoller {
    private config: Config;
    private papra: PapraClient;
    private processor: OcrProcessor;
    private state: ProcessedState;
    private log: Logger;
    private timer: ReturnType<typeof setInterval> | null = null;
    private seeded = false;

    constructor(
        config: Config,
        papra: PapraClient,
        processor: OcrProcessor,
        state: ProcessedState,
        log: Logger,
    ) {
        this.config = config;
        this.papra = papra;
        this.processor = processor;
        this.state = state;
        this.log = log.child({ module: 'poller' });
        this.seeded = state.size > 0;
    }

    start(): void {
        const intervalMs = this.config.ocr.pollIntervalSeconds * 1000;
        this.log.info(
            { intervalSeconds: this.config.ocr.pollIntervalSeconds },
            'Starting document poller',
        );

        // Run immediately, then on interval
        this.poll();
        this.timer = setInterval(() => this.poll(), intervalMs);
    }

    stop(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    private async poll(): Promise<void> {
        try {
            const documents = await this.papra.listDocuments();

            // On first run with processExisting=false, seed all current document IDs
            // into state so only future documents get OCR'd
            if (!this.seeded && !this.config.ocr.processExisting) {
                const existing = documents.filter(
                    (doc) => doc.mimeType === 'application/pdf',
                );
                if (existing.length > 0) {
                    this.log.info(
                        { count: existing.length },
                        'OCR_PROCESS_EXISTING=false: skipping existing documents, only new uploads will be processed',
                    );
                    for (const doc of existing) {
                        await this.state.add(doc.id);
                    }
                }
                this.seeded = true;
                return;
            }
            this.seeded = true;

            const pending = documents.filter(
                (doc) =>
                    doc.mimeType === 'application/pdf' &&
                    !this.state.has(doc.id),
            );

            if (pending.length === 0) {
                this.log.debug('No new documents to process');
                return;
            }

            this.log.info(
                { count: pending.length },
                'Found new documents to process',
            );

            for (const doc of pending) {
                try {
                    await this.processor.processDocument(doc.id);
                    await this.state.add(doc.id);
                } catch (err) {
                    this.log.error(
                        { err, documentId: doc.id, name: doc.name },
                        'Failed to process document',
                    );
                }
            }
        } catch (err) {
            this.log.error({ err }, 'Poll cycle failed');
        }
    }
}
