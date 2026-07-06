import { openDB } from 'idb';

const DB_NAME = 'torgman-persistence';
const DB_VERSION = 1;
const DOCUMENTS_STORE = 'documents';
const CHATS_STORE = 'chats';
const META_STORE = 'meta';
const ACTIVE_DOCUMENT_KEY = 'activeDocumentId';
const ACTIVE_TRANSLATION_JOB_KEY = 'activeTranslationJob';

// Generates a unique ID for persisted document records.
// Use it when creating a new translation session/document entry.
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

// Opens (and upgrades if needed) the app's IndexedDB database.
// Use this as the single entry point to ensure stores/indexes always exist.
const getDb = () => openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(DOCUMENTS_STORE)) {
      db.createObjectStore(DOCUMENTS_STORE, { keyPath: 'id' });
    }

    if (!db.objectStoreNames.contains(CHATS_STORE)) {
      const chatStore = db.createObjectStore(CHATS_STORE, {
        keyPath: ['documentId', 'segmentId'],
      });
      chatStore.createIndex('by_document', 'documentId');
    }

    if (!db.objectStoreNames.contains(META_STORE)) {
      db.createObjectStore(META_STORE, { keyPath: 'key' });
    }
  },
});

// Returns an ISO timestamp for create/update metadata fields.
// Use it to keep persisted records traceable and sortable by time.
const nowIso = () => new Date().toISOString();

// Creates a new document record and marks it as the active document.
// Use after a successful translation/upload to initialize compare state.
export const createDocument = async (payload) => {
  const db = await getDb();
  const id = generateId();
  const now = nowIso();
  const record = {
    id,
    createdAt: now,
    updatedAt: now,
    checkedBlocks: {},
    suggestions: {},
    backTranslations: {},
    explanations: {},
    ...payload,
  };
  await db.put(DOCUMENTS_STORE, record);
  await db.put(META_STORE, { key: ACTIVE_DOCUMENT_KEY, value: id });
  return id;
};

// Applies a partial update to an existing document record.
// Use whenever edited compare state changes (text, checks, suggestions, etc.).
export const saveDocumentState = async (documentId, patch) => {
  if (!documentId) return;

  const db = await getDb();
  const existing = (await db.get(DOCUMENTS_STORE, documentId)) || {
    id: documentId,
    createdAt: nowIso(),
  };

  await db.put(DOCUMENTS_STORE, {
    ...existing,
    ...patch,
    id: documentId,
    updatedAt: nowIso(),
  });
};

// Loads a document by ID from the documents store.
// Use for hydration on navigation/refresh when restoring compare state.
export const loadDocument = async (documentId) => {
  if (!documentId) return null;
  const db = await getDb();
  return db.get(DOCUMENTS_STORE, documentId);
};

// Sets the active document pointer in metadata.
// Use when switching documents so restore knows which one to open by default.
export const setActiveDocumentId = async (documentId) => {
  const db = await getDb();
  await db.put(META_STORE, { key: ACTIVE_DOCUMENT_KEY, value: documentId });
};

// Reads the current active document pointer from metadata.
// Use as fallback when route state does not provide a document ID.
export const getActiveDocumentId = async () => {
  const db = await getDb();
  const item = await db.get(META_STORE, ACTIVE_DOCUMENT_KEY);
  return item?.value || null;
};

// Stores the currently running translation job metadata.
// Use this to resume an in-flight translation after refresh or reconnect.
export const setActiveTranslationJob = async (jobMeta) => {
  const db = await getDb();
  await db.put(META_STORE, {
    key: ACTIVE_TRANSLATION_JOB_KEY,
    value: jobMeta,
    updatedAt: nowIso(),
  });
};

// Reads the currently running translation job metadata, if any.
// Use it before hydrating completed documents so reattachment wins.
export const getActiveTranslationJob = async () => {
  const db = await getDb();
  const item = await db.get(META_STORE, ACTIVE_TRANSLATION_JOB_KEY);
  return item?.value || null;
};

// Clears the active translation job pointer once the job is done or discarded.
export const clearActiveTranslationJob = async () => {
  const db = await getDb();
  await db.delete(META_STORE, ACTIVE_TRANSLATION_JOB_KEY);
};

// Saves chat UI/history for a specific document segment.
// Use to persist focus-chat context per segment across refreshes.
export const saveSegmentChat = async (documentId, segmentId, chatState) => {
  if (!documentId || !segmentId) return;
  const db = await getDb();
  await db.put(CHATS_STORE, {
    documentId,
    segmentId,
    ...chatState,
    updatedAt: nowIso(),
  });
};

// Loads chat state for one document segment.
// Use when opening a segment chat panel to restore prior conversation.
export const loadSegmentChat = async (documentId, segmentId) => {
  if (!documentId || !segmentId) return null;
  const db = await getDb();
  return db.get(CHATS_STORE, [documentId, segmentId]);
};

// Deletes all chat records tied to one document using the document index.
// Use for selective cleanup when you want to reset chat but keep document data.
export const clearChatsForDocument = async (documentId) => {
  if (!documentId) return;

  const db = await getDb();
  const tx = db.transaction(CHATS_STORE, 'readwrite');
  const index = tx.store.index('by_document');
  let cursor = await index.openCursor(IDBKeyRange.only(documentId));

  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }

  await tx.done;
};

// Hard-resets all persisted app data (documents, chats, and metadata).
// Use for strict "new upload replaces everything" behavior.
export const clearAllPersistence = async () => {
  const db = await getDb();
  const tx = db.transaction([DOCUMENTS_STORE, CHATS_STORE, META_STORE], 'readwrite');
  await Promise.all([
    tx.objectStore(DOCUMENTS_STORE).clear(),
    tx.objectStore(CHATS_STORE).clear(),
    tx.objectStore(META_STORE).clear(),
  ]);
  await tx.done;
};
