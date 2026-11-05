import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import S3rver from 's3rver';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { UnauthorizedExceptionFilter } from '../src/common/filters/unauthorized-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { cleanAllTables } from '../src/test/create-test-data-source';
import { MAX_UPLOAD_BYTES } from '../src/videos/upload-limits';
import { Video, VideoStatus } from '../src/videos/video.entity';

jest.setTimeout(30000);

describe('videos-uploads', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let s3rver: S3rver;
  let throttlerStorage: ThrottlerStorageService;
  let accessToken: string;

  beforeAll(async () => {
    process.env.STORAGE_ENDPOINT = 'http://127.0.0.1:4569';
    process.env.STORAGE_ACCESS_KEY_ID = 'S3RVER';
    process.env.STORAGE_SECRET_ACCESS_KEY = 'S3RVER';
    process.env.VIDEOS_BUCKET = 'videos';
    process.env.THUMBNAILS_BUCKET = 'thumbnails';

    const directory = mkdtempSync(join(tmpdir(), 'streamtube-uploads-'));
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
    throttlerStorage =
      moduleFixture.get<ThrottlerStorageService>(ThrottlerStorage);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (s3rver) {
      await s3rver.close();
    }
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    throttlerStorage.storage.clear();
    accessToken = await registerConfirmAndLogin('uploader@example.com');
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

  it('initiate-returns-draft', async () => {
    const response = await request(app.getHttpServer())
      .post('/videos/uploads')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ contentType: 'video/mp4', sizeBytes: 1048576, partCount: 2 })
      .expect(201);

    expect(response.body.status).toBe('draft');
    expect(response.body.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(typeof response.body.uploadId).toBe('string');
    expect(response.body.parts).toHaveLength(2);
    expect(response.body.parts[0]).toEqual(
      expect.objectContaining({
        partNumber: expect.any(Number),
        url: expect.any(String),
      }),
    );

    const row = await dataSource.getRepository(Video).findOneBy({
      id: response.body.id,
    });
    const channelId = (
      await dataSource.query(
        'SELECT id FROM channels WHERE user_id = (SELECT id FROM users WHERE email = $1)',
        ['uploader@example.com'],
      )
    )[0].id as string;

    expect(row).not.toBeNull();
    expect(row!.status).toBe(VideoStatus.DRAFT);
    expect(row!.channel_id).toBe(channelId);
  });

  it('missing-access-token', async () => {
    const response = await request(app.getHttpServer())
      .post('/videos/uploads')
      .send({ contentType: 'video/mp4', sizeBytes: 1048576, partCount: 1 })
      .expect(401);

    expect(response.body.statusCode).toBe(401);
    expect(response.body.error).toBeDefined();
    expect(response.body.message).toBeDefined();
  });

  it('upload-too-large', async () => {
    const response = await request(app.getHttpServer())
      .post('/videos/uploads')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        contentType: 'video/mp4',
        sizeBytes: MAX_UPLOAD_BYTES + 1,
        partCount: 1,
      })
      .expect(413);

    expect(response.body.error).toBe('UPLOAD_TOO_LARGE');
  });

  it('missing-part-count', async () => {
    const response = await request(app.getHttpServer())
      .post('/videos/uploads')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ contentType: 'video/mp4', sizeBytes: 1048576 })
      .expect(400);

    expect(response.body.error).toBe('VALIDATION_ERROR');
  });
});
