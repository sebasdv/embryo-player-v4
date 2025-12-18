export class PersistenceManager {
    private db: IDBDatabase | null = null;
    private dbName = 'embryo-db';

    async init(): Promise<void> {
        try {
            console.log('[PersistenceManager] Initializing IndexedDB...');
            this.db = await this.openDatabase();
            console.log('[PersistenceManager] DB Ready.');
        } catch (err) {
            console.error('[PersistenceManager] DB Init failed', err);
        }
    }

    private openDatabase(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);

            request.onerror = (event) => reject('Database error: ' + (event.target as IDBOpenDBRequest).error);

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings');
                }
                if (!db.objectStoreNames.contains('samples')) {
                    db.createObjectStore('samples');
                }
            };

            request.onsuccess = (event) => {
                resolve((event.target as IDBOpenDBRequest).result);
            };
        });
    }

    async saveSample(padId: string, blob: Blob): Promise<void> {
        if (!this.db) return;
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['samples'], 'readwrite');
            const store = transaction.objectStore('samples');
            const request = store.put(blob, padId);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async loadSample(padId: string): Promise<Blob | null> {
        if (!this.db) return null;
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['samples'], 'readonly');
            const store = transaction.objectStore('samples');
            const request = store.get(padId);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    async getAllSamples(): Promise<Record<string, Blob>> {
        if (!this.db) return {};
        return new Promise((resolve, reject) => {
            const tx = this.db!.transaction('samples', 'readonly');
            const store = tx.objectStore('samples');
            const request = store.openCursor();
            const results: Record<string, Blob> = {};

            request.onsuccess = (e) => {
                const cursor = (e.target as IDBRequest).result;
                if (cursor) {
                    results[cursor.key as string] = cursor.value;
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            request.onerror = () => reject('Failed to get samples');
        });
    }

    async clear(): Promise<void> {
        if (!this.db) return;
        const tx = this.db.transaction('samples', 'readwrite');
        const store = tx.objectStore('samples');
        store.clear();
        return new Promise((resolve) => {
            tx.oncomplete = () => resolve();
        });
    }

    async clearDatabase(): Promise<void> {
        await this.clear();
    }
}
