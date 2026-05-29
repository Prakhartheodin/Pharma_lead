import mongoose from 'mongoose';

export const EMAIL_SIGNATURE_MAX_HTML_LENGTH = 65536;

const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    html: { type: String, default: '', maxlength: EMAIL_SIGNATURE_MAX_HTML_LENGTH },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const EmailSignature = mongoose.model('EmailSignature', schema);
