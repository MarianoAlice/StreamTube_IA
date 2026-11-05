import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => {
  const endpoint = process.env.STORAGE_ENDPOINT || undefined;

  return {
    region: process.env.STORAGE_REGION || 'us-east-1',
    endpoint,
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || undefined,
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY || undefined,
    videosBucket: process.env.VIDEOS_BUCKET || '',
    thumbnailsBucket: process.env.THUMBNAILS_BUCKET || '',
    forcePathStyle: Boolean(endpoint),
  };
});
