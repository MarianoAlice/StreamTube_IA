import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Channel } from '../channels/entities/channel.entity';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { Video, VideoStatus } from './video.entity';

const ALL_ENTITIES = [User, Channel, RefreshToken, VerificationToken, Video];

describe('Video entity (integration)', () => {
  let dataSource: DataSource;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;
  let videoRepository: Repository<Video>;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    userRepository = dataSource.getRepository(User);
    channelRepository = dataSource.getRepository(Channel);
    videoRepository = dataSource.getRepository(Video);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
  });

  let userCounter = 0;
  async function createChannel(): Promise<Channel> {
    const user = await userRepository.save(
      userRepository.create({
        email: `video_user_${++userCounter}@example.com`,
        password: 'hashed',
      }),
    );

    return channelRepository.save(
      channelRepository.create({
        name: 'Canal',
        nickname: `canal_${userCounter}`,
        user_id: user.id,
      }),
    );
  }

  it('rejects a video without channel_id and does not persist the row', async () => {
    await expect(
      videoRepository.save(videoRepository.create({})),
    ).rejects.toThrow();

    const rows = await videoRepository.find();
    expect(rows).toHaveLength(0);
  });

  it('defaults status to draft and leaves duration_seconds null', async () => {
    const channel = await createChannel();

    const saved = await videoRepository.save(
      videoRepository.create({ channel_id: channel.id }),
    );

    expect(saved.status).toBe(VideoStatus.DRAFT);
    expect(saved.duration_seconds).toBeNull();
  });

  it('assigns distinct uuid ids to two videos of the same channel', async () => {
    const channel = await createChannel();

    const first = await videoRepository.save(
      videoRepository.create({ channel_id: channel.id }),
    );
    const second = await videoRepository.save(
      videoRepository.create({ channel_id: channel.id }),
    );

    expect(first.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(second.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(first.id).not.toBe(second.id);
  });
});
