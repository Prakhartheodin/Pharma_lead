import { EmailTemplate } from '../../models/emailTemplate.model.js';

function mapDoc(doc: { toJSON: () => Record<string, unknown> }) {
  const json = doc.toJSON() as Record<string, unknown>;
  return {
    id: String(json.id ?? json._id),
    title: json.title,
    subject: json.subject,
    bodyHtml: json.bodyHtml,
    isShared: json.isShared,
    createdAt: json.createdAt,
    updatedAt: json.updatedAt,
  };
}

export async function listTemplatesForUser(userId: string) {
  const own = await EmailTemplate.find({ user: userId }).sort({ updatedAt: -1 });
  const sharedDocs = await EmailTemplate.find({ isShared: true, user: { $ne: userId } })
    .populate('user', 'name email')
    .sort({ updatedAt: -1 });

  const shared = sharedDocs.map((doc) => {
    const json = mapDoc(doc);
    const owner = doc.user as { _id?: unknown; name?: string; email?: string } | null;
    return {
      ...json,
      owner: owner
        ? { id: String(owner._id), name: owner.name, email: owner.email }
        : undefined,
    };
  });

  return {
    own: own.map(mapDoc),
    shared,
  };
}

export async function createTemplate(
  userId: string,
  body: { title: string; subject?: string; bodyHtml: string; isShared?: boolean }
) {
  const doc = await EmailTemplate.create({
    user: userId,
    title: body.title,
    subject: body.subject ?? '',
    bodyHtml: body.bodyHtml,
    isShared: Boolean(body.isShared),
  });
  return mapDoc(doc);
}

async function getOwnedTemplateOrThrow(templateId: string, userId: string) {
  const t = await EmailTemplate.findById(templateId);
  if (!t) {
    const err = new Error('Template not found');
    (err as { status?: number }).status = 404;
    throw err;
  }
  if (String(t.user) !== String(userId)) {
    const err = new Error('You can only edit your own templates');
    (err as { status?: number }).status = 403;
    throw err;
  }
  return t;
}

export async function updateTemplateById(
  templateId: string,
  userId: string,
  body: Partial<{ title: string; subject: string; bodyHtml: string; isShared: boolean }>
) {
  const t = await getOwnedTemplateOrThrow(templateId, userId);
  if (body.title !== undefined) t.title = body.title;
  if (body.subject !== undefined) t.subject = body.subject;
  if (body.bodyHtml !== undefined) t.bodyHtml = body.bodyHtml;
  if (body.isShared !== undefined) t.isShared = Boolean(body.isShared);
  await t.save();
  return mapDoc(t);
}

export async function deleteTemplateById(templateId: string, userId: string) {
  const t = await getOwnedTemplateOrThrow(templateId, userId);
  await t.deleteOne();
}
