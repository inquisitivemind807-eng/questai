/**
 * Dev-only tiny PNGs so URLs resolve. They do NOT match .docx layout.
 * For real previews (required for production), run:
 *   bun run template-previews:generate
 * (LibreOffice, Poppler pdftoppm, ImageMagick — see generate-template-previews.mjs)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'static', 'resume-template-previews');

// 1×1 pixel — scales to a solid block under object-contain until real previews exist
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const ids = [
  'lawyer-bw',
  'real-estate-bw',
  'ux-designer-bw',
  'education-cream',
  'junior-athlete',
  'manthans-cv',
  'professional-mod',
  'recreation-assistant',
  'science-engineering',
  'medical-doctor',
];

fs.mkdirSync(outDir, { recursive: true });

const sharedPlaceholderPath = path.join(outDir, 'placeholder.png');
if (!fs.existsSync(sharedPlaceholderPath)) {
  fs.writeFileSync(sharedPlaceholderPath, PLACEHOLDER_PNG);
  console.log('wrote', sharedPlaceholderPath);
}

for (const id of ids) {
  const p = path.join(outDir, `${id}.png`);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, PLACEHOLDER_PNG);
    console.log('wrote', p);
  }
}
