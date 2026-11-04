// ── TanCom End-to-End Encryption ──────────────────────────────────────────────
// Uses Web Crypto API (ECDH P-256 + AES-256-GCM). No external dependencies.
//
// Key storage:
//   - Private key → IndexedDB (never leaves the device)
//   - Public key  → uploaded to the server once per device
//
// Per-room conversation key:
//   - Random AES-256-GCM key, encrypted for every participant via ECDH key agreement
//   - Server stores only ciphertext; cannot decrypt messages

const IDB_NAME = "tancom-e2ee";
const IDB_STORE = "keys";
const PRIVATE_KEY_ID = "private-key";
const PUBLIC_KEY_JWK_ID = "public-key-jwk";

// ── IndexedDB helpers ──────────────────────────────────────────────────────────
function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    const req = tx.objectStore(IDB_STORE).put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── Base64 helpers ─────────────────────────────────────────────────────────────
export function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!);
  return btoa(s);
}

export function b64ToBuf(b64: string): Uint8Array<ArrayBuffer> {
  const bstr = atob(b64);
  const arr = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) arr[i] = bstr.charCodeAt(i);
  return arr;
}

// ── Key pair (ECDH P-256) ──────────────────────────────────────────────────────
export async function generateAndStoreKeyPair(): Promise<{ publicKeyJwk: string }> {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const publicKeyJwk = JSON.stringify(publicJwk);

  const idb = await openIDB();
  await idbPut(idb, PRIVATE_KEY_ID, pair.privateKey);
  await idbPut(idb, PUBLIC_KEY_JWK_ID, publicKeyJwk);

  return { publicKeyJwk };
}

export async function loadPrivateKey(): Promise<CryptoKey | null> {
  const idb = await openIDB();
  return (await idbGet<CryptoKey>(idb, PRIVATE_KEY_ID)) ?? null;
}

export async function loadStoredPublicKeyJwk(): Promise<string | null> {
  const idb = await openIDB();
  return (await idbGet<string>(idb, PUBLIC_KEY_JWK_ID)) ?? null;
}

export async function importPublicKey(jwkStr: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkStr) as JsonWebKey;
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, true, []);
}

// ── Conversation key (AES-256-GCM) ────────────────────────────────────────────
export async function generateConversationKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
    "wrapKey",
    "unwrapKey",
  ]);
}

// Encrypt the conversation key for a specific recipient using ECDH key agreement
export async function encryptConversationKeyForRecipient(
  conversationKey: CryptoKey,
  recipientPublicKey: CryptoKey,
): Promise<{ encryptedKey: string; iv: string; ephemeralPublicKey: string }> {
  // Generate ephemeral ECDH key pair
  const ephemeral = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey"],
  );

  // Derive a wrapping key via ECDH(ephemeralPrivate, recipientPublic)
  const wrappingKey = await crypto.subtle.deriveKey(
    { name: "ECDH", public: recipientPublicKey },
    ephemeral.privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey"],
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedKeyBuf = await crypto.subtle.wrapKey("raw", conversationKey, wrappingKey, {
    name: "AES-GCM",
    iv,
  });

  const ephemeralPublicJwk = await crypto.subtle.exportKey("jwk", ephemeral.publicKey);

  return {
    encryptedKey: bufToB64(encryptedKeyBuf),
    iv: bufToB64(iv),
    ephemeralPublicKey: JSON.stringify(ephemeralPublicJwk),
  };
}

// Decrypt the conversation key using my private key + the sender's ephemeral public key
export async function decryptConversationKey(
  encryptedKey: string,
  iv: string,
  ephemeralPublicKeyStr: string,
  myPrivateKey: CryptoKey,
): Promise<CryptoKey> {
  const ephemeralPublicKey = await importPublicKey(ephemeralPublicKeyStr);

  const unwrappingKey = await crypto.subtle.deriveKey(
    { name: "ECDH", public: ephemeralPublicKey },
    myPrivateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["unwrapKey"],
  );

  return crypto.subtle.unwrapKey(
    "raw",
    b64ToBuf(encryptedKey),
    unwrappingKey,
    { name: "AES-GCM", iv: b64ToBuf(iv) },
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// ── Message encrypt / decrypt ──────────────────────────────────────────────────
export async function encryptMessage(
  plaintext: string,
  conversationKey: CryptoKey,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    conversationKey,
    enc.encode(plaintext),
  );
  return { ciphertext: bufToB64(ciphertextBuf), iv: bufToB64(iv) };
}

export async function decryptMessage(
  ciphertext: string,
  iv: string,
  conversationKey: CryptoKey,
): Promise<string> {
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBuf(iv) },
    conversationKey,
    b64ToBuf(ciphertext),
  );
  return new TextDecoder().decode(plainBuf);
}
