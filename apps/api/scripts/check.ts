import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { MongoClient } from 'mongodb';
import Redis from 'ioredis';
import { env } from '../src/env';

const s3 = new S3Client({ region: env.AWS_REGION });
const Key = 'healthcheck/hello.txt';
await s3.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key, Body: 'hello' }));
await s3.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key }));
await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key }));
console.log('S3 ok');

const mongo = new MongoClient(env.MONGODB_URI);
await mongo.connect();
await mongo.db().command({ ping: 1 });
await mongo.close();
console.log('Mongo ok');

const redis = new Redis(env.REDIS_URL);
console.log('Redis', await redis.ping());
redis.disconnect();
