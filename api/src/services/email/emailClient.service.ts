import { EmailAccount } from '../../models/emailAccount.model.js';
// Full provider is JS (ported from Dharwin); typed via gmailProvider.full.d.ts
import * as gmailProvider from './gmailProvider.full.js';

async function getGmailAccountForUser(accountId: string, userId: string) {
  const account = await EmailAccount.findOne({ _id: accountId, user: userId }).select(
    '+accessToken +refreshToken +tokenExpiry'
  );
  if (!account) {
    const err = new Error('Email account not found');
    (err as { status?: number }).status = 404;
    throw err;
  }
  if (account.provider !== 'gmail') {
    const err = new Error('Account is not a Gmail account');
    (err as { status?: number }).status = 400;
    throw err;
  }
  return account;
}

export async function listGmailAccounts(userId: string) {
  const accounts = await EmailAccount.find({ user: userId, status: 'active', provider: 'gmail' })
    .select('provider email status createdAt')
    .lean();
  return accounts.map((a) => ({ id: a._id.toString(), ...a }));
}

export function getGoogleAuthUrl(userId: string) {
  return gmailProvider.getAuthUrl(userId);
}

export async function handleGoogleCallback(code: string, userId: string, stateEncoded = '') {
  return gmailProvider.handleCallback(code, userId, stateEncoded);
}

export async function disconnectGmailAccount(accountId: string, userId: string) {
  const account = await getGmailAccountForUser(accountId, userId);
  account.status = 'revoked';
  await account.save();
  return { success: true };
}

export async function listMessages(
  accountId: string,
  userId: string,
  opts: { labelId?: string; pageToken?: string; pageSize?: number; query?: string } = {}
) {
  const account = await getGmailAccountForUser(accountId, userId);
  return gmailProvider.listMessages(account, opts);
}

export async function listThreads(
  accountId: string,
  userId: string,
  opts: { labelId?: string; pageToken?: string; pageSize?: number; query?: string } = {}
) {
  const account = await getGmailAccountForUser(accountId, userId);
  return gmailProvider.listThreads(account, opts);
}

export async function getThread(accountId: string, userId: string, threadId: string) {
  const account = await getGmailAccountForUser(accountId, userId);
  return gmailProvider.getThread(account, threadId);
}

export async function getMessage(accountId: string, userId: string, messageId: string) {
  const account = await getGmailAccountForUser(accountId, userId);
  return gmailProvider.getMessage(account, messageId);
}

export async function getAttachment(
  accountId: string,
  userId: string,
  messageId: string,
  attachmentId: string
) {
  const account = await getGmailAccountForUser(accountId, userId);
  return gmailProvider.getAttachment(account, messageId, attachmentId);
}

export async function sendMessage(
  accountId: string,
  userId: string,
  payload: {
    to: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    subject?: string;
    html?: string;
    attachments?: { filename: string; content: string | Buffer; mimeType?: string }[];
  }
) {
  const account = await getGmailAccountForUser(accountId, userId);
  return gmailProvider.sendMessage(account, payload);
}

export async function replyMessage(
  accountId: string,
  userId: string,
  messageId: string,
  payload: { html?: string; attachments?: { filename: string; content: string | Buffer; mimeType?: string }[] }
) {
  const account = await getGmailAccountForUser(accountId, userId);
  return gmailProvider.replyMessage(account, messageId, payload);
}

export async function replyAllMessage(
  accountId: string,
  userId: string,
  messageId: string,
  payload: { html?: string; attachments?: { filename: string; content: string | Buffer; mimeType?: string }[] }
) {
  const account = await getGmailAccountForUser(accountId, userId);
  return gmailProvider.replyAllMessage(account, messageId, payload);
}

export async function forwardMessage(
  accountId: string,
  userId: string,
  messageId: string,
  payload: {
    to: string | string[];
    html?: string;
    attachments?: { filename: string; content: string | Buffer; mimeType?: string }[];
  }
) {
  const account = await getGmailAccountForUser(accountId, userId);
  return gmailProvider.forwardMessage(account, messageId, payload);
}

export async function modifyMessage(
  accountId: string,
  userId: string,
  messageId: string,
  { addLabelIds = [], removeLabelIds = [] }: { addLabelIds?: string[]; removeLabelIds?: string[] } = {}
) {
  const account = await getGmailAccountForUser(accountId, userId);
  return gmailProvider.modifyMessage(account, messageId, { addLabelIds, removeLabelIds });
}

export async function batchModifyMessages(
  accountId: string,
  userId: string,
  messageIds: string[],
  { addLabelIds = [], removeLabelIds = [] }: { addLabelIds?: string[]; removeLabelIds?: string[] } = {}
) {
  if (!messageIds?.length) return { success: true, modified: 0 };
  const account = await getGmailAccountForUser(accountId, userId);
  return gmailProvider.batchModifyMessages(account, messageIds, { addLabelIds, removeLabelIds });
}

export async function batchModifyThreads(
  accountId: string,
  userId: string,
  threadIds: string[],
  { addLabelIds = [], removeLabelIds = [] }: { addLabelIds?: string[]; removeLabelIds?: string[] } = {}
) {
  if (!threadIds?.length) return { success: true, modified: 0 };
  const account = await getGmailAccountForUser(accountId, userId);
  return gmailProvider.batchModifyThreads(account, threadIds, { addLabelIds, removeLabelIds });
}

export async function trashThreads(accountId: string, userId: string, threadIds: string[]) {
  if (!threadIds?.length) return { success: true };
  const account = await getGmailAccountForUser(accountId, userId);
  return gmailProvider.trashThreads(account, threadIds);
}

export async function deleteMessage(accountId: string, userId: string, messageId: string) {
  const account = await getGmailAccountForUser(accountId, userId);
  return gmailProvider.deleteMessage(account, messageId);
}

export async function listLabels(accountId: string, userId: string) {
  const account = await getGmailAccountForUser(accountId, userId);
  return gmailProvider.listLabels(account);
}

export async function createLabel(accountId: string, userId: string, { name }: { name: string }) {
  const account = await getGmailAccountForUser(accountId, userId);
  return gmailProvider.createLabel(account, { name });
}
