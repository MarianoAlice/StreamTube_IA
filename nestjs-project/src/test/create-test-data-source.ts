import { DataSource, EntitySchema, MigrationInterface } from 'typeorm';
import { Channel } from '../channels/entities/channel.entity';
import { Video } from '../videos/video.entity';

type EntityClass = abstract new (...args: never[]) => object;
type TestEntity = EntityClass | string | EntitySchema<Record<string, unknown>>;

interface TestDataSourceOptions {
  synchronize?: boolean;
  migrations?: (new () => MigrationInterface)[];
}

export function createTestDataSource(
  entities: TestEntity[],
  options: TestDataSourceOptions = {},
): DataSource {
  const { synchronize = true, migrations } = options;
  return new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? 'db',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME ?? 'streamtube',
    password: process.env.DB_PASSWORD ?? 'streamtube',
    database: process.env.DB_DATABASE ?? 'streamtube',
    entities: withVideoRelation(entities),
    synchronize,
    ...(migrations !== undefined && { migrations, migrationsRun: false }),
  });
}

function withVideoRelation(entities: TestEntity[]): TestEntity[] {
  if (entities.includes(Channel) && !entities.includes(Video)) {
    return [...entities, Video];
  }
  return entities;
}

export async function cleanAllTables(dataSource: DataSource): Promise<void> {
  await dataSource.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'videos'
      ) THEN
        DELETE FROM "videos";
      END IF;
    END $$;
  `);
  await dataSource.query('DELETE FROM "refresh_tokens"');
  await dataSource.query('DELETE FROM "verification_tokens"');
  await dataSource.query('DELETE FROM "channels"');
  await dataSource.query('DELETE FROM "users"');
}
