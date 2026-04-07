/**
 * Generate unique colored preview placeholder PNGs for each resume template.
 * These are larger than 160x160 so the component displays them properly.
 * Uses raw PNG encoding - no external dependencies needed.
 * 
 * Each template gets a unique color scheme based on its category.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const outDir = path.join(__dirname, '..', 'static', 'resume-template-previews');

// A4 ratio: 210x297mm → scaled to 420x594px for crisp preview
const WIDTH = 420;
const HEIGHT = 594;

const TEMPLATES = [
  { id: 'lawyer-bw',            title: 'Simple Lawyer CV',           name: 'Elizabeth J. Reed',    role: 'Attorney at Law',              color: [26,54,93],    accent: [45,90,160] },
  { id: 'real-estate-bw',       title: 'Minimalist Real Estate',     name: 'Marcus Thompson',      role: 'Senior Real Estate Associate',  color: [31,41,55],    accent: [147,197,253] },
  { id: 'ux-designer-bw',       title: 'UX Designer Resume',         name: 'Sarah Chen',           role: 'Senior UX Designer',            color: [239,68,68],   accent: [249,115,22] },
  { id: 'education-cream',      title: 'Warm Classic Education',     name: 'Eleanor Wright',       role: 'Senior Educator',               color: [26,54,93],    accent: [180,160,120] },
  { id: 'junior-athlete',       title: 'Junior Athlete Resume',      name: 'Leo Anderson',         role: 'Collegiate Athlete',            color: [91,33,182],   accent: [168,85,247] },
  { id: 'manthans-cv',          title: "Manthan's Standard CV",      name: 'Manthan Chaudhary',    role: 'Full Stack Developer',          color: [31,41,55],    accent: [147,197,253] },
  { id: 'professional-mod',     title: 'Modern Professional CV',     name: 'David Rodriguez',      role: 'Senior Project Manager',        color: [31,41,55],    accent: [37,99,235] },
  { id: 'recreation-assistant', title: 'Recreation Assistant',        name: 'Chloe Peterson',       role: 'Recreation Coordinator',        color: [31,41,55],    accent: [147,197,253] },
  { id: 'science-engineering',  title: 'Science & Engineering',       name: 'Jonathan R. Chen',     role: 'Data Engineer | Scientist',     color: [91,33,182],   accent: [168,85,247] },
  { id: 'medical-doctor',       title: 'Medical Doctor Resume',       name: 'Sarah L. Chen, MD',   role: 'Internal Medicine Physician',   color: [26,54,93],    accent: [45,90,160] },
];

function createPNG(width, height, template) {
  // Create raw RGBA pixel data
  const pixels = Buffer.alloc(width * height * 4);
  
  const [pr, pg, pb] = template.color;
  const [ar, ag, ab] = template.accent;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      
      // Main background: white
      let r = 255, g = 255, b = 255, a = 255;
      
      // Top margin area
      const marginX = 40;
      const marginTop = 48;
      
      // Header background band (top 120px)
      if (y >= marginTop && y < marginTop + 8) {
        // Accent line at top
        r = ar; g = ag; b = ab; a = 255;
      }
      
      // Name area (y: 70-100)
      if (y >= 70 && y < 95 && x >= marginX && x < width - marginX) {
        // Simulate bold name text blocks
        const nameLen = template.name.length * 12;
        const nameStart = Math.floor((width - nameLen) / 2);
        if (x >= nameStart && x < nameStart + nameLen) {
          // Blocky text simulation
          const charPos = Math.floor((x - nameStart) / 12);
          const charCode = template.name.charCodeAt(charPos) || 0;
          const inChar = ((x - nameStart) % 12) >= 1 && ((x - nameStart) % 12) <= 10;
          const vertMid = y >= 72 && y < 93;
          if (inChar && vertMid && charCode > 32) {
            r = pr; g = pg; b = pb; a = 255;
          }
        }
      }
      
      // Role text (y: 100-112)
      if (y >= 100 && y < 112 && x >= marginX && x < width - marginX) {
        const roleLen = template.role.length * 7;
        const roleStart = Math.floor((width - roleLen) / 2);
        if (x >= roleStart && x < roleStart + roleLen) {
          const charPos = Math.floor((x - roleStart) / 7);
          const charCode = template.role.charCodeAt(charPos) || 0;
          const inChar = ((x - roleStart) % 7) >= 1 && ((x - roleStart) % 7) <= 5;
          const vertMid = y >= 102 && y < 110;
          if (inChar && vertMid && charCode > 32) {
            r = 100; g = 100; b = 100; a = 255;
          }
        }
      }
      
      // Contact line (y: 118-124)
      if (y >= 118 && y < 124 && x >= marginX + 60 && x < width - marginX - 60) {
        if (y >= 119 && y < 123) {
          r = 140; g = 140; b = 140; a = 255;
        }
      }
      
      // Divider after header
      if (y >= 135 && y < 137 && x >= marginX && x < width - marginX) {
        r = pr; g = pg; b = pb; a = 255;
      }
      
      // Section headers + content blocks
      const sections = [
        { headerY: 150, contentLines: 3 },
        { headerY: 220, contentLines: 5 },
        { headerY: 330, contentLines: 3 },
        { headerY: 420, contentLines: 4 },
      ];
      
      for (const sec of sections) {
        // Section header
        if (y >= sec.headerY && y < sec.headerY + 12 && x >= marginX && x < marginX + 120) {
          if (y >= sec.headerY + 1 && y < sec.headerY + 11) {
            r = pr; g = pg; b = pb; a = 255;
          }
        }
        // Section underline
        if (y >= sec.headerY + 14 && y < sec.headerY + 15 && x >= marginX && x < width - marginX) {
          r = 220; g = 220; b = 220; a = 255;
        }
        // Content lines
        for (let line = 0; line < sec.contentLines; line++) {
          const lineY = sec.headerY + 22 + line * 16;
          if (y >= lineY && y < lineY + 8 && x >= marginX && x < width - marginX - 20) {
            // Vary line lengths
            const lineWidth = width - 2 * marginX - 20 - (line % 3) * 40;
            if (x < marginX + lineWidth) {
              r = 60; g = 60; b = 60; a = 180;
            }
          }
        }
      }
      
      // Bottom accent bar
      if (y >= height - 12 && y < height - 8 && x >= marginX && x < width - marginX) {
        r = ar; g = ag; b = ab; a = 255;
      }
      
      pixels[idx] = r;
      pixels[idx + 1] = g;
      pixels[idx + 2] = b;
      pixels[idx + 3] = a;
    }
  }
  
  return encodePNG(width, height, pixels);
}

function encodePNG(width, height, pixels) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type (RGBA)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  
  // IDAT: filter each row with filter type 0 (None)
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4);
    rawData[rowOffset] = 0; // filter type: None
    pixels.copy(rawData, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }
  
  const compressed = zlib.deflateSync(rawData, { level: 6 });
  
  // Build chunks
  const chunks = [
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ];
  
  return Buffer.concat([signature, ...chunks]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = crc32(Buffer.concat([typeBuffer, data]));
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0);
  
  return Buffer.concat([len, typeBuffer, data, crcBuffer]);
}

// CRC32 implementation
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Main
fs.mkdirSync(outDir, { recursive: true });

for (const template of TEMPLATES) {
  const outPath = path.join(outDir, `${template.id}.png`);
  const png = createPNG(WIDTH, HEIGHT, template);
  console.log(`[DEBUG] Generated PNG for ${template.id}, length: ${png.length}`);
  fs.writeFileSync(outPath, png);
  console.log(`Wrote ${template.id}.png (${png.length} bytes)`);
}

console.log('Done!');
