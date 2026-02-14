import fs from 'fs';
import path from 'path';

function parseArgs(argv) {
  const args = { session: '', date: '' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--session' && argv[i + 1]) args.session = argv[i + 1];
    if (argv[i] === '--date' && argv[i + 1]) args.date = argv[i + 1];
  }
  return args;
}

function getLocalDateStamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function main() {
  const { session, date } = parseArgs(process.argv.slice(2));
  const selectedDate = date || getLocalDateStamp();
  const logDir = path.join(process.cwd(), 'logs', selectedDate);
  if (!fs.existsSync(logDir)) {
    console.error(`No logs found for date: ${selectedDate}`);
    process.exit(1);
  }

  const files = ['api.jsonl', 'workflow.jsonl', 'error.jsonl', 'auth.jsonl'];
  const all = [];
  for (const f of files) {
    const filePath = path.join(logDir, f);
    const rows = readJsonl(filePath).map((entry) => ({ ...entry, _source: f }));
    all.push(...rows);
  }

  const filtered = session ? all.filter((e) => e.sessionId === session) : all;
  const sorted = filtered.sort((a, b) => {
    const ta = new Date(a.timestamp || 0).getTime();
    const tb = new Date(b.timestamp || 0).getTime();
    return ta - tb;
  });

  const outDir = path.join(process.cwd(), 'logs', 'bundles');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outName = session
    ? `bundle-${selectedDate}-${session}-${stamp}.json`
    : `bundle-${selectedDate}-all-${stamp}.json`;
  const outPath = path.join(outDir, outName);
  fs.writeFileSync(outPath, JSON.stringify({ date: selectedDate, session, entries: sorted }, null, 2), 'utf8');

  console.log(`Bundle created: ${outPath}`);
  console.log(`Entries: ${sorted.length}`);
}

main();
