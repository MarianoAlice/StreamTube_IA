import { Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import queueConfig from '../config/queue.config';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [queueConfig.KEY],
      useFactory: (queue: ConfigType<typeof queueConfig>) => ({
        connection: {
          host: queue.host,
          port: queue.port,
        },
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
