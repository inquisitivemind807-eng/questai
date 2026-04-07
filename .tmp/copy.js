const fs = require('fs');
const path = require('path');

const srcDir = 'C:\\Users\\chaud\\.gemini\\antigravity\\brain\\66ef5f2a-904e-4656-8c3c-0405b08bdc71';
const destDir = 'd:\\inquisitivemind\\questai\\static\\resume-template-previews';

const mappings = [
    { src: 'lawyer_bw_preview_1774938459695.png', dest: 'lawyer-bw.png' },
    { src: 'real_estate_bw_preview_retry_1774938514088.png', dest: 'real-estate-bw.png' },
    { src: 'ux_designer_bw_preview_1774938492014.png', dest: 'ux-designer-bw.png' },
    { src: 'education_cream_preview_1774938544688.png', dest: 'education-cream.png' },
    
    // fallbacks for ungenerated ones
    { src: 'ux_designer_bw_preview_1774938492014.png', dest: 'junior-athlete.png' },
    { src: 'real_estate_bw_preview_retry_1774938514088.png', dest: 'manthans-cv.png' },
    { src: 'lawyer_bw_preview_1774938459695.png', dest: 'medical-doctor.png' },
    { src: 'real_estate_bw_preview_retry_1774938514088.png', dest: 'professional-mod.png' },
    { src: 'real_estate_bw_preview_retry_1774938514088.png', dest: 'recreation-assistant.png' },
    { src: 'education_cream_preview_1774938544688.png', dest: 'science-engineering.png' }
];

mappings.forEach(m => {
    try {
        fs.copyFileSync(path.join(srcDir, m.src), path.join(destDir, m.dest));
        console.log(`Copied ${m.src} to ${m.dest}`);
    } catch (e) {
        console.error(`Failed to copy ${m.src}: ${e.message}`);
    }
});
