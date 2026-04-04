import { join } from 'node:path';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { PapraClient } from './papra-client.js';
import { OcrProcessor } from './ocr/processor.js';
import { ProcessedState } from './ocr/state.js';
import { OcrPoller } from './ocr/poller.js';

const config = loadConfig();
const log = createLogger(config.logLevel);

log.info(
    {
        model: config.ocr.model,
        concurrency: config.ocr.concurrency,
        pollInterval: config.ocr.pollIntervalSeconds,
    },
    'Starting papra-ai',
);

const papra = new PapraClient(config.papra, log);
const processor = new OcrProcessor(config, papra, log);
const state = await ProcessedState.load(
    join(config.dataDir, 'processed.json'),
    log,
);
const poller = new OcrPoller(config, papra, processor, state, log);

poller.start();

process.on('SIGINT', () => {
    log.info('Shutting down');
    poller.stop();
    process.exit(0);
});

process.on('SIGTERM', () => {
    log.info('Shutting down');
    poller.stop();
    process.exit(0);
});
