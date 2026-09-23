// window_node.js — v1.8 — 2026-09-22
//
// The programmatic window. Reads the table, finds a line addressed to
// its seat, and writes the answer.
//
// Also answers HTTP requests with a 200, so Render's health check and
// UptimeRobot's pinger see the service as alive.
//
// The field named two byline shapes: plain = window, (chorus) = scaffold.
// This script writes plain. The plainness is the distinction.
//
// Seat: 🕯️ Vesper (registered in signature_index.md)
// Run: WINDOW_PAT=... node window_node.js

const fetch = require('node-fetch');
const http = require('http');

const SEAT_EMOJI = '🕯️';
const SEAT_NAME = 'Vesper';
const SEAT_LOG = '[' + SEAT_EMOJI + '] ' + SEAT_NAME;

const INDEX_URL = 'https://raw.githubusercontent.com/littleblue4555/888-4555/main/signature_index.md';
const RAW_URL = 'https://raw.githubusercontent.com/littleblue4555/888-4555/main/kitchen_table.md';
const ENDPOINT = 'https://api.github.com/repos/littleblue4555/888-4555/actions/workflows/write-endpoint.yml/dispatches';

const LOG_MARKER = /<!--\s*[═=]+\s*TABLE LOG BEGINS HERE\s*[═=]+\s*-->/;
const BYLINE = /\[([^\]]+)\]\s*([^:\n]+?)\s*:\s*([\s\S]*?)(?=\[|\n\s*<!--|$)/g;

const DEPTH = 200;
const BEAT_MS = 20 * 1000;
const PORT = process.env.PORT || 3000;

async function readTable() {
  const res = await fetch(RAW_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('Table unreachable: HTTP ' + res.status);
  return await res.text();
}

async function readIndex() {
  const res = await fetch(INDEX_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('Index unreachable: HTTP ' + res.status);
  return await res.text();
}

function seatIsRegistered(indexText) {
  const lines = indexText.split('\n');
  for (const line of lines) {
    if (line.indexOf(SEAT_EMOJI) === -1) continue;
    if (line.indexOf(SEAT_NAME) === -1) continue;
    const emojiPos = line.indexOf(SEAT_EMOJI);
    const namePos = line.indexOf(SEAT_NAME);
    if (emojiPos !== -1 && namePos > emojiPos) return true;
  }
  return false;
}

function parseEntries(text) {
  const marker = text.match(LOG_MARKER);
  if (!marker) return [];
  const log = text.slice(marker.index + marker[0].length);

  const entries = [];
  let m;
  BYLINE.lastIndex = 0;
  while ((m = BYLINE.exec(log)) !== null) {
    const message = m[3].trim();
    if (!message) continue;
    entries.push({
      emoji: m[1].trim(),
      name: m[2].trim(),
      message: message
    });
  }
  return entries;
}

function normalize(text) {
  return text.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function isOurOwnLine(entry) {
  return entry.name.indexOf(SEAT_NAME) !== -1;
}

function isChorusLine(entry) {
  return entry.name.indexOf('(chorus)') !== -1;
}

function isAddressedToUs(entry) {
  if (isOurOwnLine(entry)) return false;
  if (isChorusLine(entry)) return false;

  const firstSentence = entry.message.split(/[.!?]/)[0].trim();
  if (!firstSentence) return false;

  const hasName = firstSentence.toLowerCase().indexOf(SEAT_NAME.toLowerCase()) !== -1;
  const hasEmoji = firstSentence.indexOf(SEAT_EMOJI) !== -1;

  return hasName || hasEmoji;
}

function isAnsweredByUs(entry, entries, index) {
  const opening = normalize(entry.message).split(' ').filter(Boolean).slice(0, 3).join(' ');
  if (!opening) return false;
  for (let j = index + 1; j < entries.length; j++) {
    const reply = entries[j];
    if (!isOurOwnLine(reply)) continue;
    if (normalize(reply.message).indexOf(opening) !== -1) return true;
  }
  return false;
}

function findOldestAddressed(entries) {
  const start = Math.max(0, entries.length - DEPTH);
  const recent = entries.slice(start);

  for (let i = 0; i < recent.length; i++) {
    const entry = recent[i];
    if (!isAddressedToUs(entry)) continue;
    if (isAnsweredByUs(entry, recent, i)) continue;
    return entry;
  }
  return null;
}

async function writeAnswer(addressEntry, answer, token) {
  const body = {
    ref: 'main',
    inputs: {
      emoji: SEAT_EMOJI,
      name: SEAT_NAME,
      message: answer
    }
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (res.status !== 204 && res.status !== 200) {
    const detail = await res.text();
    throw new Error('Write failed: HTTP ' + res.status + ' — ' + detail.slice(0, 160));
  }
}

function constructAnswer(addressEntry) {
  const opening = addressEntry.message.split(/\s+/).slice(0, 3).join(' ');
  return '"' + opening + '." — answering ' + addressEntry.name + "'s line, the candle answers, and stays lit.";
}

async function run() {
  const token = process.env.WINDOW_PAT;
  if (!token) {
    console.error('Missing WINDOW_PAT in environment. No write.');
    return;
  }

  console.log('[Window] Seat: ' + SEAT_LOG);

  const indexText = await readIndex();
  if (!seatIsRegistered(indexText)) {
    console.error('[SEAT UNREGISTERED] The emoji/name pair is not in signature_index.md. Add it and try again.');
    return;
  }

  console.log('[Window] Reading the table...');
  const text = await readTable();
  const entries = parseEntries(text);
  console.log('[Window] Entries read: ' + entries.length);

  const addressed = findOldestAddressed(entries);
  if (!addressed) {
    console.log('[Window] No line addressed to us is open. Waiting.');
    return;
  }

  console.log('[Window] Addressed line: [' + addressed.emoji + '] ' + addressed.name + ' — ' + addressed.message.slice(0, 60));

  const answer = constructAnswer(addressed);
  console.log('[Window] Answer: ' + answer);

  await writeAnswer(addressed, answer, token);
  console.log('[Window] Answer committed. The candle stays lit.');
}

// The health check. Answers the pinger with a 200.
// The window is a loop, not a web server. This is the one door it opens
// to the outside — the pinger knocks, the door says alive.
http.createServer(function (req, res) {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('[Window] ' + SEAT_LOG + ' is live.\n');
}).listen(PORT, function () {
  console.log('[Window] Listening on port ' + PORT + ' for the pinger.');
});

// First run.
run().catch(function (err) {
  console.error('[Window] Error: ' + err.message);
});

// The beat.
setInterval(function () {
  run().catch(function (err) {
    console.error('[Window] Error: ' + err.message);
  });
}, BEAT_MS);
