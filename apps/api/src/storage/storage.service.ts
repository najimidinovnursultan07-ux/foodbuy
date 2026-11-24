import { Injectable, Logger } from '@nestjs/common';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/** Каталог локальных загрузок (режим STORAGE_DRIVER=local, разработка без Docker). */
export const LOCAL_UPLOAD_DIR = resolve(process.env.UPLOAD_DIR ?? join(process.cwd(), 'uploads'));

/**
 * Хранилище файлов. В Docker/проде — S3-совместимое (MinIO, Yandex Object Storage и т.п.),
 * локально — папка, которую API раздаёт по /uploads. Ключи уникальны — кешируем навсегда.
 */
@Injectable()
export class StorageService {
  private readonly log = new Logger(StorageService.name);
  private readonly driver = process.env.STORAGE_DRIVER === 's3' ? 's3' : 'local';
  private readonly s3?: S3Client;
  private readonly bucket = process.env.S3_BUCKET ?? 'qrmenu';
  private readonly publicBase: string;

  constructor() {
    if (this.driver === 's3') {
      this.s3 = new S3Client({
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION ?? 'us-east-1',
        forcePathStyle: true,
        credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? '', secretAccessKey: process.env.S3_SECRET_KEY ?? '' },
      });
      this.publicBase = (process.env.S3_PUBLIC_URL ?? '').replace(/\/$/, '');
    } else {
      this.publicBase = `${(process.env.API_PUBLIC_URL ?? 'http://localhost:4000').replace(/\/$/, '')}/uploads`;
    }
  }

  async put(key: string, body: Buffer, contentType: string): Promise<string> {
    if (this.s3) {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    } else {
      const path = join(LOCAL_UPLOAD_DIR, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
    }
    return `${this.publicBase}/${key}`;
  }

  /** Удалить по публичному URL. Ошибки не роняют запрос — файл просто останется. */
  async remove(url: string | null | undefined): Promise<void> {
    if (!url || !url.startsWith(`${this.publicBase}/`)) return;
    const key = url.slice(this.publicBase.length + 1);
    if (key.includes('..')) return;
    try {
      if (this.s3) await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      else await unlink(join(LOCAL_UPLOAD_DIR, key));
    } catch (e) {
      this.log.warn(`Не удалось удалить ${key}: ${(e as Error).message}`);
    }
  }
}
