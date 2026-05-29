import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const src = join(root, 'src/services/email/gmailProvider.full.js');
const dest = join(root, 'dist/services/email/gmailProvider.full.js');
mkdirSync(dirname(dest), { recursive: true });
cpSync(src, dest);
console.log('[build] copied gmailProvider.full.js -> dist');
