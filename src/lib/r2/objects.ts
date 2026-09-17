import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Env, r2PublicBaseUrl } from "./env";

const g = globalThis as unknown as { __360showR2Client?: S3Client };

function client() {
  if (!g.__360showR2Client) {
    const env = r2Env();
    g.__360showR2Client = new S3Client({
      region: "auto",
      endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.accessKeyId,
        secretAccessKey: env.secretAccessKey,
      },
      // AWS SDK v3 default CRC32 checksums are rejected by R2.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return g.__360showR2Client;
}

function bucket() {
  return r2Env().bucket;
}

export function isR2NotFound(error: unknown) {
  if (error instanceof NotFound) return true;
  if (error instanceof S3ServiceException && (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404)) {
    return true;
  }
  const name = error instanceof Error ? error.name : "";
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return name === "NoSuchKey" || name === "NotFound" || /nosuchkey|not found|statuscode: 404/i.test(msg);
}

export function r2PublicUrl(pathname: string) {
  const base = r2PublicBaseUrl();
  if (!base) return null;
  return `${base}/${pathname.replace(/^\//, "")}`;
}

export async function r2Head(pathname: string) {
  await client().send(
    new HeadObjectCommand({
      Bucket: bucket(),
      Key: pathname,
    }),
  );
}

export async function r2PutBytes(
  pathname: string,
  body: Buffer | Uint8Array | string,
  contentType: string,
) {
  const bytes = typeof body === "string" ? Buffer.from(body) : Buffer.from(body);
  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: pathname,
      Body: bytes,
      ContentType: contentType,
    }),
  );
  return {
    pathname,
    contentType,
    size: bytes.length,
    url: r2PublicUrl(pathname),
  };
}

export async function r2GetBytes(pathname: string): Promise<{
  bytes: Buffer;
  contentType: string;
  contentDisposition: string;
} | null> {
  try {
    const result = await client().send(
      new GetObjectCommand({
        Bucket: bucket(),
        Key: pathname,
      }),
    );
    if (!result.Body) return null;
    const bytes = Buffer.from(await result.Body.transformToByteArray());
    if (!bytes.length) return null;
    return {
      bytes,
      contentType: result.ContentType || "application/octet-stream",
      contentDisposition: result.ContentDisposition || "inline",
    };
  } catch (error) {
    if (isR2NotFound(error)) return null;
    throw error;
  }
}

export async function r2GetJson<T>(pathname: string): Promise<T | null> {
  const file = await r2GetBytes(pathname);
  if (!file) return null;
  try {
    return JSON.parse(file.bytes.toString("utf8")) as T;
  } catch {
    return null;
  }
}

export async function r2PutJson(pathname: string, data: unknown) {
  return r2PutBytes(pathname, JSON.stringify(data), "application/json");
}

export async function r2Delete(pathname: string) {
  try {
    await client().send(
      new DeleteObjectCommand({
        Bucket: bucket(),
        Key: pathname,
      }),
    );
  } catch (error) {
    if (isR2NotFound(error)) return;
    throw error;
  }
}

export async function r2PresignPut(pathname: string, contentType: string, expiresIn = 900) {
  const url = await getSignedUrl(
    client(),
    new PutObjectCommand({
      Bucket: bucket(),
      Key: pathname,
      ContentType: contentType || "application/octet-stream",
    }),
    { expiresIn },
  );
  return { uploadUrl: url, pathname, publicUrl: r2PublicUrl(pathname) };
}
