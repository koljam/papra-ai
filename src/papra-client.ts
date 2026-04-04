import type { Config } from './config.js';
import type { Logger } from './logger.js';

export interface PapraDocument {
    id: string;
    name: string;
    mimeType: string;
    content: string | null;
    organizationId: string;
    createdAt: string;
    updatedAt: string;
}

export class PapraClient {
    private baseUrl: string;
    private orgId: string;
    private headers: Record<string, string>;
    private log: Logger;

    constructor(config: Config['papra'], log: Logger) {
        this.baseUrl = config.apiUrl.replace(/\/$/, '');
        this.orgId = config.orgId;
        this.headers = {
            Authorization: `Bearer ${config.apiKey}`,
        };
        this.log = log.child({ module: 'papra-client' });
    }

    private url(path: string): string {
        return `${this.baseUrl}/api/organizations/${this.orgId}${path}`;
    }

    async listDocuments(): Promise<PapraDocument[]> {
        const documents: PapraDocument[] = [];
        let pageIndex = 0;
        const pageSize = 100;

        while (true) {
            const res = await fetch(
                this.url(
                    `/documents?pageIndex=${pageIndex}&pageSize=${pageSize}`,
                ),
                {
                    headers: this.headers,
                },
            );

            if (!res.ok) {
                throw new Error(
                    `Failed to list documents: ${res.status} ${res.statusText}`,
                );
            }

            const data = (await res.json()) as { documents: PapraDocument[] };

            documents.push(...data.documents);

            if (data.documents.length < pageSize) break;
            pageIndex++;
        }

        return documents;
    }

    async getDocument(documentId: string): Promise<PapraDocument> {
        const res = await fetch(this.url(`/documents/${documentId}`), {
            headers: this.headers,
        });

        if (!res.ok) {
            throw new Error(
                `Failed to get document ${documentId}: ${res.status} ${res.statusText}`,
            );
        }

        const data = (await res.json()) as { document: PapraDocument };
        return data.document;
    }

    async downloadDocument(documentId: string): Promise<ArrayBuffer> {
        const res = await fetch(this.url(`/documents/${documentId}/file`), {
            headers: this.headers,
        });

        if (!res.ok) {
            throw new Error(
                `Failed to download document ${documentId}: ${res.status} ${res.statusText}`,
            );
        }

        return res.arrayBuffer();
    }

    async updateDocumentContent(
        documentId: string,
        content: string,
    ): Promise<void> {
        const res = await fetch(this.url(`/documents/${documentId}`), {
            method: 'PATCH',
            headers: {
                ...this.headers,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content }),
        });

        if (!res.ok) {
            throw new Error(
                `Failed to update document ${documentId}: ${res.status} ${res.statusText}`,
            );
        }

        this.log.info({ documentId }, 'Updated document content');
    }
}
