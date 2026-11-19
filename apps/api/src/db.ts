import { MongoClient } from 'mongodb';
import { env } from './env';

export const mongo = new MongoClient(env.MONGODB_URI);
await mongo.connect();
export const db = mongo.db();
