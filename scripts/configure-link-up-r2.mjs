import {
  S3Client,
  HeadBucketCommand,
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
} from '@aws-sdk/client-s3';

const bucket = process.env.R2_BUCKET_NAME;
if (bucket !== 'the-link-up-memories')
  throw new Error('R2_BUCKET_NAME must be the-link-up-memories.');
const client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
  },
});
const cors = {
  CORSRules: [
    {
      AllowedOrigins: ['https://dwdug.vercel.app', 'http://localhost:3000'],
      AllowedMethods: ['PUT', 'GET', 'HEAD'],
      AllowedHeaders: ['Content-Type'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 300,
    },
  ],
};
await client.send(new HeadBucketCommand({ Bucket: bucket }));
console.log('R2 private bucket connection: OK');
if (process.argv.includes('--apply')) {
  await client.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: cors }));
  console.log('Applied event CORS policy.');
  /** @type {import('@aws-sdk/client-s3').LifecycleRule[]} */
  let rules = [];
  try {
    rules =
      (await client.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }))).Rules ??
      [];
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !['NoSuchLifecycleConfiguration', 'NoSuchConfiguration'].includes(error.name)
    )
      throw error;
  }
  rules = rules.filter((rule) => rule.ID !== 'link-up-abandoned-temporary');
  await client.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: bucket,
      LifecycleConfiguration: {
        Rules: [
          ...rules,
          {
            ID: 'link-up-abandoned-temporary',
            Status: 'Enabled',
            Filter: { Prefix: 'temporary/the-link-up/' },
            Expiration: { Days: 1 },
          },
        ],
      },
    }),
  );
  console.log(
    'Applied one-day temporary-object lifecycle safeguard; retained other lifecycle rules.',
  );
}
try {
  const result = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
  console.log('Bucket CORS:', JSON.stringify(result.CORSRules));
} catch (error) {
  console.log('Bucket CORS unavailable:', error.name);
}
console.log(
  'Public access is never enabled by this script. Confirm r2.dev and custom-domain public access remain disabled in Cloudflare.',
);
