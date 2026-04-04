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

export interface PapraTag {
    id: string;
    name: string;
    color: string;
    description?: string;
}

export class PapraClient {
    private baseUrl: string;
    private orgId: string;
    private headers: Record<string, string>;
    private log: Logger;

    constructor(config: Config['papra'], log: Logger) {
        this.baseUrl = config.apiUrl;
        this.orgId = config.orgId;
        this.headers = {
            Authorization: `Bearer ${config.apiKey}`,
        };
        this.log = log.child({ module: 'papra-client' });
    }

    private url(path: string): string {
        return `${this.baseUrl}/api/organizations/${this.orgId}${path}`;
    }

    private jsonHeaders(): Record<string, string> {
        return { ...this.headers, 'Content-Type': 'application/json' };
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
                const body = await res.text();
                throw new Error(
                    `Failed to list documents: ${res.status} ${body}`,
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
            const body = await res.text();
            throw new Error(
                `Failed to get document ${documentId}: ${res.status} ${body}`,
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
            const body = await res.text();
            throw new Error(
                `Failed to download document ${documentId}: ${res.status} ${body}`,
            );
        }

        return res.arrayBuffer();
    }

    async updateDocumentContent(
        documentId: string,
        content: string,
    ): Promise<void> {
        await this.updateDocument(documentId, { content });
    }

    async updateDocument(
        documentId: string,
        updates: {
            content?: string;
            name?: string;
            documentDate?: string;
        },
    ): Promise<void> {
        const res = await fetch(this.url(`/documents/${documentId}`), {
            method: 'PATCH',
            headers: this.jsonHeaders(),
            body: JSON.stringify(updates),
        });

        if (!res.ok) {
            const body = await res.text();
            throw new Error(
                `Failed to update document ${documentId}: ${res.status} ${body}`,
            );
        }

        this.log.info(
            { documentId, fields: Object.keys(updates) },
            'Updated document',
        );
    }

    async listTags(): Promise<PapraTag[]> {
        const res = await fetch(this.url('/tags'), {
            headers: this.headers,
        });

        if (!res.ok) {
            const body = await res.text();
            throw new Error(`Failed to list tags: ${res.status} ${body}`);
        }

        const data = (await res.json()) as { tags: PapraTag[] };
        return data.tags;
    }

    async addTagToDocument(documentId: string, tagId: string): Promise<void> {
        const res = await fetch(this.url(`/documents/${documentId}/tags`), {
            method: 'POST',
            headers: this.jsonHeaders(),
            body: JSON.stringify({ tagId }),
        });

        if (res.status === 409) {
            this.log.debug({ documentId, tagId }, 'Tag already on document, skipping');
            return;
        }

        if (!res.ok) {
            const body = await res.text();
            throw new Error(
                `Failed to add tag ${tagId} to document ${documentId}: ${res.status} ${body}`,
            );
        }
    }
}
