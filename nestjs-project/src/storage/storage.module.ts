import { Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import storageConfig from '../config/storage.config';
import { StorageService } from './storage.service';

@Module({
  providers: [
    {
      provide: S3Client,
      inject: [storageConfig.KEY],
      useFactory: (storage: ConfigType<typeof storageConfig>) =>
        new S3Client({
          region: storage.region,
          endpoint: storage.endpoint,
          forcePathStyle: storage.forcePathStyle,
          requestChecksumCalculation: 'WHEN_REQUIRED',
          responseChecksumValidation: 'WHEN_REQUIRED',
          credentials:
            storage.accessKeyId && storage.secretAccessKey
              ? {
                  accessKeyId: storage.accessKeyId,
                  secretAccessKey: storage.secretAccessKey,
                }
              : undefined,
        }),
    },
    StorageService,
  ],
  exports: [S3Client, StorageService],
})
export class StorageModule {}
