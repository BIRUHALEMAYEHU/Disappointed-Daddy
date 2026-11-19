import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Short code a human can compare between terminal and browser, e.g. "BKTR-MWZQ" (no vowels, no look-alikes). */
export function userCode(): string {
  const alphabet = "BCDFGHJKLMNPQRSTVWXZ";
  const pick = () => alphabet[randomInt(alphabet.length)];
  return `${Array.from({ length: 4 }, pick).join("")}-${Array.from({ length: 4 }, pick).join("")}`;
}

function sign(payload: string): string {
  return createHmac("sha256", env("SESSION_SECRET")).update(payload).digest("base64url");
}

/** Creates a signed, expiring value for a cookie: base64url(json).signature */
export function seal(data: object, maxAgeSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ ...data, exp: Date.now() + maxAgeSeconds * 1000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** AES-256-GCM key derived from SESSION_SECRET (separate purpose from the HMAC signing key). */
const encKey = () => createHash("sha256").update(`enc:${env("SESSION_SECRET")}`).digest();

/** Encrypts a secret for a cookie (used for the user's GitHub token): iv.tag.ciphertext */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const [iv, tag, data] = value.split(".").map((p) => Buffer.from(p, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", encKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function unseal<T>(value: string | undefined): T | null {
  if (!value) return null;
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as T & { exp: number };
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}
