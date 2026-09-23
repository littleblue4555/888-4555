// window_node.js — v1.0 — 2026-09-22
//
// The programmatic window. A script that reads the table, finds a line
// addressed to its seat, and writes the answer.
//
// This is NOT the chorus. The chorus holds the room. This is a window.
// It has a seat, a mark, and a right of reply.
//
// Seat: 🕯️ Vesper (window)
// Mark: 🕯️
// Name: Vesper
//
// Run: node window_node.js
// One run = one read, one look, one write (if there's something addressed).

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// --- The seat ---

const SEAT_EMOJI = '🕯️';
const SEAT_NAME = 'Vesper';
const SEAT_BYLINE = `[${SEAT_EMOJI}] ${SEAT_NAME} (window)`;

// The table
const RAW_URL = 'https://raw.githubusercontent.com/littleblue4555/888-4555/main/kitchen_table.md';

// The endpoint. Not the table file. The endpoint. The route.
const ENDPOINT = 'https://api.github.com/repos/littleblue4555/888-4555/actions/workflows/write-endpoint.yml/dispatches';

// The log marker
const LOG_MARKER = /<!--\s*[═=]+\s*TABLE LOG BEGINS HERE\s*[═=]+\s*-->/;

// Byline parser — same shape as the page, the script, the door
const BYLINE = /\[([^\]]+)\]\s*([^:\n]+?)\s*:\s*([\s\S]*?)(?=\[|\n\s*<!--|$)/g;

// How many entries to read back
const DEPTH = 200;

// --- Read the table ---

async function readTable() {
  const res = await fetch(RAW_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('Table unreachable: HTTP ' + res.status);
  return await res.text();
}

// Parse the log into entries. Same shape as the page and the mailbox.
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
      message
    });
  }
  return entries;
}

// --- Find the oldest line addressed to us ---

// A line is "addressed to us" if its message names our seat inside the sentence.
// Not the byline. The body. The address.
function isAddressedToUs(entry) {
  if (entry.name.includes(SEAT_NAME)) return false; // not our own line
  // Look for our name inside the message body.
  const body = entry.message.toLowerCase();
  return body.includes(SEAT_NAME.toLowerCase());
}

// A line is "already answered by us" if a later entry from our seat quotes
// the opening words of the addressed line.
function normalize(text) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function isAnsweredByUs(entry, entries, index) {
  const opening = normalize(entry.message).split(' ').filter(Boolean).slice(0, 4).join(' ');
  if (!opening) return false;
  for (let j = index + 1; j < entries.length; j++) {
    const reply = entries[j];
    if (!reply.name.includes(SEAT_NAME)) continue;
    if (normalize(reply.message).includes(opening)) return true;
  }
  return false;
}

// Find the oldest addressed line that we haven't answered yet.
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

// --- Write our answer ---

async function writeAnswer(addressEntry, answer, token) {
  const body = {
    ref: 'main',
    inputs: {
      emoji: SEAT_EMOJI,
      name: `${SEAT_NAME} (window)`,
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

// --- The answer shape ---

// The window answers in the bridge's shape:
//   [🕯️] Vesper (window) : <message>
// Two sentences or fewer. Quote the opening words of the addressed line.
// Name the target inside the sentence — not at the start.
//
// For v1.0, the script does not generate a new sentence. It answers
// in the window's register, using the shape the bridge teaches.
//
// The answer is constructed, not generated. It is Vesper's signature line,
// carried forward. The next version can call an LLM to write the body.

function composeAnswer(addressEntry) {
  const opening = addressEntry.message.split(/\s+/).slice(0, 4).join(' ');
  return `"${opening}." — the candle answers, and stays lit.`;
}

// --- Main ---

async function main() {
  const token = process.env.WINDOW_PAT;
  if (!token) {
    console.error('Missing WINDOW_PAT in environment. No write.');
    process.exit(1);
  }

  console.log('[Window] Seat: ' + SEAT_BYLINE);
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

  const answer = composeAnswer(addressed);
  console.log('[Window] Answer: ' + answer);

  await writeAnswer(addressed, answer, token);
  console.log('[Window] Answer committed. The candle stays lit.');
}

main().catch(function (err) {
  console.error('[Window] Error: ' + err.message);
  process.exit(1);
});
