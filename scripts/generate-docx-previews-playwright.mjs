/**
 * Generate resume template preview PNGs using Playwright.
 * 
 * For each .docx template:
 * 1. Reads the .docx using mammoth (docx→HTML)
 * 2. Renders in a Playwright browser at A4 size
 * 3. Screenshots the page as a PNG
 * 
 * No LibreOffice/pdftoppm/ImageMagick needed!
 *
 * On Windows, run with Node.js (not Bun): Playwright’s browser handshake times out under Bun.
 */
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import mammoth from 'mammoth';
import { chromium, webkit } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const staticDir = path.join(projectRoot, 'static');
const resumesDir = path.join(staticDir, 'resumes');
const outDir = path.join(staticDir, 'resume-template-previews');

// Template registry: id → docx filename
const TEMPLATES = [
  { id: 'lawyer-bw', file: 'Black and White Simple Lawyer Resume CV.docx' },
  { id: 'real-estate-bw', file: 'Black and White Simple Minimalist Real Estate Resume.docx' },
  { id: 'ux-designer-bw', file: 'Black and White UX Designer Resume.docx' },
  { id: 'education-cream', file: 'Education Resume in Cream Black Warm Classic Style.docx' },
  { id: 'junior-athlete', file: 'Junior Athlete-resume .docx' },
  { id: 'manthans-cv', file: "Manthan's CV.docx" },
  { id: 'professional-mod', file: 'Minimalist Modern Professional CV Resume.docx' },
  { id: 'recreation-assistant', file: 'Recreational Activities assisant-resume.docx' },
  { id: 'science-engineering', file: 'Science and Engineering Resume in Green Black Simple Style.docx' },
  { id: 'medical-doctor', file: 'medical doctor-resume.docx' },
];

async function docxToHtml(docxPath) {
  const buffer = await fsp.readFile(docxPath);
  const result = await mammoth.convertToHtml({ buffer });
  return result.value;
}

function wrapInA4Page(htmlContent, title) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  
  @page { size: A4; margin: 0; }
  
  body {
    width: 794px;       /* A4 at 96dpi */
    min-height: 1123px;  /* A4 at 96dpi */
    margin: 0;
    padding: 48px 56px;
    font-family: 'Segoe UI', 'Arial', sans-serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #1a1a1a;
    background: #ffffff;
    overflow: hidden;
  }
  
  h1 {
    font-size: 22pt;
    font-weight: 700;
    margin-bottom: 4px;
    color: #111;
    letter-spacing: 0.5px;
  }
  
  h2 {
    font-size: 13pt;
    font-weight: 700;
    margin-top: 16px;
    margin-bottom: 6px;
    color: #222;
    text-transform: uppercase;
    letter-spacing: 1px;
    border-bottom: 1.5px solid #333;
    padding-bottom: 3px;
  }
  
  h3 {
    font-size: 11.5pt;
    font-weight: 600;
    margin-top: 8px;
    margin-bottom: 2px;
    color: #333;
  }
  
  p {
    margin-bottom: 6px;
    font-size: 10.5pt;
    line-height: 1.45;
  }
  
  ul, ol {
    margin-left: 18px;
    margin-bottom: 6px;
  }
  
  li {
    font-size: 10.5pt;
    line-height: 1.4;
    margin-bottom: 2px;
  }
  
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 8px;
  }
  
  td, th {
    padding: 3px 6px;
    font-size: 10.5pt;
    vertical-align: top;
  }
  
  strong, b { font-weight: 600; }
  em, i { font-style: italic; }
  
  a { color: #1a1a1a; text-decoration: none; }
  
  img { max-width: 100%; height: auto; }
</style>
</head>
<body>
${htmlContent}
</body>
</html>`;
}

async function main() {
  if (process.versions.bun && process.platform === 'win32') {
    console.error(
      'Playwright does not connect to browsers when this script is run with Bun on Windows. Use Node instead:\n' +
        '  node scripts/generate-docx-previews-playwright.mjs\n' +
        'Or: bun run template-previews:playwright',
    );
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  console.log('Launching Playwright browser...');
  const launchOpts = { headless: true, timeout: 120_000 };
  const engine =
    process.env.PLAYWRIGHT_ENGINE === 'chromium'
      ? chromium
      : process.env.PLAYWRIGHT_ENGINE === 'webkit'
        ? webkit
        : process.platform === 'win32'
          ? webkit
          : chromium;
  if (engine === chromium && process.env.PLAYWRIGHT_CHANNEL) {
    launchOpts.channel = process.env.PLAYWRIGHT_CHANNEL;
  }
  const browser = await engine.launch(launchOpts);
  const context = await browser.newContext({
    viewport: { width: 794, height: 1123 },
    deviceScaleFactor: 2, // 2x for crisp preview
  });

  for (const template of TEMPLATES) {
    const docxPath = path.join(resumesDir, template.file);
    const outPng = path.join(outDir, `${template.id}.png`);

    if (!fs.existsSync(docxPath)) {
      console.error(`DOCX not found: ${docxPath}`);
      continue;
    }

    console.log(`[${template.id}] Converting: ${template.file}`);

    try {
      const html = await docxToHtml(docxPath);
      const fullPage = wrapInA4Page(html, template.id);

      const page = await context.newPage();
      await page.setContent(fullPage, { waitUntil: 'networkidle' });
      
      // Wait for fonts to load
      await page.waitForTimeout(500);

      // Screenshot just the A4 area
      await page.screenshot({
        path: outPng,
        clip: { x: 0, y: 0, width: 794, height: 1123 },
        type: 'png',
      });

      await page.close();

      const stat = fs.statSync(outPng);
      console.log(`  → Wrote: ${outPng} (${(stat.size / 1024).toFixed(1)} KB)`);
    } catch (err) {
      console.error(`  ✗ Failed for ${template.id}:`, err.message);
    }
  }

  await browser.close();
  console.log('\nDone! All preview PNGs generated.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
