import { createCanvas } from '@napi-rs/canvas';
import type { Logger } from '../logger.js';

export interface RenderedPage {
    pageNumber: number;
    image: Buffer;
}

async function getPdfjs() {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        const { createRequire } = await import('node:module');
        const require = createRequire(import.meta.url);
        pdfjs.GlobalWorkerOptions.workerSrc =
            require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
    }
    return pdfjs;
}

export async function renderPdfPages(
    pdfBuffer: ArrayBuffer,
    options: { scale: number },
    log: Logger,
): Promise<RenderedPage[]> {
    const pdfjs = await getPdfjs();

    const pdf = await pdfjs.getDocument({
        data: new Uint8Array(pdfBuffer),
        isEvalSupported: false,
        useSystemFonts: true,
        disableFontFace: true,
    }).promise;

    const { numPages } = pdf;
    log.info({ numPages }, 'Rendering PDF pages');

    const pages: RenderedPage[] = [];

    for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: options.scale });

        const canvas = createCanvas(
            Math.floor(viewport.width),
            Math.floor(viewport.height),
        );
        const context = canvas.getContext('2d');

        await page.render({
            // @ts-expect-error -- pdfjs expects DOM CanvasRenderingContext2D, @napi-rs/canvas is compatible at runtime
            canvasContext: context,
            viewport,
        }).promise;

        pages.push({
            pageNumber: i,
            image: canvas.toBuffer('image/png'),
        });

        log.debug({ page: i, numPages }, 'Rendered page');
    }

    return pages;
}
