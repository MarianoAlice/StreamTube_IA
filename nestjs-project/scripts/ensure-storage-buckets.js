const {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} = require('@aws-sdk/client-s3');
require('dotenv').config();

const buckets = [process.env.VIDEOS_BUCKET, process.env.THUMBNAILS_BUCKET];

const client = new S3Client({
  region: process.env.STORAGE_REGION || 'us-east-1',
  endpoint: process.env.STORAGE_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureBucket(bucket) {
  let lastError;

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      return;
    } catch {
      try {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
        return;
      } catch (error) {
        if (
          error.name === 'BucketAlreadyOwnedByYou' ||
          error.name === 'BucketAlreadyExists'
        ) {
          return;
        }
        lastError = error;
        await sleep(1000);
      }
    }
  }

  throw lastError;
}

async function main() {
  for (const bucket of buckets) {
    if (!bucket) {
      throw new Error('VIDEOS_BUCKET and THUMBNAILS_BUCKET are required');
    }
    await ensureBucket(bucket);
  }
  console.log(`buckets ready: ${buckets.join(', ')}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
