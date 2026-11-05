import { S3Client } from '@aws-sdk/client-s3';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { envValidationSchema } from '../config/env.validation';
import queueConfig from '../config/queue.config';
import storageConfig from '../config/storage.config';
import { QueueModule } from '../queue/queue.module';
import { StorageModule } from '../storage/storage.module';

const videoEnv = {
  REDIS_HOST: 'redis',
  REDIS_PORT: '6379',
  VIDEOS_BUCKET: 'videos',
  THUMBNAILS_BUCKET: 'thumbnails',
};

const configRoot = () =>
  ConfigModule.forRoot({
    isGlobal: true,
    ignoreEnvFile: true,
    load: [queueConfig, storageConfig],
    validationSchema: envValidationSchema,
    validationOptions: { allowUnknown: true, abortEarly: false },
  });

describe('QueueModule + StorageModule', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, ...videoEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('compiles when Redis and both bucket names are present', async () => {
    const module = await Test.createTestingModule({
      imports: [configRoot(), QueueModule, StorageModule],
    }).compile();

    expect(module.get(S3Client)).toBeInstanceOf(S3Client);
    await module.close();
  });

  it('fails Joi validation at bootstrap when REDIS_HOST is missing', async () => {
    delete process.env.REDIS_HOST;

    await expect(
      Test.createTestingModule({
        imports: [configRoot()],
      }).compile(),
    ).rejects.toThrow(/REDIS_HOST/);
  });

  it('fails Joi validation at bootstrap when the videos bucket name is missing', async () => {
    delete process.env.VIDEOS_BUCKET;

    await expect(
      Test.createTestingModule({
        imports: [configRoot()],
      }).compile(),
    ).rejects.toThrow(/VIDEOS_BUCKET/);
  });
});
