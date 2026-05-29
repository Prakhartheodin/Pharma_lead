import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['email', 'phone', 'whatsapp'], required: true },
    value: { type: String, required: true },
    normalizedValue: String,
    label: {
      type: String,
      enum: ['sales', 'purchase', 'export', 'info', 'support', 'unknown'],
      default: 'unknown',
    },
    sourceUrl: String,
    source: { type: String, enum: ['crawl', 'google_places'], default: 'crawl' },
    confidence: { type: Number, default: 0 },
    verificationStatus: {
      type: String,
      enum: ['extracted', 'valid', 'invalid', 'bounced', 'manual'],
      default: 'extracted',
    },
  },
  { _id: false }
);

const schema = new mongoose.Schema(
  {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'PharmaLeadSearchJob', index: true },
    companyName: String,
    website: String,
    domain: { type: String, index: true },
    city: String,
    state: String,
    country: { type: String, default: 'India' },
    matchedDrugs: { type: [String], default: [] },
    businessType: {
      type: String,
      enum: ['manufacturer', 'supplier', 'exporter', 'distributor', 'buyer', 'unknown'],
      default: 'unknown',
    },
    sourceUrls: { type: [String], default: [] },
    confidence: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['new', 'verified', 'selected', 'contacted', 'replied', 'rejected'],
      default: 'new',
    },
    contacts: { type: [contactSchema], default: [] },
    saved: { type: Boolean, default: false, index: true },
    lastCrawledAt: Date,
    notes: { type: String, default: '' },
    doNotContact: { type: Boolean, default: false, index: true },
    lastPitchedAt: Date,
    lastPitchedDrugs: { type: [String], default: [] },
  },
  { timestamps: true }
);

// ingest idempotency: one lead per (job, domain)
schema.index({ jobId: 1, domain: 1 }, { unique: true });

export const PharmaLead = mongoose.model('PharmaLead', schema);
