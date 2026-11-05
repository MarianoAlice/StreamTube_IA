import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import { Queue } from 'bullmq';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ChannelsService } from '../src/channels/channels.service';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { UnauthorizedExceptionFilter } from '../src/common/filters/unauthorized-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { cleanAllTables } from '../src/test/create-test-data-source';
import { User } from '../src/users/entities/user.entity';
import { VIDEO_PROCESSING_QUEUE } from '../src/videos/video-processing.queue';
import { Video, VideoStatus } from '../src/videos/video.entity';

jest.setTimeout(30000);

const UNKNOWN_VIDEO_ID = '00000000-0000-4000-8000-000000000000';

describe('videos-read', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let queue: Queue;
  let throttlerStorage: ThrottlerStorageService;
  let readyId: string;
  let processingId: string;
  let userCounter = 0;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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

    const channelId = await insertChannel();
    const videos = dataSource.getRepository(Video);
    readyId = (
      await videos.save(
        videos.create({
          channel_id: channelId,
          status: VideoStatus.READY,
          duration_seconds: 42,
        }),
      )
    ).id;
    processingId = (
      await videos.save(
        videos.create({
          channel_id: channelId,
          status: VideoStatus.PROCESSING,
        }),
      )
    ).id;
  });

  async function insertChannel(): Promise<string> {
    const users = dataSource.getRepository(User);
    const user = await users.save(
      users.create({
        email: `reader_${++userCounter}@example.com`,
        password: 'hashed',
      }),
    );
    const channel = await new ChannelsService(dataSource).createChannel(
      user.id,
      user.email,
    );
    return channel.id;
  }

  it('anonymous-reads-video', async () => {
    const response = await request(app.getHttpServer())
      .get(`/videos/${readyId}`)
      .expect(200);

    expect(response.body).toEqual({
      id: readyId,
      status: 'ready',
      duration_seconds: 42,
    });
  });

  it('unknown-video', async () => {
    const response = await request(app.getHttpServer())
      .get(`/videos/${UNKNOWN_VIDEO_ID}`)
      .expect(404);

    expect(response.body.error).toBe('VIDEO_NOT_FOUND');
  });

  it('playback-when-ready', async () => {
    const response = await request(app.getHttpServer())
      .get(`/videos/${readyId}/playback`)
      .expect(200);

    expect(typeof response.body.url).toBe('string');
    expect(response.body.url.length).toBeGreaterThan(0);
    expect(Object.keys(response.body)).toEqual(['url']);
    expect(response.headers['content-type']).toMatch(/json/);
  });

  it('playback-when-not-ready', async () => {
    const response = await request(app.getHttpServer())
      .get(`/videos/${processingId}/playback`)
      .expect(409);

    expect(response.body.error).toBe('VIDEO_NOT_READY');
  });

  it('download-when-ready', async () => {
    const response = await request(app.getHttpServer())
      .get(`/videos/${readyId}/download`)
      .expect(200);

    expect(typeof response.body.url).toBe('string');
    expect(response.body.url.length).toBeGreaterThan(0);
  });

  it('download-while-processing', async () => {
    const response = await request(app.getHttpServer())
      .get(`/videos/${processingId}/download`)
      .expect(409);

    expect(response.body.error).toBe('VIDEO_NOT_READY');
  });
});
