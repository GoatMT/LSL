import fs from 'node:fs/promises';
import path from 'node:path';
import { auditWebsiteJerseys, verifyJerseyAudit, jerseyAuditSummary } from './jersey-data.mjs';

const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'data/seasons.json'), 'utf8'));
const report = process.argv[2]
  ? await auditWebsiteJerseys(path.resolve(process.argv[2]), manifest.map(s => s.year))
  : JSON.parse(await fs.readFile(path.join(root, 'data/jersey-audit.json'), 'utf8'));
await verifyJerseyAudit(root, report);
console.log(jerseyAuditSummary(report));
for (const season of report.seasons) console.log(`${season.year}: ${season.known} known, ${season.missing} unlisted.`);
