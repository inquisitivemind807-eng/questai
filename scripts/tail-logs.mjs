import fs from 'fs';
import path from 'path';

function parseArgs(argv) {
  const args = {
    date: '',
    session: '',
    category: '',
    pretty: true
  };
  for (let i = 0; i < argv.length; i++) {
    const val = argv[i + 1];
    if (argv[i] === '--date' && val) args.date = val;
    if (argv[i] === '--session' && val) args.session = val;
    if (argv[i] === '--category' && val) args.category = val;
    if (argv[i] === '--no-pretty') args.pretty = false;
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

function selectFiles(logDir, category) {
  const names = ['api', 'workflow', 'error', 'auth'];
  const selected = category ? [category] : names;
  return selected
    .map((name) => ({ name, file: path.join(logDir, `${name}.jsonl`) }))
    .filter(({ file }) => fs.existsSync(file));
}

function formatEntry(entry, source, pretty) {
  if (!pretty) return JSON.stringify({ ...entry, _source: source });
  const time = entry.timestamp || new Date().toISOString();
  const level = (entry.level || 'info').toUpperCase().padEnd(5, ' ');
  const event = entry.event || 'event.unknown';
  const session = entry.sessionId ? ` session=${entry.sessionId}` : '';
  const bot = entry.botName ? ` bot=${entry.botName}` : '';
  const platform = entry.platform ? ` platform=${entry.platform}` : '';
  const jobId = entry.jobId ? ` job=${entry.jobId}` : '';
  const msg = entry.message || '';
  return `${time} [${source}] ${level} ${event}${session}${bot}${platform}${jobId} - ${msg}`;
}

function processChunk(chunk, source, session, pretty) {
  const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (session && entry.sessionId !== session) continue;
      console.log(formatEntry(entry, source, pretty));
    } catch {
      // Ignore malformed lines.
    }
  }
}

function tailFile(filePath, source, session, pretty) {
  let position = fs.statSync(filePath).size;

  fs.watchFile(filePath, { interval: 500 }, (curr, prev) => {
    if (curr.size <= prev.size) return;
    const stream = fs.createReadStream(filePath, {
      start: position,
      end: curr.size - 1,
      encoding: 'utf8'
    });
    let chunk = '';
    stream.on('data', (data) => {
      chunk += data;
    });
    stream.on('end', () => {
      processChunk(chunk, source, session, pretty);
      position = curr.size;
    });
  });
}

function main() {
  const { date, session, category, pretty } = parseArgs(process.argv.slice(2));
  const selectedDate = date || getLocalDateStamp();
  const logDir = path.join(process.cwd(), 'logs', selectedDate);
  if (!fs.existsSync(logDir)) {
    console.error(`No log directory found: ${logDir}`);
    process.exit(1);
  }

  const files = selectFiles(logDir, category);
  if (files.length === 0) {
    console.error(`No log files found in ${logDir}${category ? ` for category '${category}'` : ''}`);
    process.exit(1);
  }

  console.log(`Tailing logs in ${logDir}`);
  if (session) console.log(`Filter: sessionId=${session}`);
  if (category) console.log(`Filter: category=${category}`);
  console.log('Press Ctrl+C to stop.\n');

  for (const { name, file } of files) {
    tailFile(file, name, session, pretty);
  }
}

main();
