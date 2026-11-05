import { DataSource, Repository } from 'typeorm';
import { Queue } from 'bullmq';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { ChannelsService } from '../channels/channels.service';
import { Channel } from '../channels/entities/channel.entity';
import { VideoNotReadyException } from '../common/exceptions/domain.exception';
import { StorageService } from '../storage/storage.service';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { Video, VideoStatus } from './video.entity';
import { VideosService } from './videos.service';

const ALL_ENTITIES = [User, Channel, RefreshToken, VerificationToken, Video];

describe('VideosService.initiate (integration)', () => {
  let dataSource: DataSource;
  let service: VideosService;
  let userRepository: Repository<User>;
  let videoRepository: Repository<Video>;
  const storageService = {
    createMultipartUpload: jest.fn(),
    completeMultipartUpload: jest.fn(),
    presignPlayback: jest.fn(),
    presignDownload: jest.fn(),
  };
  const processingQueue = {
    add: jest.fn(),
  };

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    userRepository = dataSource.getRepository(User);
    videoRepository = dataSource.getRepository(Video);
    service = new VideosService(
      videoRepository,
      new ChannelsService(dataSource),
      storageService as unknown as StorageService,
      processingQueue as unknown as Queue,
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    storageService.createMultipartUpload.mockReset();
    storageService.createMultipartUpload.mockResolvedValue({
      uploadId: 'upload-db',
      parts: [{ partNumber: 1, url: 'http://storage/1' }],
    });
    storageService.completeMultipartUpload.mockReset();
    storageService.completeMultipartUpload.mockResolvedValue(undefined);
    processingQueue.add.mockReset();
    processingQueue.add.mockResolvedValue(undefined);
    storageService.presignPlayback.mockReset();
    storageService.presignPlayback.mockResolvedValue({
      url: 'http://storage/playback',
    });
    storageService.presignDownload.mockReset();
    storageService.presignDownload.mockResolvedValue({
      url: 'http://storage/download',
    });
  });

  let userCounter = 0;

  it('stores a draft row on the authenticated user channel', async () => {
    const user = await userRepository.save(
      userRepository.create({
        email: `video_svc_${++userCounter}@example.com`,
        password: 'hashed',
      }),
    );
    const channel = await new ChannelsService(dataSource).createChannel(
      user.id,
      user.email,
    );

    const result = await service.initiate(user.id, {
      contentType: 'video/mp4',
      sizeBytes: 1048576,
      partCount: 1,
    });

    const row = await videoRepository.findOneBy({ id: result.id });
    expect(row).not.toBeNull();
    expect(row!.status).toBe(VideoStatus.DRAFT);
    expect(row!.channel_id).toBe(channel.id);
    expect(row!.multipart_upload_id).toBe('upload-db');
    expect(row!.duration_seconds).toBeNull();
  });

  it('moves the owner draft to processing', async () => {
    const user = await userRepository.save(
      userRepository.create({
        email: `video_complete_${++userCounter}@example.com`,
        password: 'hashed',
      }),
    );
    const channel = await new ChannelsService(dataSource).createChannel(
      user.id,
      user.email,
    );
    const video = await videoRepository.save(
      videoRepository.create({
        channel_id: channel.id,
        status: VideoStatus.DRAFT,
        multipart_upload_id: 'upload-db',
      }),
    );

    const result = await service.complete(user.id, video.id, {
      parts: [{ partNumber: 1, etag: 'etag-1' }],
    });

    const row = await videoRepository.findOneBy({ id: video.id });
    expect(result).toEqual({ id: video.id, status: VideoStatus.PROCESSING });
    expect(row!.status).toBe(VideoStatus.PROCESSING);
    expect(processingQueue.add).toHaveBeenCalledWith('video.processing', {
      videoId: video.id,
    });
  });

  it('returns a playback url only when the stored status is ready', async () => {
    const user = await userRepository.save(
      userRepository.create({
        email: `video_playback_${++userCounter}@example.com`,
        password: 'hashed',
      }),
    );
    const channel = await new ChannelsService(dataSource).createChannel(
      user.id,
      user.email,
    );
    const ready = await videoRepository.save(
      videoRepository.create({
        channel_id: channel.id,
        status: VideoStatus.READY,
        duration_seconds: 12,
        metadata: { format: { duration: '12.0' } },
      }),
    );
    const processing = await videoRepository.save(
      videoRepository.create({
        channel_id: channel.id,
        status: VideoStatus.PROCESSING,
      }),
    );

    await expect(service.playbackUrl(ready.id)).resolves.toEqual({
      url: 'http://storage/playback',
    });
    await expect(service.playbackUrl(processing.id)).rejects.toBeInstanceOf(
      VideoNotReadyException,
    );

    const readyRow = await videoRepository.findOneBy({ id: ready.id });
    expect(readyRow!.status).toBe(VideoStatus.READY);
    expect(readyRow!.duration_seconds).toBe(12);
    expect(storageService.presignPlayback).toHaveBeenCalledTimes(1);
    expect(storageService.presignPlayback).toHaveBeenCalledWith(ready.id);
  });

  it('returns a download url only when the stored status is ready', async () => {
    const user = await userRepository.save(
      userRepository.create({
        email: `video_download_${++userCounter}@example.com`,
        password: 'hashed',
      }),
    );
    const channel = await new ChannelsService(dataSource).createChannel(
      user.id,
      user.email,
    );
    const ready = await videoRepository.save(
      videoRepository.create({
        channel_id: channel.id,
        status: VideoStatus.READY,
        duration_seconds: 12,
      }),
    );

    await expect(service.downloadUrl(ready.id)).resolves.toEqual({
      url: 'http://storage/download',
    });
    expect(storageService.presignDownload).toHaveBeenCalledWith(ready.id);
  });
});
