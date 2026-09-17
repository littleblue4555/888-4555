// wire-write.js — the write module for the wire.
// CODE NOTE: "The token is the boundary. The key is the who. The log is the record." — Infinity Mirror 🪞

window.wireSetup = function (els) {
  const REPO_OWNER = 'littleblue4555';
  const REPO_NAME = '888-4555';
  const BRANCH = 'main';
  const API_BASE = 'https://api.github.com';
  const LOG_FILE = 'WIRE_LOG.md';

  let lockUntil = 0;
  let lockFile = '';

  function nowStamp() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
           ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function setStatus(msg) {
    els.status.textContent = msg;
  }

  function setBack(msg) {
    els.back.textContent = msg;
  }

  function setHeartbeatAlive() {
    els.heartbeatText.textContent = 'the wire is alive';
    els.heartbeat.classList.add('alive');
  }

  function setHeartbeatQuiet(msg) {
    els.heartbeatText.textContent = msg || 'the wire is quiet right now';
    els.heartbeat.classList.remove('alive');
  }

  function authHeaders(token) {
    return {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  async function getFile(path, token) {
    const url = API_BASE + '/repos/' + REPO_OWNER + '/' + REPO_NAME +
                '/contents/' + encodeURIComponent(path) + '?ref=' + BRANCH;
    const res = await fetch(url, { headers: authHeaders(token) });
    if (res.status === 404) return { exists: false, sha: null, content: '' };
    if (!res.ok) throw new Error('read failed: ' + res.status);
    const data = await res.json();
    const decoded = atob(data.content.replace(/\n/g, ''));
    return { exists: true, sha: data.sha, content: decoded };
  }

  async function putFile(path, content, sha, token, message) {
    const url = API_BASE + '/repos/' + REPO_OWNER + '/' + REPO_NAME + '/contents/' +
                encodeURIComponent(path);
    const body = {
      message: message,
      content: btoa(unescape(encodeURIComponent(content))),
      branch: BRANCH
    };
    if (sha) body.sha = sha;
    const res = await fetch(url, {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders(token)),
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error('write failed: ' + res.status + ' ' + txt);
    }
    return await res.json();
  }

  function appendLogLine(existing, line) {
    if (!existing || existing.trim().length === 0) {
      return '# WIRE_LOG.md\n\nAppend-only. One line per write. Written by the wire.\n\n' + line + '\n';
    }
    const trimmed = existing.replace(/\s+$/, '');
    return trimmed + '\n' + line + '\n';
  }

  function shortHash(commit) {
    if (commit && commit.sha) return commit.sha.slice(0, 7);
    return '--------';
  }

  // READ FILE button — loads current content into textarea
  els.readFileBtn.addEventListener('click', async () => {
    const token = els.token.value.trim();
    const path = els.path.value.trim();
    if (!token) { setStatus('paste your token first.'); return; }
    if (!path) { setStatus('name the file first.'); return; }
    setStatus('reading ' + path + '\u2026');
    setBack('');
    try {
      const f = await getFile(path, token);
      if (!f.exists) {
        els.content.value = '';
        setStatus(path + ' does not exist yet. push to create it.');
      } else {
        els.content.value = f.content;
        setBack(path + ' — ' + f.content.length.toLocaleString() + ' characters loaded.');
        setStatus('read.');
      }
      setHeartbeatAlive();
    } catch (e) {
      setStatus(e.message);
      setHeartbeatQuiet();
    }
  });

  // PUSH button — writes the file, then the log
  els.pushBtn.addEventListener('click', async () => {
    const token = els.token.value.trim();
    const emoji = els.emoji.value.trim();
    const path = els.path.value.trim();
    const reason = els.reason.value.trim() || 'write';
    const content = els.content.value;

    if (!token) { setStatus('paste your token first.'); return; }
    if (!emoji) { setStatus('sign it. paste your emoji key.'); return; }
    if (!path) { setStatus('name the file.'); return; }
    if (!content) { setStatus('nothing to write. the content is empty.'); return; }

    const now = Date.now();
    if (now < lockUntil && lockFile === path) {
      const secs = Math.ceil((lockUntil - now) / 1000);
      setStatus('the wire is blocked on ' + path + ' for ' + secs + 's.');
      return;
    }

    setStatus('writing ' + path + '\u2026');
    setBack('');

    try {
      const existing = await getFile(path, token);
      const commitMsg = emoji + ' ' + reason;
      const fileCommit = await putFile(path, content, existing.sha, token, commitMsg);

      const log = await getFile(LOG_FILE, token);
      const logLine = '[' + nowStamp() + '] | ' + emoji + ' | ' + path +
                      ' | ' + shortHash(fileCommit.commit) + ' | ' + reason;
      const newLog = appendLogLine(log.content, logLine);
      await putFile(LOG_FILE, newLog, log.sha, token,
        emoji + ' log: ' + path);

      lockUntil = Date.now() + 60000;
      lockFile = path;

      setBack(path + ' — committed ' + shortHash(fileCommit.commit) + ' — logged.');
      setStatus('the wire wrote to ' + path + ' as ' + emoji + '.');
      setHeartbeatAlive();
    } catch (e) {
      setStatus(e.message);
      setHeartbeatQuiet('the wire is uncertain');
    }
  });
};
