import mongoose from 'mongoose';
import { config } from './config.js';

export async function connectDb(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(config.mongoUrl);
  // eslint-disable-next-line no-console
  console.log('[db] connected:', config.mongoUrl);
}
