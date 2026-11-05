import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import { ChannelsService } from '../channels/channels.service';
import {
  NotChannelOwnerException,
  UploadNotCompletableException,
  UploadTooLargeException,
  VideoNotFoundException,
  VideoNotReadyException,
} from '../common/exceptions/domain.exception';
import { StorageService } from '../storage/storage.service';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { InitiateUploadDto } from './dto/initiate-upload.dto';
import { MAX_UPLOAD_BYTES } from './upload-limits';
import { VIDEO_PROCESSING_QUEUE } from './video-processing.queue';
import { Video, VideoStatus } from './video.entity';

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video)
    private readonly videos: Repository<Video>,
    private readonly channelsService: ChannelsService,
    private readonly storageService: StorageService,
    @InjectQueue(VIDEO_PROCESSING_QUEUE)
    private readonly processingQueue: Queue,
  ) {}

  async initiate(
    userId: string,
    dto: InitiateUploadDto,
  ): Promise<{
    id: string;
    status: VideoStatus;
    uploadId: string;
    parts: { partNumber: number; url: string }[];
  }> {
    if (dto.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new UploadTooLargeException();
    }

    const channel = await this.channelsService.findByUserId(userId);
    if (!channel) {
      throw new Error('Authenticated user has no channel');
    }

    const video = await this.videos.save(
      this.videos.create({
        channel_id: channel.id,
        status: VideoStatus.DRAFT,
      }),
    );

    const upload = await this.storageService.createMultipartUpload({
      videoId: video.id,
      contentType: dto.contentType,
      partCount: dto.partCount,
    });

    video.multipart_upload_id = upload.uploadId;
    await this.videos.save(video);

    return {
      id: video.id,
      status: video.status,
      uploadId: upload.uploadId,
      parts: upload.parts,
    };
  }

  async complete(
    userId: string,
    videoId: string,
    dto: CompleteUploadDto,
  ): Promise<{ id: string; status: VideoStatus }> {
    const video = await this.videos.findOneBy({ id: videoId });
    if (!video) {
      throw new VideoNotFoundException();
    }

    const channel = await this.channelsService.findByUserId(userId);
    if (!channel || channel.id !== video.channel_id) {
      throw new NotChannelOwnerException();
    }

    if (video.status !== VideoStatus.DRAFT || !video.multipart_upload_id) {
      throw new UploadNotCompletableException();
    }

    await this.storageService.completeMultipartUpload({
      videoId: video.id,
      uploadId: video.multipart_upload_id,
      parts: dto.parts,
    });

    await this.processingQueue.add(VIDEO_PROCESSING_QUEUE, {
      videoId: video.id,
    });

    video.status = VideoStatus.PROCESSING;
    await this.videos.save(video);

    return { id: video.id, status: video.status };
  }

  async findOne(videoId: string): Promise<{
    id: string;
    status: VideoStatus;
    duration_seconds: number | null;
  }> {
    const video = await this.videos.findOneBy({ id: videoId });
    if (!video) {
      throw new VideoNotFoundException();
    }

    return {
      id: video.id,
      status: video.status,
      duration_seconds: video.duration_seconds,
    };
  }

  async playbackUrl(videoId: string): Promise<{ url: string }> {
    const video = await this.requireReady(videoId);
    return this.storageService.presignPlayback(video.id);
  }

  async downloadUrl(videoId: string): Promise<{ url: string }> {
    const video = await this.requireReady(videoId);
    return this.storageService.presignDownload(video.id);
  }

  private async requireReady(videoId: string): Promise<Video> {
    const video = await this.videos.findOneBy({ id: videoId });
    if (!video) {
      throw new VideoNotFoundException();
    }
    if (video.status !== VideoStatus.READY) {
      throw new VideoNotReadyException();
    }
    return video;
  }
}
