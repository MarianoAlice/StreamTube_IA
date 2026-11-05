import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChannelsModule } from '../channels/channels.module';
import { StorageModule } from '../storage/storage.module';
import {
  VIDEO_PROCESSING_ATTEMPTS,
  VIDEO_PROCESSING_QUEUE,
} from './video-processing.queue';
import { Video } from './video.entity';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Video]),
    ChannelsModule,
    StorageModule,
    BullModule.registerQueue({
      name: VIDEO_PROCESSING_QUEUE,
      defaultJobOptions: {
        attempts: VIDEO_PROCESSING_ATTEMPTS,
        backoff: { type: 'exponential', delay: 1000 },
      },
    }),
  ],
  controllers: [VideosController],
  providers: [VideosService],
  exports: [TypeOrmModule, VideosService],
})
export class VideosModule {}
