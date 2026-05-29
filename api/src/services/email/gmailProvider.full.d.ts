/** Ambient types for Dharwin-ported Gmail provider (gmailProvider.full.js). */
type GmailAccount = import('../../models/emailAccount.model.js').EmailAccount;

export function getAuthUrl(userId: string): string;
export function handleCallback(
  code: string,
  userId: string,
  stateEncoded?: string
): Promise<{ email: string; id?: string }>;
export function refreshToken(account: GmailAccount): Promise<GmailAccount>;
export function listMessages(
  account: GmailAccount,
  opts?: { labelId?: string; pageToken?: string; pageSize?: number; query?: string }
): Promise<{ messages: unknown[]; nextPageToken: string | null; resultSizeEstimate?: number }>;
export function listThreads(
  account: GmailAccount,
  opts?: { labelId?: string; pageToken?: string; pageSize?: number; query?: string }
): Promise<{ threads: unknown[]; nextPageToken: string | null; resultSizeEstimate?: number }>;
export function getThread(account: GmailAccount, threadId: string): Promise<{ id: string; messages: unknown[] }>;
export function getMessage(account: GmailAccount, messageId: string): Promise<unknown>;
export function getAttachment(account: GmailAccount, messageId: string, attachmentId: string): Promise<string>;
export function sendMessage(
  account: GmailAccount,
  payload: {
    to: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    subject?: string;
    html?: string;
    attachments?: { filename: string; content: string | Buffer; mimeType?: string }[];
  }
): Promise<{ id: string | null; threadId?: string | null }>;
export function replyMessage(
  account: GmailAccount,
  messageId: string,
  payload?: { html?: string; attachments?: unknown[] }
): Promise<{ id: string | null; threadId?: string | null }>;
export function replyAllMessage(
  account: GmailAccount,
  messageId: string,
  payload?: { html?: string; attachments?: unknown[] }
): Promise<{ id: string | null; threadId?: string | null }>;
export function forwardMessage(
  account: GmailAccount,
  messageId: string,
  payload: { to: string | string[]; html?: string; attachments?: unknown[] }
): Promise<{ id: string | null; threadId?: string | null }>;
export function modifyMessage(
  account: GmailAccount,
  messageId: string,
  payload?: { addLabelIds?: string[]; removeLabelIds?: string[] }
): Promise<unknown>;
export function batchModifyMessages(
  account: GmailAccount,
  messageIds: string[],
  payload?: { addLabelIds?: string[]; removeLabelIds?: string[] }
): Promise<{ success: boolean; modified: number }>;
export function batchModifyThreads(
  account: GmailAccount,
  threadIds: string[],
  payload?: { addLabelIds?: string[]; removeLabelIds?: string[] }
): Promise<{ success: boolean; modified: number }>;
export function deleteMessage(account: GmailAccount, messageId: string): Promise<unknown>;
export function trashThreads(account: GmailAccount, threadIds: string[]): Promise<unknown>;
export function listLabels(account: GmailAccount): Promise<unknown[]>;
export function createLabel(account: GmailAccount, payload: { name: string }): Promise<unknown>;
