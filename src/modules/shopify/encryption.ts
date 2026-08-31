import "server-only";

import crypto from "node:crypto";

import { env } from "@/lib/env";

// AES-256-GCM. Formato de saída versionado ("v1.<iv>.<tag>.<ciphertext>",
// tudo base64url) para permitir trocar algoritmo/rotacionar chave no futuro
// sem quebrar leitura de tokens já persistidos — o decrypt despacha por
// versão.
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recomendado para GCM

function getKey(): Buffer {
  return Buffer.from(env.SHOPIFY_TOKEN_ENCRYPTION_KEY, "base64");
}

export function encryptToken(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptToken(payload: string): string {
  const parts = payload.split(".");
  const [version, ivB64, tagB64, dataB64] = parts;

  if (version !== "v1" || parts.length !== 4 || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Formato de token criptografado inválido.");
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivB64, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64url")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
