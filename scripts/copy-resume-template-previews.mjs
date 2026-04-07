/**
 * Copy original preview PNGs from Cursor workspace assets into
 * static/resume-template-previews/{templateId}.png
 *
 * IMPORTANT: The default export order of image-*.png files is NOT the same as
 * the on-screen template card order (lawyer, real estate, …). Each templateId
 * below points to the correct source file by matching resume content to the
 * hybrid template title.
 *
 * Reference (user template numbering): 1=lawyer, 2=real estate, 3=UX designer,
 * 4=education, 5=junior athlete, 6=Manthan's CV, 7=modern professional,
 * 8=recreation assistant, 9=science & engineering, 10=medical doctor.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

const ASSET_PREFIX =
  process.env.RESUME_PREVIEW_ASSET_DIR ||
  path.join(
    process.env.USERPROFILE || process.env.HOME || '',
    '.cursor',
    'projects',
    'd-inquisitivemind',
    'assets',
    'c__Users_chaud_AppData_Roaming_Cursor_User_workspaceStorage_a72745787dc1dc04b1fc103a0a32d2d0_images_',
  );

const OUT_DIR = path.join(projectRoot, 'static', 'resume-template-previews');

/** templateId → Cursor export basename (content-matched, not list order) */
const TEMPLATE_ID_TO_SOURCE_FILE = {
  'lawyer-bw': 'image-4ad9e858-8266-4364-a71f-7c07ed51d978.png',
  'real-estate-bw': 'image-e4974dd3-0c50-4ccd-b764-f56792056b1f.png',
  'ux-designer-bw': 'image-4f5868a1-0e44-4c1b-bdc1-319be02ca23b.png',
  'education-cream': 'image-dc6991a2-ed11-400c-97a1-c0912ea84e1d.png',
  'junior-athlete': 'image-15af5caf-9bcf-4fc9-9e63-8cb6d2f9466b.png',
  'manthans-cv': 'image-c87cd6d3-d356-4753-b306-db42949d8277.png',
  'professional-mod': 'image-17b50bf0-58ba-4bdf-b561-11ac73d3c7b7.png',
  'recreation-assistant': 'image-36782df2-cbf1-4e6a-963c-8f73f14f3dd9.png',
  'science-engineering': 'image-1a8e513b-e80b-4c60-a5ec-c71f5d308c7e.png',
  'medical-doctor': 'image-7d0c392f-215f-40e7-8bc2-450308f784ae.png',
};

function main() {
  if (!fs.existsSync(ASSET_PREFIX)) {
    console.error('Asset directory not found:', ASSET_PREFIX);
    console.error('Set RESUME_PREVIEW_ASSET_DIR to the folder containing image-*.png exports.');
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [templateId, filename] of Object.entries(TEMPLATE_ID_TO_SOURCE_FILE)) {
    const src = path.join(ASSET_PREFIX, filename);
    const dest = path.join(OUT_DIR, `${templateId}.png`);
    if (!fs.existsSync(src)) {
      console.error('Missing source:', src);
      process.exit(1);
    }
    fs.copyFileSync(src, dest);
    console.log('OK', templateId + '.png', '<-', filename);
  }
  console.log('\nDone. Copied', Object.keys(TEMPLATE_ID_TO_SOURCE_FILE).length, 'previews to', OUT_DIR);
}

main();
