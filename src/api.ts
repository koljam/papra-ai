import { createServer } from 'node:http';
import type { Logger } from './logger.js';
import type { ProcessedState } from './ocr/state.js';

export function startApiServer(
    port: number,
    state: ProcessedState,
    log: Logger,
): void {
    const apiLog = log.child({ module: 'api' });

    const server = createServer(async (req, res) => {
        const match = req.url?.match(/^\/reprocess\/(.+)$/);

        if (req.method === 'POST' && match) {
            const documentId = match[1];

            try {
                const removed = await state.remove(documentId);

                if (removed) {
                    apiLog.info({ documentId }, 'Marked for reprocessing');
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'queued', documentId }));
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(
                        JSON.stringify({
                            error: 'not_found',
                            message: 'Document not in processed list',
                        }),
                    );
                }
            } catch (err) {
                apiLog.error({ err, documentId }, 'Failed to mark for reprocessing');
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'internal_error' }));
            }
            return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'not_found' }));
    });

    server.listen(port, () => {
        apiLog.info({ port }, 'API server listening');
    });
}
