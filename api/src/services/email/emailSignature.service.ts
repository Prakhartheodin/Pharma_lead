import { EmailSignature } from '../../models/emailSignature.model.js';

function mapDoc(doc: { toJSON: () => Record<string, unknown> }) {
  const json = doc.toJSON() as Record<string, unknown>;
  return {
    id: String(json.id ?? json._id),
    html: json.html,
    enabled: json.enabled,
    createdAt: json.createdAt,
    updatedAt: json.updatedAt,
  };
}

export async function getOrCreateSignature(userId: string) {
  let doc = await EmailSignature.findOne({ user: userId });
  if (!doc) {
    doc = await EmailSignature.create({ user: userId, html: '', enabled: true });
  }
  return mapDoc(doc);
}

export async function updateSignature(
  userId: string,
  { html, enabled }: { html?: string; enabled?: boolean }
) {
  let doc = await EmailSignature.findOne({ user: userId });
  if (!doc) {
    doc = await EmailSignature.create({
      user: userId,
      html: html !== undefined ? html : '',
      enabled: enabled !== undefined ? enabled : true,
    });
    return mapDoc(doc);
  }
  if (html !== undefined) doc.html = html;
  if (enabled !== undefined) doc.enabled = enabled;
  await doc.save();
  return mapDoc(doc);
}
