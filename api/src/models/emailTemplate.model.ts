import mongoose from 'mongoose';

export const EMAIL_TEMPLATE_MAX_HTML_LENGTH = 65536;

const schema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    subject: { type: String, trim: true, maxlength: 500, default: '' },
    bodyHtml: { type: String, required: true, maxlength: EMAIL_TEMPLATE_MAX_HTML_LENGTH },
    isShared: { type: Boolean, default: false },
  },
  { timestamps: true }
);

schema.index({ user: 1, title: 1 });

export const EmailTemplate = mongoose.model('EmailTemplate', schema);
