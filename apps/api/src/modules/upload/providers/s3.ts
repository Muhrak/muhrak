import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageProvider } from "../storage";

/**
 * Amazon S3 implementation of StorageProvider.
 *
 * The bucket is private (Block Public Access on, ACLs off, HTTPS only) and the
 * IAM user can only PutObject and GetObject in it. Unchecked uploads land in
 * `pending/`, which a lifecycle rule empties after a day.
 */
export function createS3Storage(config: {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}): StorageProvider {
  const client = new S3Client({
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // Without this, newer SDKs put a checksum in signed PUT links that a
    // browser upload cannot satisfy.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const Bucket = config.bucket;

  return {
    async createUploadUrl(key, file, expiresInSeconds) {
      const command = new PutObjectCommand({
        Bucket,
        Key: key,
        ContentType: file.contentType,
        ContentLength: file.sizeBytes,
      });
      // Content-Type and Content-Length are part of the signature: S3 refuses
      // the PUT if the browser sends a different type or a different size.
      const url = await getSignedUrl(client, command, {
        expiresIn: expiresInSeconds,
        signableHeaders: new Set(["content-type", "content-length"]),
      });
      return { url, headers: { "Content-Type": file.contentType } };
    },

    async stat(key) {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        if (head.ContentLength === undefined || !head.ETag) return null;
        return { sizeBytes: head.ContentLength, etag: head.ETag };
      } catch (error) {
        // Our IAM user has no s3:ListBucket (least privilege), so S3 answers
        // 403 instead of 404 for a key that does not exist.
        const status = error instanceof S3ServiceException ? error.$metadata.httpStatusCode : undefined;
        if (error instanceof NotFound || status === 404 || status === 403) return null;
        throw error;
      }
    },

    async readStart(key, etag, bytes) {
      const object = await client.send(
        new GetObjectCommand({ Bucket, Key: key, IfMatch: etag, Range: `bytes=0-${bytes - 1}` }),
      );
      if (!object.Body) return new Uint8Array();
      return object.Body.transformToByteArray();
    },

    async copy(fromKey, toKey, etag, contentType) {
      await client.send(
        new CopyObjectCommand({
          Bucket,
          Key: toKey,
          CopySource: `${Bucket}/${fromKey.split("/").map(encodeURIComponent).join("/")}`,
          CopySourceIfMatch: etag,
          MetadataDirective: "REPLACE",
          ContentType: contentType,
        }),
      );
    },

    async createDownloadUrl(key, file, expiresInSeconds) {
      const command = new GetObjectCommand({
        Bucket,
        Key: key,
        // Always the type we checked, never what the uploader claimed.
        ResponseContentType: file.contentType,
        ResponseContentDisposition: `inline; filename="${file.fileName}"`,
        ResponseCacheControl: "private, max-age=300",
      });
      return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
    },
  };
}
