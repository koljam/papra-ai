import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Logger } from '../logger.js';

export class ProcessedState {
    private ids: Set<string>;
    private filePath: string;
    private log: Logger;

    private constructor(filePath: string, ids: Set<string>, log: Logger) {
        this.filePath = filePath;
        this.ids = ids;
        this.log = log.child({ module: 'state' });
    }

    static async load(filePath: string, log: Logger): Promise<ProcessedState> {
        let ids = new Set<string>();

        try {
            const data = await readFile(filePath, 'utf-8');
            const parsed = JSON.parse(data) as string[];
            ids = new Set(parsed);
            log.info({ count: ids.size }, 'Loaded processed document state');
        } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
            log.info('No existing state file, starting fresh');
        }

        return new ProcessedState(filePath, ids, log);
    }

    get size(): number {
        return this.ids.size;
    }

    has(documentId: string): boolean {
        return this.ids.has(documentId);
    }

    async add(documentId: string): Promise<void> {
        this.ids.add(documentId);
        await this.save();
    }

    async remove(documentId: string): Promise<boolean> {
        const existed = this.ids.delete(documentId);
        if (existed) {
            await this.save();
        }
        return existed;
    }

    private async save(): Promise<void> {
        await mkdir(dirname(this.filePath), { recursive: true });
        await writeFile(this.filePath, JSON.stringify([...this.ids], null, 2));
    }
}
