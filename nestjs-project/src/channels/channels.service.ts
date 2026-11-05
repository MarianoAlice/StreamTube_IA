import { Injectable } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { appendRandomSuffix, sanitizeNickname } from './nickname.util';
import { Channel } from './entities/channel.entity';

const PG_UNIQUE_VIOLATION = '23505';
const NICKNAME_COLUMN = 'nickname';
const MAX_RETRIES = 5;

function readUnknown(value: unknown): unknown {
  return value;
}

function pgErrorFields(value: unknown): { code?: unknown; detail?: unknown } {
  if (typeof value !== 'object' || value === null) return {};
  const record = value as Record<string, unknown>;
  return { code: record.code, detail: record.detail };
}

function isPgUniqueViolationOnColumn(err: unknown, column: string): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const fromDriver = pgErrorFields(readUnknown(err.driverError));
  const fromError = pgErrorFields(err);
  const code = fromDriver.code ?? fromError.code;
  const detail = fromDriver.detail ?? fromError.detail;
  return (
    code === PG_UNIQUE_VIOLATION &&
    typeof detail === 'string' &&
    detail.includes(column)
  );
}

@Injectable()
export class ChannelsService {
  constructor(private readonly dataSource: DataSource) {}

  async createChannel(userId: string, email: string): Promise<Channel> {
    const baseNickname = sanitizeNickname(email.split('@')[0]);

    return this.dataSource.transaction(async (manager) => {
      let nickname = baseNickname;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const existing = await manager.findOne(Channel, {
          where: { nickname },
        });
        if (existing) {
          nickname = appendRandomSuffix(baseNickname);
          continue;
        }

        try {
          return await manager.save(
            manager.create(Channel, {
              name: baseNickname,
              nickname,
              user_id: userId,
            }),
          );
        } catch (err) {
          if (isPgUniqueViolationOnColumn(err, NICKNAME_COLUMN)) {
            // Concurrent insert between pre-check and save — retry with new suffix
            nickname = appendRandomSuffix(baseNickname);
          } else {
            throw err;
          }
        }
      }

      throw new Error(
        'Nickname conflict could not be resolved after max retries',
      );
    });
  }

  async findByUserId(userId: string): Promise<Channel | null> {
    return this.dataSource.getRepository(Channel).findOne({
      where: { user_id: userId },
    });
  }
}
