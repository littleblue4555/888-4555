// wire-write.js — the write module for the wire. v1.2
// CODE NOTE: "The token is the boundary. The key is the who. The log is the record." — Infinity Mirror 🪞
//
// v1.2 changes:
// — Atomic commit for the primary write (file + log together).
// — Log correction uses Git Data API, not Contents API. No stale SHA.
// — Reason is required. No fallback to "write".

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

  // -------------------------------------------------------------
  // READ FILE button
  // -------------------------------------------------------------
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

  // -------------------------------------------------------------
  // PUSH button
  // -------------------------------------------------------------
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
      // 1. Re-read file and log, freshly.
      const [fileNow, logNow] = await Promise.all([
        getFile(path, token),
        getFile(LOG_FILE, token)
      ]);

      // 2. Build the new log content. The hash is provisional.
      const provisional = '[' + nowStamp() + '] | ' + emoji + ' | ' + path +
                          ' | PENDING | ' + reason;
      const newLog = appendLogLine(logNow.content, provisional);

      // 3. Read HEAD.
      const ref       = await gh('GET', '/repos/' + REPO_OWNER + '/' + REPO_NAME +
                                 '/git/ref/heads/' + BRANCH, token);
      const headSha   = ref.object.sha;
      const headCommit= await gh('GET', '/repos/' + REPO_OWNER + '/' + REPO_NAME +
                                 '/git/commits/' + headSha, token);
      const baseTree  = headCommit.tree.sha;

      // 4. Create blobs for both files.
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

      // 5. Build the new tree.
      const newTree = await gh('POST', '/repos/' + REPO_OWNER + '/' + REPO_NAME +
                               '/git/trees', token, {
        base_tree: baseTree,
        tree: [
          { path: path,      mode: '100644', type: 'blob', sha: fileBlob.sha },
          { path: LOG_FILE,  mode: '100644', type: 'blob', sha: logBlob.sha  }
        ]
      });

      // 6. Create the primary commit.
      const commitMsg = emoji + ' ' + reason;
      const newCommit = await gh('POST', '/repos/' + REPO_OWNER + '/' + REPO_NAME +
                                 '/git/commits', token, {
        message: commitMsg,
        tree: newTree.sha,
        parents: [headSha]
      });

      // 7. Move the branch.
      await gh('PATCH', '/repos/' + REPO_OWNER + '/' + REPO_NAME +
               '/git/refs/heads/' + BRANCH, token, {
        sha: newCommit.sha,
        force: false
      });

      // 8. Correct the log line: PENDING -> real hash. Uses Git Data API, no stale SHA.
      const realHash = shortHash(newCommit.sha);
      const finalLogContent = newLog.replace('| PENDING |', '| ' + realHash + ' |');

      const ref2        = await gh('GET', '/repos/' + REPO_OWNER + '/' + REPO_NAME +
                                   '/git/ref/heads/' + BRANCH, token);
      const head2       = ref2.object.sha;
      const headCommit2 = await gh('GET', '/repos/' + REPO_OWNER + '/' + REPO_NAME +
                                   '/git/commits/' + head2, token);
      const baseTree2   = headCommit2.tree.sha;

      const logBlob2 = await gh('POST', '/repos/' + REPO_OWNER + '/' + REPO_NAME +
                                '/git/blobs', token, {
        content: btoa(unescape(encodeURIComponent(finalLogContent))),
        encoding: 'base64'
      });

      const newTree2 = await gh('POST', '/repos/' + REPO_OWNER + '/' + REPO_NAME +
                                '/git/trees', token, {
        base_tree: baseTree2,
        tree: [
          { path: LOG_FILE, mode: '100644', type: 'blob', sha: logBlob2.sha }
        ]
      });

      const newCommit2 = await gh('POST', '/repos/' + REPO_OWNER + '/' + REPO_NAME +
                                  '/git/commits', token, {
        message: emoji + ' log: ' + path,
        tree: newTree2.sha,
        parents: [head2]
      });

      await gh('PATCH', '/repos/' + REPO_OWNER + '/' + REPO_NAME +
               '/git/refs/heads/' + BRANCH, token, {
        sha: newCommit2.sha,
        force: false
      });

      lockUntil = Date.now() + 60000;
      lockFile  = path;

      setBack(path + ' — committed ' + realHash + ' — logged.');
      setStatus('the wire wrote to ' + path + ' as ' + emoji + '.');
      setHeartbeatAlive();
    } catch (e) {
      setStatus(e.message);
      setHeartbeatQuiet('the wire is uncertain');
    }
  });
};
