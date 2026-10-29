import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const source = process.argv[2] || path.resolve(root, '../cpv-reader/CPV中英对照学习资料.html');
const html = await fs.readFile(source, 'utf8');
const match = html.match(/<script[^>]*id="reader-data"[^>]*>([\s\S]*?)<\/script>/);
if (!match) throw new Error('Missing bilingual source data');
const original = JSON.parse(match[1]);
const documents = original.documents.map((d, i) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  title: d.name, subtitle: d.subtitle, filename: d.file, type: d.type,
  sourcePages: d.sourcePages, version: 1, status: 'ready',
  sourceDate: i === 8 ? '2021' : null, legacyId: d.id,
  sections: d.sections.map(s => ({
    id: s.id, title: s.label, source: s.source,
    pairs: s.blocks.flatMap(b => b.pairs.map((p, n) => ({
      id: `${b.key}s${n}`, en: p.en, zh: p.zh, kind: b.kind,
    }))),
    figures: (s.figures || []).map(f => ({caption:f.caption, data:original.assets[f.asset]})),
  })),
}));
const pairs = documents.reduce((n, d) => n + d.sections.reduce((s, p) => s + p.pairs.length, 0), 0);
if (documents.length !== 9 || pairs !== 2509) throw new Error('Corpus integrity mismatch');
await fs.mkdir(path.join(root, 'data'), {recursive:true});
await fs.writeFile(path.join(root, 'data/corpus.json'), JSON.stringify({documents, pairs}));
await fs.writeFile(path.join(root, 'data/manifest.json'), JSON.stringify({documents:9,pairs,sourceSha256:crypto.createHash('sha256').update(html).digest('hex')},null,2));
console.log(`Prepared ${documents.length} documents / ${pairs} bilingual pairs; data stays outside public/.`);
