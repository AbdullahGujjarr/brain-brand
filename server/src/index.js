import mongoose from 'mongoose';
import { config } from './config.js';
import { createApp } from './app.js';

await mongoose.connect(config.mongoUri, { dbName: config.mongoDb, serverSelectionTimeoutMS: 15000 });
console.log(`Connected to MongoDB (${config.mongoDb})`);

createApp().listen(config.port, () => {
  console.log(`Brain Brand is running at http://localhost:${config.port}`);
});
