

export class PersistenceManager {
    private db: IDBDatabase | null = null;
    private dbName = 'embryo-db';

    async init(): Promise<void> {
        try {
            // We use raw IndexedDB or a tiny wrapper if available.
            // To keep it dependency-free (as user asked generally), I will write raw IndexedDB wrapper.
            // It is verbose but cleaner for single file usage.
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
                // Ensure stores exist
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

    async saveSetting(key: string, value: any): Promise<void> {
        if (!this.db) return;
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['settings'], 'readwrite');
            const store = transaction.objectStore('settings');
            const request = store.put(value, key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async loadSetting(key: string): Promise<any> {
        if (!this.db) return null;
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async clearDatabase(): Promise<void> {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['settings', 'samples'], 'readwrite');
            transaction.onerror = () => reject(transaction.error);
            transaction.oncomplete = () => resolve();

            transaction.objectStore('settings').clear();
            transaction.objectStore('samples').clear();
        });
    }

    async loadAllSettings(): Promise<Record<string, any>> {
        if (!this.db) return {};
        // IndexedDB API for "getAllKeys" and "getAll" is standard now
        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(['settings'], 'readonly');
            const store = transaction.objectStore('settings');

            // We need both, ideally iterate with cursor, but let's try parallel
            // Simpler: iterate cursor
            const dict: Record<string, any> = {};

            const cursorReq = store.openCursor();
            cursorReq.onsuccess = (e: any) => {
                const cursor = e.target.result;
                if (cursor) {
                    dict[cursor.key] = cursor.value;
                    cursor.continue();
                } else {
                    resolve(dict);
                }
            };
            cursorReq.onerror = () => reject(cursorReq.error);
        });
    }
}
