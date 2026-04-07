const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Try to use absolute path to avoid ambiguity
const outDir = "d:\\inquisitivemind\\questai\\static\\resume-template-previews";
console.log("Output Directory:", outDir);

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

function encodePNG(width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4);
    rawData[rowOffset] = 0;
    pixels.copy(rawData, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(rawData, { level: 6 });
  const chunks = [makeChunk('IHDR', ihdr), makeChunk('IDAT', compressed), makeChunk('IEND', Buffer.alloc(0))];
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

if (!fs.existsSync(outDir)) { fs.mkdirSync(outDir, { recursive: true }); }

for (const t of TEMPLATES) {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 4);
  const [pr, pg, pb] = t.color;
  const [ar, ag, ab] = t.accent;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const idx = (y * WIDTH + x) * 4;
      let r = 255, g = 255, b = 255, a = 255;
      if (y >= 48 && y < 56) { r = ar; g = ag; b = ab; }
      if (y >= 70 && y < 95 && x >= 40 && x < WIDTH - 40) {
        if (Math.abs(x - WIDTH/2) < t.name.length * 6) { r = pr; g = pg; b = pb; }
      }
      if (y >= 135 && y < 137 && x >= 40 && x < WIDTH - 40) { r = pr; g = pg; b = pb; }
      pixels[idx] = r; pixels[idx + 1] = g; pixels[idx + 2] = b; pixels[idx + 3] = a;
    }
  }
  const png = encodePNG(WIDTH, HEIGHT, pixels);
  fs.writeFileSync(path.join(outDir, `${t.id}.png`), png);
  console.log(`Wrote ${t.id}.png`);
}
console.log("FINISHED");
