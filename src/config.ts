import { z } from 'zod';

const configSchema = z.object({
    papra: z.object({
        apiUrl: z.string().url(),
        apiKey: z.string().min(1),
        orgId: z.string().min(1),
    }),
    ocr: z.object({
        apiUrl: z.string().url(),
        apiKey: z.string().min(1),
        model: z.string().default('google/gemini-2.5-flash'),
        concurrency: z.coerce.number().int().positive().default(3),
        imageScale: z.coerce.number().positive().default(2),
        pollIntervalSeconds: z.coerce.number().int().positive().default(60),
        processExisting: z.coerce.boolean().default(true),
    }),
    dataDir: z.string().default('./data'),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
    return configSchema.parse({
        papra: {
            apiUrl: process.env.PAPRA_API_URL,
            apiKey: process.env.PAPRA_API_KEY,
            orgId: process.env.PAPRA_ORG_ID,
        },
        ocr: {
            apiUrl: process.env.OCR_API_URL,
            apiKey: process.env.OCR_API_KEY,
            model: process.env.OCR_MODEL,
            concurrency: process.env.OCR_CONCURRENCY,
            imageScale: process.env.OCR_IMAGE_SCALE,
            pollIntervalSeconds: process.env.OCR_POLL_INTERVAL_SECONDS,
            processExisting: process.env.OCR_PROCESS_EXISTING,
        },
        dataDir: process.env.DATA_DIR,
        logLevel: process.env.LOG_LEVEL as Config['logLevel'],
    });
}
