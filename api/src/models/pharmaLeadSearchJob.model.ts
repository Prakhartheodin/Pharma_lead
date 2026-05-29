import mongoose from 'mongoose';

const progressSchema = new mongoose.Schema(
  {
    discoveredUrls: { type: Number, default: 0 },
    crawledDomains: { type: Number, default: 0 },
    leadsCreated: { type: Number, default: 0 },
    failedDomains: { type: Number, default: 0 },
  },
  { _id: false }
);

const schema = new mongoose.Schema(
  {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    drugs: { type: [String], required: true },
    city: String,
    state: String,
    batchStart: { type: Number, default: 0 },
    batchSize: { type: Number, default: 50 },
    status: {
      type: String,
      enum: ['queued', 'running', 'paused', 'completed', 'failed', 'cancelled'],
      default: 'queued',
    },
    progress: { type: progressSchema, default: () => ({}) },
    error: String,
    startedAt: Date,
    completedAt: Date,
  },
  { timestamps: true }
);

export const PharmaLeadSearchJob = mongoose.model('PharmaLeadSearchJob', schema);
