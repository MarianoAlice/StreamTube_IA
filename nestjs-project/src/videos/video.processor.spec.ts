import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { StorageService } from '../storage/storage.service';
import { FfmpegService } from './ffmpeg.service';
import { VideoProcessor } from './video.processor';
import { Video, VideoStatus } from './video.entity';

describe('VideoProcessor', () => {
  const videos = {
    findOneBy: jest.fn(),
    save: jest.fn((video: Video) => Promise.resolve(video)),
  };
  const storage = {
    downloadVideo: jest.fn(),
    putThumbnail: jest.fn(),
  };
  const ffmpeg = {
    inspect: jest.fn(),
  };
  const processor = new VideoProcessor(
    videos as unknown as Repository<Video>,
    storage as unknown as StorageService,
    ffmpeg as unknown as FfmpegService,
  );

  const videoId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    videos.findOneBy.mockReset();
    videos.save.mockClear();
    storage.downloadVideo.mockReset();
    storage.putThumbnail.mockReset();
    ffmpeg.inspect.mockReset();
  });

  function job(attemptsMade = 0, attempts = 3): Job<{ videoId: string }> {
    return {
      data: { videoId },
      attemptsMade,
      opts: { attempts },
    } as Job<{ videoId: string }>;
  }

  it('marks a processing video ready and stores the thumbnail under its id', async () => {
    const video = {
      id: videoId,
      status: VideoStatus.PROCESSING,
      duration_seconds: null,
      metadata: null,
    } as Video;
    videos.findOneBy.mockResolvedValue(video);
    storage.downloadVideo.mockResolvedValue(Buffer.from('source'));
    ffmpeg.inspect.mockResolvedValue({
      durationSeconds: 12,
      metadata: { format: { duration: '12' } },
      thumbnail: Buffer.from('frame'),
    });

    await processor.process(job());

    expect(storage.putThumbnail).toHaveBeenCalledWith(
      videoId,
      Buffer.from('frame'),
      'image/jpeg',
    );
    expect(videos.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: VideoStatus.READY,
        duration_seconds: 12,
        metadata: { format: { duration: '12' } },
      }),
    );
  });

  it('does not change a video that is already ready', async () => {
    videos.findOneBy.mockResolvedValue({
      id: videoId,
      status: VideoStatus.READY,
      duration_seconds: 12,
      metadata: { format: 'mp4' },
    });

    await processor.process(job());

    expect(storage.downloadVideo).not.toHaveBeenCalled();
    expect(videos.save).not.toHaveBeenCalled();
  });

  it('keeps the row and sets failed only after retries are exhausted', async () => {
    const video = {
      id: videoId,
      status: VideoStatus.PROCESSING,
    } as Video;
    videos.findOneBy.mockResolvedValue(video);

    await processor.onFailed(job(1, 3));
    expect(videos.save).not.toHaveBeenCalled();

    await processor.onFailed(job(3, 3));
    expect(videos.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: videoId, status: VideoStatus.FAILED }),
    );
    expect(videos.findOneBy).toHaveBeenCalledWith({ id: videoId });
  });

  it('does not overwrite ready when a later failure event arrives', async () => {
    videos.findOneBy.mockResolvedValue({
      id: videoId,
      status: VideoStatus.READY,
    });

    await processor.onFailed(job(3, 3));

    expect(videos.save).not.toHaveBeenCalled();
  });
});
