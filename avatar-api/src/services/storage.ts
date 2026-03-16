import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config';

const s3 = new S3Client({
  endpoint: config.s3.endpoint,
  region: 'us-east-1',
  credentials: {
    accessKeyId: config.s3.accessKey,
    secretAccessKey: config.s3.secretKey,
  },
  forcePathStyle: true,
});

export const storageService = {
  async upload(key: string, body: Buffer, contentType: string): Promise<string> {
    await s3.send(new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }));
    return `${config.s3.endpoint}/${config.s3.bucket}/${key}`;
  },

  async download(key: string): Promise<Buffer> {
    const res = await s3.send(new GetObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
    }));
    const stream = res.Body as NodeJS.ReadableStream;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  },

  async delete(key: string): Promise<void> {
    await s3.send(new DeleteObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
    }));
  },
};
