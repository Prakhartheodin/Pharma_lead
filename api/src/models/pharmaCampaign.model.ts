import mongoose from 'mongoose';

const schema = new mongoose.Schema(
  {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    gmailAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'EmailAccount', required: true },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'PharmaTemplate', required: true },
    leadIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PharmaLead' }],
    status: { type: String, enum: ['draft', 'sending', 'sent', 'failed'], default: 'draft' },
    sentCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    sentAt: Date,
  },
  { timestamps: true }
);

export const PharmaCampaign = mongoose.model('PharmaCampaign', schema);
