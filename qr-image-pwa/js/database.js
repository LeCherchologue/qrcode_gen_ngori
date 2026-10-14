// Accès IndexedDB : stockage des images sous forme de Blob.

const DB_NAME = 'qr-image-pwa';
const DB_VERSION = 1;
const STORE = 'images';

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

async function run(mode, action) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = action(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** record : { id, name, type, size, blob, createdAt } */
export function saveImage(record) {
  return run('readwrite', (store) => store.put(record));
}

export function getImage(id) {
  return run('readonly', (store) => store.get(id));
}

export async function getAllImages() {
  const images = await run('readonly', (store) => store.getAll());
  return images.sort((a, b) => b.createdAt - a.createdAt);
}

export function deleteImage(id) {
  return run('readwrite', (store) => store.delete(id));
}
