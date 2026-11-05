import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { UnauthorizedExceptionFilter } from '../src/common/filters/unauthorized-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { StorageService } from '../src/storage/storage.service';
import { cleanAllTables } from '../src/test/create-test-data-source';
import { VIDEO_PROCESSING_QUEUE } from '../src/videos/video-processing.queue';
import { Video, VideoStatus } from '../src/videos/video.entity';

jest.setTimeout(30000);

const UNKNOWN_VIDEO_ID = '00000000-0000-4000-8000-000000000000';
const PARTS = [{ partNumber: 1, etag: 'etag-1' }];

describe('videos-complete', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let queue: Queue;
  let throttlerStorage: ThrottlerStorageService;
  let ownerToken: string;
  let otherToken: string;
  let videoId: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(StorageService)
      .useValue({
        createMultipartUpload: jest.fn(),
        completeMultipartUpload: jest.fn().mockResolvedValue(undefined),
        presignPlayback: jest.fn(),
        presignDownload: jest.fn(),
        putThumbnail: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(
      new DomainExceptionFilter(),
      new ValidationExceptionFilter(),
      new UnauthorizedExceptionFilter(),
    );
    await app.init();

    dataSource = moduleFixture.get(DataSource);
    queue = moduleFixture.get<Queue>(getQueueToken(VIDEO_PROCESSING_QUEUE));
    throttlerStorage =
      moduleFixture.get<ThrottlerStorageService>(ThrottlerStorage);
  });

  afterAll(async () => {
    if (queue) {
      await queue.obliterate({ force: true });
      await queue.close();
    }
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    await queue.obliterate({ force: true });
    throttlerStorage.storage.clear();
    ownerToken = await registerConfirmAndLogin('owner@example.com');
    otherToken = await registerConfirmAndLogin('other@example.com');
    videoId = await insertDraft('owner@example.com');
  });

  async function registerConfirmAndLogin(email: string): Promise<string> {
    const authService = app.get(AuthService);
    const mailServiceInstance = (authService as any).mailService;
    let capturedToken = '';
    jest
      .spyOn(mailServiceInstance, 'sendConfirmationEmail')
      .mockImplementationOnce(
        (_email: string, _name: string, token: string) => {
          capturedToken = token;
        },
      );

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'password123' })
      .expect(201);
    await request(app.getHttpServer())
      .get('/auth/confirm-email')
      .query({ token: capturedToken })
      .expect(204);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123' })
      .expect(200);

    return login.body.access_token as string;
  }

  async function insertDraft(email: string): Promise<string> {
    const channelId = (
      await dataSource.query(
        'SELECT id FROM channels WHERE user_id = (SELECT id FROM users WHERE email = $1)',
        [email],
      )
    )[0].id as string;
    const video = await dataSource.getRepository(Video).save(
      dataSource.getRepository(Video).create({
        channel_id: channelId,
        status: VideoStatus.DRAFT,
        multipart_upload_id: 'upload-1',
      }),
    );
    return video.id;
  }

  it('owner-completes-draft', async () => {
    const response = await request(app.getHttpServer())
      .post(`/videos/${videoId}/complete`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ parts: PARTS })
      .expect(202);

    expect(response.body.id).toBe(videoId);
    expect(response.body.status).toBe('processing');

    const row = await dataSource
      .getRepository(Video)
      .findOneBy({ id: videoId });
    expect(row!.status).toBe(VideoStatus.PROCESSING);

    const jobs = await queue.getJobs(['waiting', 'paused', 'delayed'] as (
      | 'waiting'
      | 'delayed'
    )[]);
    expect(
      jobs.some(
        (job) =>
          job.name === VIDEO_PROCESSING_QUEUE && job.data.videoId === videoId,
      ),
    ).toBe(true);
  });

  it('missing-access-token', async () => {
    await request(app.getHttpServer())
      .post(`/videos/${videoId}/complete`)
      .send({ parts: PARTS })
      .expect(401);
  });

  it('authenticated-non-owner', async () => {
    await request(app.getHttpServer())
      .post(`/videos/${videoId}/complete`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ parts: PARTS })
      .expect(403);

    const row = await dataSource
      .getRepository(Video)
      .findOneBy({ id: videoId });
    expect(row!.status).toBe(VideoStatus.DRAFT);
  });

  it('unknown-video', async () => {
    const response = await request(app.getHttpServer())
      .post(`/videos/${UNKNOWN_VIDEO_ID}/complete`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ parts: PARTS })
      .expect(404);

    expect(response.body.error).toBe('VIDEO_NOT_FOUND');
  });

  it('status-not-draft', async () => {
    await dataSource.getRepository(Video).update(videoId, {
      status: VideoStatus.PROCESSING,
    });

    const response = await request(app.getHttpServer())
      .post(`/videos/${videoId}/complete`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ parts: PARTS })
      .expect(409);

    expect(response.body.error).toBe('UPLOAD_NOT_COMPLETABLE');
    const row = await dataSource
      .getRepository(Video)
      .findOneBy({ id: videoId });
    expect(row!.status).toBe(VideoStatus.PROCESSING);
  });
});
