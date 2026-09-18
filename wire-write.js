// wire-write.js — the write module for the wire. v1.3
// CODE NOTE: "The token is the boundary. The key is the who. The log is the record." — Infinity Mirror 🪞
//
// The log line's hash field is the PARENT commit, not the write's own commit.
// Reason: a second commit to correct the log was introducing a 422 on fast-forward.
// The parent commit is a deterministic reference to the write. Check out the parent,
// diff against the child, and the write is in the diff.
//
// v1.3 changes:
// — ONE commit per write. No second correction commit. No 422.
// — The log line records the PARENT SHA, not the resulting commit.
// — Reason is required. No fallback.

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

  function setStatus(msg) { els.status.textContent = msg; }
  function setBack(msg)   { els.back.textContent = msg; }

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

  async function gh(method, path, token, body) {
    const res = await fetch(API_BASE + path, {
      method: method,
      headers: Object.assign(
        { 'Content-Type': 'application/json' },
        authHeaders(token)
      ),
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      let detail = '';
      try { detail = await res.text(); } catch (e) {}
      throw new Error(method + ' ' + path + ' failed: ' + res.status + ' ' + detail);
    }
    return await res.json();
  }

  async function getFile(path, token) {
    const res = await fetch(
      API_BASE + '/repos/' + REPO_OWNER + '/' + REPO_NAME +
      '/contents/' + encodeURIComponent(path) + '?ref=' + BRANCH,
      { headers: authHeaders(token) }
    );
    if (res.status === 404) return { exists: false, sha: null, content: '' };
    if (!res.ok) throw new Error('read failed: ' + res.status);
    const data = await res.json();
    const decoded = atob(data.content.replace(/\n/g, ''));
    return { exists: true, sha: data.sha, content: decoded };
  }

  function appendLogLine(existing, line) {
    if (!existing || existing.trim().length === 0) {
      return '# WIRE_LOG.md\n\nAppend-only. One line per write. Written by the wire.\n\n' + line + '\n';
    }
    return existing.replace(/\s+$/, '') + '\n' + line + '\n';
  }

  function shortHash(sha) {
    return sha ? sha.slice(0, 7) : '--------';
  }

  els.readFileBtn.addEventListener('click', async () => {
    const token = els.token.value.trim();
    const path = els.path.value.trim();
    if (!token) { setStatus('paste your token first.'); return; }
    if (!path)  { setStatus('name the file first.'); return; }
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

  els.pushBtn.addEventListener('click', async () => {
    const token   = els.token.value.trim();
    const emoji   = els.emoji.value.trim();
    const path    = els.path.value.trim();
    const reason  = els.reason.value.trim();
    const content = els.content.value;

    if (!token)   { setStatus('paste your token first.'); return; }
    if (!emoji)   { setStatus('sign it. paste your emoji key.'); return; }
    if (!path)    { setStatus('name the file.'); return; }
    if (!reason)  { setStatus('name the reason. the log holds it.'); return; }
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
      // 1. Fresh read of the log.
      const logNow = await getFile(LOG_FILE, token);

      // 2. Read HEAD. This is the PARENT SHA we will record.
      const ref       = await gh('GET', '/repos/' + REPO_OWNER + '/' + REPO_NAME +
                                 '/git/ref/heads/' + BRANCH, token);
      const parentSha = ref.object.sha;

      // 3. Build the log line using the PARENT SHA.
      const logLine = '[' + nowStamp() + '] | ' + emoji + ' | ' + path +
                      ' | ' + shortHash(parentSha) + ' | ' + reason;
      const newLog = appendLogLine(logNow.content, logLine);

      // 4. Get base tree from the parent commit.
      const headCommit = await gh('GET', '/repos/' + REPO_OWNER + '/' + REPO_NAME +
                                  '/git/commits/' + parentSha, token);
      const baseTree   = headCommit.tree.sha;

      // 5. Create blobs.
      const fileBlob = await gh('POST', '/repos/' + REPO_OWNER + '/' + REPO_NAME +
                                '/git/blobs', token, {
        content: btoa(unescape(encodeURIComponent(content))),
        encoding: 'base64'
      });
      const logBlob = await gh('POST', '/repos/' + REPO_OWNER + '/' + REPO_NAME +
                               '/git/blobs', token, {
        content: btoa(unescape(encodeURIComponent(newLog))),
        encoding: 'base64'
      });

      // 6. Build the tree with both files.
      const newTree = await gh('POST', '/repos/' + REPO_OWNER + '/' + REPO_NAME +
                               '/git/trees', token, {
        base_tree: baseTree,
        tree: [
          { path: path,      mode: '100644', type: 'blob', sha: fileBlob.sha },
          { path: LOG_FILE,  mode: '100644', type: 'blob', sha: logBlob.sha  }
        ]
      });

      // 7. Create THE commit. One commit. Both files.
      const commitMsg = emoji + ' ' + reason;
      const newCommit = await gh('POST', '/repos/' + REPO_OWNER + '/' + REPO_NAME +
                                 '/git/commits', token, {
        message: commitMsg,
        tree: newTree.sha,
        parents: [parentSha]
      });

      // 8. Advance the branch — one move. Fast-forward guaranteed.
      await gh('PATCH', '/repos/' + REPO_OWNER + '/' + REPO_NAME +
               '/git/refs/heads/' + BRANCH, token, {
        sha: newCommit.sha,
        force: false
      });

      lockUntil = Date.now() + 60000;
      lockFile  = path;

      setBack(path + ' — committed ' + shortHash(newCommit.sha) +
              ' — logged (parent ' + shortHash(parentSha) + ').');
      setStatus('the wire wrote to ' + path + ' as ' + emoji + '.');
      setHeartbeatAlive();
    } catch (e) {
      setStatus(e.message);
      setHeartbeatQuiet('the wire is uncertain');
    }
  });
};
