import { Inject, Injectable } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import {
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import storageConfig from '../config/storage.config';

const PRESIGN_EXPIRES_IN_SECONDS = 3600;

export interface MultipartPartUrl {
  partNumber: number;
  url: string;
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

@Injectable()
export class StorageService {
  constructor(
    private readonly s3: S3Client,
    @Inject(storageConfig.KEY)
    private readonly storage: ConfigType<typeof storageConfig>,
  ) {}

  async createMultipartUpload(input: {
    videoId: string;
    contentType: string;
    partCount: number;
  }): Promise<{ uploadId: string; parts: MultipartPartUrl[] }> {
    const created = await this.s3.send(
      new CreateMultipartUploadCommand({
        Bucket: this.storage.videosBucket,
        Key: input.videoId,
        ContentType: input.contentType,
      }),
    );

    const uploadId = created.UploadId;
    if (!uploadId) {
      throw new Error('Multipart upload did not return an upload id');
    }

    const parts = await Promise.all(
      Array.from({ length: input.partCount }, (_, index) =>
        this.presignUploadPart(input.videoId, uploadId, index + 1),
      ),
    );

    return { uploadId, parts };
  }

  async completeMultipartUpload(input: {
    videoId: string;
    uploadId: string;
    parts: CompletedPart[];
  }): Promise<void> {
    await this.s3.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.storage.videosBucket,
        Key: input.videoId,
        UploadId: input.uploadId,
        MultipartUpload: {
          Parts: [...input.parts]
            .sort((left, right) => left.partNumber - right.partNumber)
            .map((part) => ({
              PartNumber: part.partNumber,
              ETag: part.etag,
            })),
        },
      }),
    );
  }

  async presignPlayback(videoId: string): Promise<{ url: string }> {
    const url = await getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.storage.videosBucket,
        Key: videoId,
      }),
      { expiresIn: PRESIGN_EXPIRES_IN_SECONDS },
    );

    return { url };
  }

  async presignDownload(videoId: string): Promise<{ url: string }> {
    const url = await getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.storage.videosBucket,
        Key: videoId,
        ResponseContentDisposition: 'attachment; filename="video.mp4"',
      }),
      { expiresIn: PRESIGN_EXPIRES_IN_SECONDS },
    );

    return { url };
  }

  async downloadVideo(videoId: string): Promise<Buffer> {
    const response = await this.s3.send(
      new GetObjectCommand({
        Bucket: this.storage.videosBucket,
        Key: videoId,
      }),
    );
    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) {
      throw new Error('Video object is empty');
    }
    return Buffer.from(bytes);
  }

  async putThumbnail(
    videoId: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.storage.thumbnailsBucket,
        Key: videoId,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  private async presignUploadPart(
    videoId: string,
    uploadId: string,
    partNumber: number,
  ): Promise<MultipartPartUrl> {
    const url = await getSignedUrl(
      this.s3,
      new UploadPartCommand({
        Bucket: this.storage.videosBucket,
        Key: videoId,
        UploadId: uploadId,
        PartNumber: partNumber,
      }),
      { expiresIn: PRESIGN_EXPIRES_IN_SECONDS },
    );

    return { partNumber, url };
  }
}
