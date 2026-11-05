import { getQueueToken } from '@nestjs/bullmq';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { ChannelsService } from '../channels/channels.service';
import {
  NotChannelOwnerException,
  UploadNotCompletableException,
  UploadTooLargeException,
  VideoNotFoundException,
  VideoNotReadyException,
} from '../common/exceptions/domain.exception';
import { StorageService } from '../storage/storage.service';
import { MAX_UPLOAD_BYTES } from './upload-limits';
import { VIDEO_PROCESSING_QUEUE } from './video-processing.queue';
import { Video, VideoStatus } from './video.entity';
import { VideosService } from './videos.service';

describe('VideosService.initiate', () => {
  let service: VideosService;
  const videos = {
    create: jest.fn((value: Partial<Video>) => value),
    save: jest.fn(),
    findOneBy: jest.fn(),
  };
  const channelsService = {
    findByUserId: jest.fn(),
  };
  const storageService = {
    createMultipartUpload: jest.fn(),
    completeMultipartUpload: jest.fn(),
    presignPlayback: jest.fn(),
    presignDownload: jest.fn(),
  };
  const processingQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    videos.create.mockImplementation((value: Partial<Video>) => value);
    videos.save.mockReset();
    videos.findOneBy.mockReset();
    channelsService.findByUserId.mockReset();
    storageService.createMultipartUpload.mockReset();
    storageService.completeMultipartUpload.mockReset();
    storageService.presignPlayback.mockReset();
    storageService.presignDownload.mockReset();
    processingQueue.add.mockReset();

    const module = await Test.createTestingModule({
      providers: [
        VideosService,
        { provide: getRepositoryToken(Video), useValue: videos },
        { provide: ChannelsService, useValue: channelsService },
        { provide: StorageService, useValue: storageService },
        {
          provide: getQueueToken(VIDEO_PROCESSING_QUEUE),
          useValue: processingQueue,
        },
      ],
    }).compile();

    service = module.get(VideosService);
  });

  it('rejects an upload above 10GB before writing a row', async () => {
    await expect(
      service.initiate('user-1', {
        contentType: 'video/mp4',
        sizeBytes: MAX_UPLOAD_BYTES + 1,
        partCount: 1,
      }),
    ).rejects.toBeInstanceOf(UploadTooLargeException);

    expect(videos.save).not.toHaveBeenCalled();
    expect(storageService.createMultipartUpload).not.toHaveBeenCalled();
  });

  it('persists a draft for the user channel and returns the presigned parts', async () => {
    channelsService.findByUserId.mockResolvedValue({ id: 'channel-1' });
    videos.save
      .mockImplementationOnce((video: Partial<Video>) => ({
        ...video,
        id: '11111111-1111-4111-8111-111111111111',
        status: VideoStatus.DRAFT,
      }))
      .mockImplementationOnce((video: Video) => video);
    storageService.createMultipartUpload.mockResolvedValue({
      uploadId: 'upload-1',
      parts: [
        { partNumber: 1, url: 'http://storage/1' },
        { partNumber: 2, url: 'http://storage/2' },
      ],
    });

    const result = await service.initiate('user-1', {
      contentType: 'video/mp4',
      sizeBytes: 1048576,
      partCount: 2,
    });

    expect(videos.save).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        channel_id: 'channel-1',
        status: VideoStatus.DRAFT,
      }),
    );
    expect(storageService.createMultipartUpload).toHaveBeenCalledWith({
      videoId: '11111111-1111-4111-8111-111111111111',
      contentType: 'video/mp4',
      partCount: 2,
    });
    expect(videos.save).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ multipart_upload_id: 'upload-1' }),
    );
    expect(result).toEqual({
      id: '11111111-1111-4111-8111-111111111111',
      status: VideoStatus.DRAFT,
      uploadId: 'upload-1',
      parts: [
        { partNumber: 1, url: 'http://storage/1' },
        { partNumber: 2, url: 'http://storage/2' },
      ],
    });
  });

  const videoId = '11111111-1111-4111-8111-111111111111';
  const parts = [{ partNumber: 1, etag: 'etag-1' }];

  function draftOwnedBy(channelId: string, status = VideoStatus.DRAFT) {
    return {
      id: videoId,
      channel_id: channelId,
      status,
      multipart_upload_id: 'upload-1',
    };
  }

  it('throws VIDEO_NOT_FOUND when the video does not exist', async () => {
    videos.findOneBy.mockResolvedValue(null);

    await expect(
      service.complete('user-1', videoId, { parts }),
    ).rejects.toBeInstanceOf(VideoNotFoundException);
    expect(storageService.completeMultipartUpload).not.toHaveBeenCalled();
    expect(processingQueue.add).not.toHaveBeenCalled();
  });

  it('throws when the caller does not own the channel', async () => {
    videos.findOneBy.mockResolvedValue(draftOwnedBy('channel-1'));
    channelsService.findByUserId.mockResolvedValue({ id: 'channel-2' });

    await expect(
      service.complete('user-2', videoId, { parts }),
    ).rejects.toBeInstanceOf(NotChannelOwnerException);
    expect(videos.save).not.toHaveBeenCalled();
    expect(processingQueue.add).not.toHaveBeenCalled();
  });

  it('throws when the video is not a draft', async () => {
    videos.findOneBy.mockResolvedValue(
      draftOwnedBy('channel-1', VideoStatus.PROCESSING),
    );
    channelsService.findByUserId.mockResolvedValue({ id: 'channel-1' });

    await expect(
      service.complete('user-1', videoId, { parts }),
    ).rejects.toBeInstanceOf(UploadNotCompletableException);
    expect(storageService.completeMultipartUpload).not.toHaveBeenCalled();
    expect(videos.save).not.toHaveBeenCalled();
  });

  it('completes the multipart, enqueues processing, and stores status processing', async () => {
    const video = draftOwnedBy('channel-1');
    videos.findOneBy.mockResolvedValue(video);
    channelsService.findByUserId.mockResolvedValue({ id: 'channel-1' });
    storageService.completeMultipartUpload.mockResolvedValue(undefined);
    processingQueue.add.mockResolvedValue(undefined);
    videos.save.mockImplementation((row: Video) => row);

    const result = await service.complete('user-1', videoId, { parts });

    expect(storageService.completeMultipartUpload).toHaveBeenCalledWith({
      videoId,
      uploadId: 'upload-1',
      parts,
    });
    expect(processingQueue.add).toHaveBeenCalledWith(VIDEO_PROCESSING_QUEUE, {
      videoId,
    });
    expect(videos.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: VideoStatus.PROCESSING }),
    );
    expect(result).toEqual({ id: videoId, status: VideoStatus.PROCESSING });
  });

  it('returns id, status, and duration without calling storage', async () => {
    videos.findOneBy.mockResolvedValue({
      id: videoId,
      status: VideoStatus.READY,
      duration_seconds: 42,
    });

    await expect(service.findOne(videoId)).resolves.toEqual({
      id: videoId,
      status: VideoStatus.READY,
      duration_seconds: 42,
    });
    expect(storageService.presignPlayback).not.toHaveBeenCalled();
    expect(storageService.presignDownload).not.toHaveBeenCalled();
  });

  it('throws VIDEO_NOT_FOUND when findOne misses the row', async () => {
    videos.findOneBy.mockResolvedValue(null);

    await expect(service.findOne(videoId)).rejects.toBeInstanceOf(
      VideoNotFoundException,
    );
  });

  it('refuses playback when the video is not ready', async () => {
    videos.findOneBy.mockResolvedValue({
      id: videoId,
      status: VideoStatus.PROCESSING,
      duration_seconds: null,
    });

    await expect(service.playbackUrl(videoId)).rejects.toBeInstanceOf(
      VideoNotReadyException,
    );
    expect(storageService.presignPlayback).not.toHaveBeenCalled();
  });
});
