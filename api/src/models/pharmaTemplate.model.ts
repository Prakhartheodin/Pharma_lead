import mongoose from 'mongoose';

// Subject/bodyHtml support {{variables}} (e.g. {{companyName}}, {{matchedDrugs}}).
const schema = new mongoose.Schema(
  {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    name: { type: String, required: true },
    subject: { type: String, required: true },
    bodyHtml: { type: String, required: true },
    variables: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const PharmaTemplate = mongoose.model('PharmaTemplate', schema);
