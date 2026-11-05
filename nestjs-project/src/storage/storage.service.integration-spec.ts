import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import S3rver from 's3rver';
import storageConfig from '../config/storage.config';
import { StorageModule } from './storage.module';
import { CompletedPart, StorageService } from './storage.service';

const MIN_PART_BYTES = 5 * 1024 * 1024;

describe('StorageService (integration)', () => {
  let module: TestingModule;
  let service: StorageService;
  let s3: S3Client;
  let s3rver: S3rver;
  let videosBucket: string;
  let thumbnailsBucket: string;

  beforeAll(async () => {
    process.env.STORAGE_ENDPOINT = 'http://127.0.0.1:4569';
    process.env.STORAGE_REGION = 'us-east-1';
    process.env.STORAGE_ACCESS_KEY_ID = 'S3RVER';
    process.env.STORAGE_SECRET_ACCESS_KEY = 'S3RVER';
    process.env.VIDEOS_BUCKET = 'videos';
    process.env.THUMBNAILS_BUCKET = 'thumbnails';

    const directory = mkdtempSync(join(tmpdir(), 'streamtube-s3-'));
    s3rver = new S3rver({
      port: 4569,
      address: '127.0.0.1',
      silent: true,
      directory,
      resetOnClose: true,
      vhostBuckets: false,
      configureBuckets: [{ name: 'videos' }, { name: 'thumbnails' }],
    });
    await s3rver.run();

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [storageConfig],
        }),
        StorageModule,
      ],
    }).compile();

    service = module.get(StorageService);
    s3 = module.get(S3Client);
    const storage = module.get(storageConfig.KEY);
    videosBucket = storage.videosBucket;
    thumbnailsBucket = storage.thumbnailsBucket;
  });

  afterAll(async () => {
    await module.close();
    await s3rver.close();
  });

  it('returns an upload id and one presigned url per part without a file body', async () => {
    const videoId = randomUUID();

    const created = await service.createMultipartUpload({
      videoId,
      contentType: 'video/mp4',
      partCount: 2,
    });

    expect(created.uploadId).toEqual(expect.any(String));
    expect(created.uploadId.length).toBeGreaterThan(0);
    expect(created.parts).toHaveLength(2);
    expect(created.parts.map((part) => part.partNumber)).toEqual([1, 2]);
    expect(created.parts.every((part) => part.url.startsWith('http'))).toBe(
      true,
    );
  });

  it('stores the completed multipart object in the videos bucket', async () => {
    const videoId = randomUUID();
    const created = await service.createMultipartUpload({
      videoId,
      contentType: 'video/mp4',
      partCount: 2,
    });

    const parts: CompletedPart[] = [];
    for (const part of created.parts) {
      const size = part.partNumber === 1 ? MIN_PART_BYTES : 1024;
      const response = await fetch(part.url, {
        method: 'PUT',
        body: Buffer.alloc(size, part.partNumber),
      });
      expect(response.ok).toBe(true);
      const etag = response.headers.get('etag');
      expect(etag).toEqual(expect.any(String));
      parts.push({ partNumber: part.partNumber, etag: etag as string });
    }

    await service.completeMultipartUpload({
      videoId,
      uploadId: created.uploadId,
      parts,
    });

    const head = await s3.send(
      new HeadObjectCommand({ Bucket: videosBucket, Key: videoId }),
    );
    expect(head.ContentLength).toBe(MIN_PART_BYTES + 1024);
  });

  it('adds Content-Disposition only to the download presign', async () => {
    const videoId = randomUUID();

    const playback = await service.presignPlayback(videoId);
    const download = await service.presignDownload(videoId);

    expect(
      new URL(playback.url).searchParams.has('response-content-disposition'),
    ).toBe(false);
    const disposition = new URL(download.url).searchParams.get(
      'response-content-disposition',
    );
    expect(disposition).toContain('attachment');
    expect(disposition).toContain('filename');
  });

  it('stores the thumbnail in the thumbnails bucket under the video id', async () => {
    const videoId = randomUUID();
    const body = Buffer.from('frame');

    await service.putThumbnail(videoId, body, 'image/jpeg');

    const head = await s3.send(
      new HeadObjectCommand({ Bucket: thumbnailsBucket, Key: videoId }),
    );
    expect(head.ContentLength).toBe(body.length);
    expect(head.ContentType).toBe('image/jpeg');
  });
});
