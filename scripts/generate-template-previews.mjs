import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const questaiRoot = path.join(__dirname, '..');
const resumeTemplatesPreviewRegistryPath = path.join(
  questaiRoot,
  'scripts',
  'resume-templates-preview-registry.json',
);

const staticDir = path.join(questaiRoot, 'static');
const defaultOutDir = path.join(staticDir, 'resume-template-previews');

function defaultLibreOfficeCmd() {
  if (process.env.LIBREOFFICE_CMD) return process.env.LIBREOFFICE_CMD;
  if (process.platform === 'win32') {
    const bases = [
      process.env.PROGRAMFILES,
      process.env['ProgramFiles(x86)'],
      'C:\\Program Files',
      'C:\\Program Files (x86)',
    ].filter(Boolean);
    for (const base of bases) {
      const p = path.join(base, 'LibreOffice', 'program', 'soffice.exe');
      if (fs.existsSync(p)) return p;
    }
  }
  return 'soffice';
}

function defaultPdftoppmCmd() {
  if (process.env.PDFTOPPM_CMD) return process.env.PDFTOPPM_CMD;
  if (process.platform === 'win32') {
    const bases = [process.env.PROGRAMFILES, process.env['ProgramFiles(x86)'], 'C:\\Program Files'].filter(
      Boolean,
    );
    for (const base of bases) {
      for (const rel of [
        ['poppler', 'Library', 'bin', 'pdftoppm.exe'],
        ['Poppler', 'bin', 'pdftoppm.exe'],
      ]) {
        const p = path.join(base, ...rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return 'pdftoppm';
}

function parseArgs(argv) {
  const args = {
    outDir: defaultOutDir,
    force: false,
    keepTemp: false,
    limit: 0,
    dpi: 300,
    convertToPdfCmd: defaultLibreOfficeCmd(),
    pdfToPngCmd: defaultPdftoppmCmd(),
    magickCmd: process.env.MAGICK_CMD || 'magick',
  };

  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--outDir' && v) args.outDir = v;
    if (k === '--force') args.force = true;
    if (k === '--keep-temp') args.keepTemp = true;
    if (k === '--limit' && v) args.limit = Number(v);
    if (k === '--dpi' && v) args.dpi = Number(v);
  }

  return args;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function spawnChecked(command, args, { cwd, env, stdio = 'inherit' } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio });
    child.on('error', (err) => {
      if (err && err.code === 'ENOENT') {
        reject(
          new Error(
            `Required executable not found: "${command}". ` +
              'Install the needed conversion tools and ensure they are available in PATH, ' +
              'or set the corresponding environment variables (LIBREOFFICE_CMD / PDFTOPPM_CMD / MAGICK_CMD).',
          ),
        );
      } else {
        reject(err);
      }
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed: ${command} ${args.join(' ')} (exit code ${code})`));
    });
  });
}

async function fileExists(p) {
  try {
    await fsp.access(p, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveDocxToTemp({ templateId, downloadUrl, tempDir }) {
  const docxOutPath = path.join(tempDir, `${templateId}.docx`);

  if (downloadUrl.startsWith('http://') || downloadUrl.startsWith('https://')) {
    if (typeof fetch !== 'function') {
      throw new Error(
        'Global fetch is not available. Use a recent Node.js (>=18) or set downloadUrl to local /resumes/* paths.',
      );
    }
    const res = await fetch(downloadUrl);
    if (!res.ok) throw new Error(`Failed to download DOCX: ${downloadUrl} (HTTP ${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    await fsp.writeFile(docxOutPath, buf);
    return docxOutPath;
  }

  // For SvelteKit static assets, downloadUrl is like "/resumes/<file>.docx".
  const rel = downloadUrl.replace(/^\//, '');
  const localSourcePath = path.join(staticDir, rel);
  if (!(await fileExists(localSourcePath))) {
    throw new Error(`Local DOCX not found for downloadUrl="${downloadUrl}": ${localSourcePath}`);
  }

  await fsp.copyFile(localSourcePath, docxOutPath);
  return docxOutPath;
}

async function convertDocxToPdf({ docxPath, convertToPdfCmd, pdfOutDir }) {
  ensureDir(pdfOutDir);

  // LibreOffice output naming usually uses the original basename.
  await spawnChecked(convertToPdfCmd, [
    '--headless',
    '--nologo',
    '--nolockcheck',
    '--convert-to',
    'pdf',
    '--outdir',
    pdfOutDir,
    docxPath,
  ]);

  const expectedBase = path.parse(docxPath).name;
  const pdfs = await fsp.readdir(pdfOutDir);
  const matches = pdfs.filter((f) => f.toLowerCase() === `${expectedBase}.pdf`.toLowerCase());
  const pdfPath = matches.length > 0 ? path.join(pdfOutDir, matches[0]) : null;

  if (!pdfPath) {
    // Fallback: pick the first pdf from the conversion directory.
    const anyPdf = pdfs.find((f) => f.toLowerCase().endsWith('.pdf'));
    if (!anyPdf) throw new Error(`LibreOffice produced no PDF outputs in ${pdfOutDir}`);
    return path.join(pdfOutDir, anyPdf);
  }

  return pdfPath;
}

async function convertPdfToPngPages({ pdfPath, pdfToPngCmd, pngOutDir, dpi }) {
  ensureDir(pngOutDir);
  const prefixBase = path.join(pngOutDir, 'page');

  await spawnChecked(pdfToPngCmd, [
    '-png',
    '-r',
    String(dpi),
    pdfPath,
    prefixBase,
  ]);

  const files = await fsp.readdir(pngOutDir);
  const pages = files
    .filter((f) => f.toLowerCase().startsWith('page-') && f.toLowerCase().endsWith('.png'))
    .map((f) => {
      const m = f.match(/page-(\d+)\.png$/i);
      return { file: f, page: m ? Number(m[1]) : 0 };
    })
    .sort((a, b) => a.page - b.page);

  if (pages.length === 0) {
    throw new Error(`pdftoppm produced no PNG pages in ${pngOutDir} for ${pdfPath}`);
  }

  return pages.map((p) => path.join(pngOutDir, p.file));
}

async function stitchPngPagesVertically({ pngFiles, outputPngPath, magickCmd }) {
  if (pngFiles.length === 1) {
    await fsp.copyFile(pngFiles[0], outputPngPath);
    return;
  }

  // Try ImageMagick (common in CI/build environments).
  const candidateCommands = [magickCmd, 'convert'].filter(Boolean);
  let lastErr = null;

  for (const cmd of candidateCommands) {
    try {
      // -append stacks vertically.
      await spawnChecked(cmd, [...pngFiles, '-background', 'white', '-alpha', 'remove', '-append', outputPngPath], {
        stdio: 'inherit',
      });
      if (await fileExists(outputPngPath)) return;
    } catch (err) {
      lastErr = err;
    }
  }

  // Optional fallback: sharp (not required as a dependency, but if installed we can use it).
  try {
    const sharpMod = await import('sharp');
    const sharp = sharpMod.default || sharpMod;

    // Assume all pages have the same width from pdftoppm.
    const metas = await Promise.all(pngFiles.map(async (f) => sharp(f).metadata()));
    const width = Math.max(...metas.map((m) => m.width || 0));
    const height = metas.reduce((sum, m) => sum + (m.height || 0), 0);
    const base = sharp({
      create: {
        width: width || 1,
        height: height || 1,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    });

    let y = 0;
    const composites = [];
    for (const [idx, f] of pngFiles.entries()) {
      const meta = metas[idx];
      const inputBuf = await fsp.readFile(f);
      composites.push({ input: inputBuf, top: y, left: 0 });
      y += meta.height || 0;
    }

    await base.composite(composites).png().toFile(outputPngPath);
    return;
  } catch (err) {
    lastErr = lastErr || err;
  }

  throw new Error(
    `Failed to stitch PNG pages vertically into ${outputPngPath}. Install ImageMagick (magick/convert) or ensure sharp is available.\n` +
      `Last error: ${lastErr ? String(lastErr.message || lastErr) : 'unknown'}`,
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!(await fileExists(resumeTemplatesPreviewRegistryPath))) {
    throw new Error(`Template registry not found: ${resumeTemplatesPreviewRegistryPath}`);
  }

  ensureDir(args.outDir);

  const registryJson = await fsp.readFile(resumeTemplatesPreviewRegistryPath, 'utf8');
  /** @type {{ id: string; downloadUrl: string }[]} */
  const templates = JSON.parse(registryJson);
  if (!Array.isArray(templates) || templates.length === 0) {
    throw new Error(`No templates in ${resumeTemplatesPreviewRegistryPath}`);
  }

  const selected = args.limit > 0 ? templates.slice(0, args.limit) : templates;

  console.log(`Generating ${selected.length} template previews into: ${args.outDir}`);
  console.log(`Using LibreOffice: ${args.convertToPdfCmd}`);
  console.log(`Using pdftoppm: ${args.pdfToPngCmd}`);
  console.log(`Using ImageMagick/sharp for stitch: ${args.magickCmd}`);

  const tempRoot = path.join(questaiRoot, '.tmp', 'template-previews');
  ensureDir(tempRoot);

  for (const template of selected) {
    const outPng = path.join(args.outDir, `${template.id}.png`);
    if (!args.force && (await fileExists(outPng))) {
      console.log(`Skipping (exists): ${template.id}`);
      continue;
    }

    const safeTempDir = path.join(tempRoot, template.id.replace(/[^\w.-]+/g, '_'));
    ensureDir(safeTempDir);

    console.log(`\n[${template.id}] Converting: ${template.downloadUrl}`);

    try {
      const docxPath = await resolveDocxToTemp({
        templateId: template.id,
        downloadUrl: template.downloadUrl,
        tempDir: safeTempDir,
      });

      const pdfOutDir = path.join(safeTempDir, 'pdf');
      const pngOutDir = path.join(safeTempDir, 'png');
      ensureDir(pdfOutDir);
      ensureDir(pngOutDir);

      const pdfPath = await convertDocxToPdf({
        docxPath,
        convertToPdfCmd: args.convertToPdfCmd,
        pdfOutDir,
      });

      const pngFiles = await convertPdfToPngPages({
        pdfPath,
        pdfToPngCmd: args.pdfToPngCmd,
        pngOutDir,
        dpi: args.dpi,
      });

      await stitchPngPagesVertically({
        pngFiles,
        outputPngPath: outPng,
        magickCmd: args.magickCmd,
      });

      const outSize = (await fsp.stat(outPng)).size;
      if (outSize <= 0) throw new Error(`Output PNG is empty: ${outPng}`);

      console.log(`Wrote: ${outPng} (${outSize} bytes)`);
    } catch (err) {
      console.error(`Failed for templateId=${template.id}:`, err);
      throw err;
    } finally {
      if (!args.keepTemp) {
        // Best-effort cleanup.
        try {
          await fsp.rm(safeTempDir, { recursive: true, force: true });
        } catch {
          // ignore
        }
      }
    }
  }

  console.log('\nTemplate preview generation completed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

