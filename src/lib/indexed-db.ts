// src/lib/indexed-db.ts
import type { RankedImage } from '@/types'; // Changed from ActionSerializableRankedImage

const DB_NAME = 'PhotoJudgeDB';
const DB_VERSION = 1; // Keep version, schema changes if needed via onupgradeneeded
const STORE_NAME = 'images';

interface DBRequest<T> extends IDBRequest<T> {
  result: T;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      // If DB_VERSION increases and you need to modify the store (e.g., add indexes), do it here.
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      console.error('IndexedDB error:', (event.target as IDBOpenDBRequest).error);
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

export async function putImage(image: RankedImage): Promise<void> { // Changed to RankedImage
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(image); // image can now contain File objects

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event) => {
      console.error('Error putting image to IndexedDB:', (event.target as IDBRequest).error);
      reject((event.target as IDBRequest).error);
    };
  });
}

export async function getImageById(id: string): Promise<RankedImage | undefined> { // Changed to RankedImage
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id) as DBRequest<RankedImage | undefined>;

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = (event) => {
      console.error('Error getting image by ID from IndexedDB:', (event.target as IDBRequest).error);
      reject((event.target as IDBRequest).error);
    };
  });
}

export async function getAllImages(): Promise<RankedImage[]> { // Changed to RankedImage[]
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll() as DBRequest<RankedImage[]>;

    request.onsuccess = () => {
      resolve(request.result || []);
    };

    request.onerror = (event) => {
      console.error('Error getting all images from IndexedDB:', (event.target as IDBRequest).error);
      reject((event.target as IDBRequest).error);
    };
  });
}

export async function deleteImageById(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event) => {
      console.error('Error deleting image by ID from IndexedDB:', (event.target as IDBRequest).error);
      reject((event.target as IDBRequest).error);
    };
  });
}

export async function clearStore(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event) => {
      console.error('Error clearing IndexedDB store:', (event.target as IDBRequest).error);
      reject((event.target as IDBRequest).error);
    };
  });
}
