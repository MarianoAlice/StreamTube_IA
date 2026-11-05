import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { StorageService } from '../storage/storage.service';
import { FfmpegService } from './ffmpeg.service';
import { VIDEO_PROCESSING_QUEUE } from './video-processing.queue';
import { Video, VideoStatus } from './video.entity';

interface VideoProcessingJob {
  videoId: string;
}

@Injectable()
@Processor(VIDEO_PROCESSING_QUEUE)
export class VideoProcessor extends WorkerHost {
  constructor(
    @InjectRepository(Video)
    private readonly videos: Repository<Video>,
    private readonly storageService: StorageService,
    private readonly ffmpegService: FfmpegService,
  ) {
    super();
  }

  async process(job: Job<VideoProcessingJob>): Promise<void> {
    const video = await this.videos.findOneBy({ id: job.data.videoId });
    if (!video) {
      throw new Error(`Video ${job.data.videoId} was not found`);
    }
    if (
      video.status === VideoStatus.READY ||
      video.status === VideoStatus.FAILED
    ) {
      return;
    }

    const source = await this.storageService.downloadVideo(video.id);
    const inspected = await this.ffmpegService.inspect(source);
    await this.storageService.putThumbnail(
      video.id,
      inspected.thumbnail,
      'image/jpeg',
    );

    video.duration_seconds = inspected.durationSeconds;
    video.metadata = inspected.metadata;
    video.status = VideoStatus.READY;
    await this.videos.save(video);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<VideoProcessingJob>): Promise<void> {
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < attempts) {
      return;
    }

    const video = await this.videos.findOneBy({ id: job.data.videoId });
    if (!video || video.status === VideoStatus.READY) {
      return;
    }

    video.status = VideoStatus.FAILED;
    await this.videos.save(video);
  }
}
