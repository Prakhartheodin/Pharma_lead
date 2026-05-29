import mongoose from 'mongoose';

// Ported from Dharwin (emailAccount.model.js), trimmed to Gmail.
// NOTE (plan open question): tokens are stored here. Consider encrypting
// accessToken/refreshToken at rest — a refresh token is long-lived send access.
const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    provider: { type: String, enum: ['gmail'], required: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    accessToken: { type: String, required: true, select: false },
    refreshToken: { type: String, default: null, select: false },
    tokenExpiry: { type: Date, default: null },
    status: { type: String, enum: ['active', 'revoked', 'error'], default: 'active' },
  },
  { timestamps: true }
);

schema.index({ user: 1, provider: 1, email: 1 }, { unique: true });
schema.index({ user: 1, status: 1 });

export const EmailAccount = mongoose.model('EmailAccount', schema);
