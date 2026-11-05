import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Job } from 'bullmq';
import S3rver from 's3rver';
import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { ChannelsService } from '../channels/channels.service';
import { Channel } from '../channels/entities/channel.entity';
import storageConfig from '../config/storage.config';
import { StorageService } from '../storage/storage.service';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { FfmpegService } from './ffmpeg.service';
import { VideoProcessor } from './video.processor';
import { Video, VideoStatus } from './video.entity';

const ALL_ENTITIES = [User, Channel, RefreshToken, VerificationToken, Video];

describe('VideoProcessor (integration)', () => {
  let dataSource: DataSource;
  let videoRepository: Repository<Video>;
  let processor: VideoProcessor;
  let s3: S3Client;
  let s3rver: S3rver;
  let userCounter = 0;

  beforeAll(async () => {
    process.env.STORAGE_ENDPOINT = 'http://127.0.0.1:4569';
    process.env.STORAGE_REGION = 'us-east-1';
    process.env.STORAGE_ACCESS_KEY_ID = 'S3RVER';
    process.env.STORAGE_SECRET_ACCESS_KEY = 'S3RVER';
    process.env.VIDEOS_BUCKET = 'videos';
    process.env.THUMBNAILS_BUCKET = 'thumbnails';

    const directory = mkdtempSync(join(tmpdir(), 'streamtube-worker-'));
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

    s3 = new S3Client({
      region: 'us-east-1',
      endpoint: 'http://127.0.0.1:4569',
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      credentials: {
        accessKeyId: 'S3RVER',
        secretAccessKey: 'S3RVER',
      },
    });

    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    videoRepository = dataSource.getRepository(Video);
    processor = new VideoProcessor(
      videoRepository,
      new StorageService(s3, storageConfig()),
      {
        inspect: () => ({
          durationSeconds: 12,
          metadata: { format: { duration: '12.0' } },
          thumbnail: Buffer.from('frame'),
        }),
      } as unknown as FfmpegService,
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
    await s3rver.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
  });

  async function createProcessingVideo(): Promise<Video> {
    const user = await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        email: `worker_${++userCounter}@example.com`,
        password: 'hashed',
      }),
    );
    const channel = await new ChannelsService(dataSource).createChannel(
      user.id,
      user.email,
    );
    return videoRepository.save(
      videoRepository.create({
        channel_id: channel.id,
        status: VideoStatus.PROCESSING,
        multipart_upload_id: 'upload-1',
      }),
    );
  }

  it('stores duration, metadata, ready, and the thumbnail under the video id', async () => {
    const video = await createProcessingVideo();
    await s3.send(
      new PutObjectCommand({
        Bucket: 'videos',
        Key: video.id,
        Body: Buffer.from('source'),
      }),
    );

    await processor.process({
      data: { videoId: video.id },
      attemptsMade: 1,
      opts: { attempts: 3 },
    } as Job<{ videoId: string }>);

    const row = await videoRepository.findOneBy({ id: video.id });
    expect(row!.status).toBe(VideoStatus.READY);
    expect(row!.duration_seconds).toBe(12);
    expect(row!.metadata).toEqual({ format: { duration: '12.0' } });

    const head = await s3.send(
      new HeadObjectCommand({ Bucket: 'thumbnails', Key: video.id }),
    );
    expect(head.ContentLength).toBe(Buffer.from('frame').length);
  });

  it('keeps the row and sets failed after retries are exhausted', async () => {
    const video = await createProcessingVideo();

    await processor.onFailed({
      data: { videoId: video.id },
      attemptsMade: 3,
      opts: { attempts: 3 },
    } as Job<{ videoId: string }>);

    const rows = await videoRepository.find();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(video.id);
    expect(rows[0].status).toBe(VideoStatus.FAILED);
  });

  it('does not regress a ready video on a second delivery', async () => {
    const video = await createProcessingVideo();
    video.status = VideoStatus.READY;
    video.duration_seconds = 12;
    video.metadata = { format: { duration: '12.0' } };
    await videoRepository.save(video);

    await processor.process({
      data: { videoId: video.id },
      attemptsMade: 1,
      opts: { attempts: 3 },
    } as Job<{ videoId: string }>);

    const row = await videoRepository.findOneBy({ id: video.id });
    expect(row!.status).toBe(VideoStatus.READY);
    expect(row!.duration_seconds).toBe(12);
    expect(row!.metadata).toEqual({ format: { duration: '12.0' } });
  });
});
