export type ContactType = 'email' | 'phone' | 'whatsapp';
export type ContactLabel = 'sales' | 'purchase' | 'export' | 'info' | 'support' | 'unknown';
export type LeadStatus = 'new' | 'verified' | 'selected' | 'contacted' | 'replied' | 'rejected';
export type BusinessType =
  | 'manufacturer' | 'supplier' | 'exporter' | 'distributor' | 'buyer' | 'unknown';

export interface Contact {
  type: ContactType;
  value: string;
  label?: ContactLabel;
  sourceUrl?: string;
  source?: 'crawl' | 'google_places';
  confidence?: number;
}

export interface PharmaLead {
  id: string;
  companyName: string;
  website: string;
  domain: string;
  city?: string;
  state?: string;
  country?: string;
  matchedDrugs: string[];
  businessType: BusinessType;
  sourceUrls: string[];
  confidence: number;
  status: LeadStatus;
  contacts: Contact[];
  saved?: boolean;
  lastCrawledAt?: string;
}

export interface EmailAccount {
  id: string;
  email: string;
  provider: 'gmail';
  status: 'active' | 'revoked' | 'error';
}

export interface Template {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  variables: string[];
}

/** Gmail mailbox (Dharwin port) */
export interface EmailThreadListItem {
  id: string;
  threadId: string;
  lastMessageId?: string;
  firstMessageId?: string;
  snippet: string;
  from: string;
  to: string;
  subject: string;
  date: string | null;
  messageCount: number;
  labelIds?: string[];
  isUnread: boolean;
}

export interface EmailMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet: string;
  from: string;
  to: string;
  cc?: string;
  subject: string;
  date: string | null;
  isUnread: boolean;
  htmlBody: string | null;
  textBody: string | null;
  attachments: { filename: string; mimeType: string; size: number; attachmentId?: string; messageId?: string }[];
}

export interface EmailLabel {
  id: string;
  name: string;
  type?: string;
  messagesTotal?: number;
  messagesUnread?: number;
}

export type EmailDraftTone = 'professional' | 'friendly' | 'formal' | 'persuasive' | 'empathetic';
export type EmailDraftLength = 'short' | 'medium' | 'long';

export interface EmailDraftOption {
  id: string;
  label: string;
  html: string;
  text: string;
}

export interface GeneratedEmailDraft {
  subject: string;
  options: EmailDraftOption[];
}

/** Personal templates in Mongo (/v1/email/templates) */
export interface PersonalTemplate {
  id: string;
  title: string;
  subject?: string;
  bodyHtml: string;
  isShared?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PersonalTemplatesList {
  own: PersonalTemplate[];
  shared: PersonalTemplate[];
}
