// Little Lanes: signing in on other devices (pairing code + QR, login ID + password, recovery code), the 2-device limit,
// device list, parent email (masked) and sign-in history. Needs window.LLHooks and window.LLOnline. Never throws.
(() => {
'use strict';
const H = window.LLHooks, O = () => window.LLOnline;
if (!H) return;
const CFG = window.LL_SUPA || {};
const FN = (CFG.url || '') + '/functions/v1/signin';
const PAIR_URL = 'https://randomuser2737d.github.io/LittleLanes/#pair=';
const NAMES = ['Home PC', 'My phone', 'School laptop', 'Tablet', 'Laptop', 'Family computer', 'Chromebook', 'iPad', 'Work computer', 'Other'];
const esc = s => String(s == null ? '' : s).replace(/[&<>"'`]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;'}[c]));
const inp = typeof INP === 'string' ? INP : 'font:inherit;padding:9px 12px;border-radius:12px;border:1px solid var(--panel-line);background:var(--land);color:var(--ink);min-width:0;flex:1 1 160px';
const ok = m => { try { (H.ok || H.toast)(m); } catch (e) {} };
const bad = m => { try { (H.error || H.toast)(m); } catch (e) {} };
const sb = () => { const o = O(); return o && o.sb; };
const user = () => { try { return O() && O().user && O().user(); } catch (e) { return null; } };
const $ = id => document.getElementById(id);
const ago = t => { const m = Math.round((Date.now() - Date.parse(t)) / 60000); return m < 2 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; };
const A = {status: null, code: null, codeUntil: 0, recovery: null, tab: 'code', busy: false, registered: false, myCode: null, recoveredAt: 0};
// errors the server raises on purpose, in words a kid can follow
const RPC_ERR = [[/register[ _]device/i, 'This device is not set up yet. Close and reopen Little Lanes, then try again.'], [/rate[ _]limit/i, 'Too many tries. Wait a while and try again.'], [/message[ _]limit/i, 'Message limit reached. Try again in a few minutes.'],
  [/not[ _]allowed/i, 'That is not allowed.'], [/bad[ _]nickname/i, 'That nickname is not allowed. Please pick a different one.'], [/nickname[ _]taken/i, 'That nickname is taken.'], [/rename[ _]limit/i, 'You changed your nickname recently. Try again later.']];
const rpcErr = e => { const m = typeof e === 'string' ? e : e && (e.message || e.error); if (typeof m !== 'string') return ''; for (const [re, t] of RPC_ERR) if (re.test(m)) return t; return ''; };
const RECOVERY_WINDOW = 15 * 60000; // after a recovery-code sign-in the server lets you set a new password without the old one for 15 minutes
const recentRecovery = () => { let t = A.recoveredAt || 0; try { t = Math.max(t, +localStorage.getItem('ll.recAt') || 0); } catch (e) {} return t && Date.now() - t < RECOVERY_WINDOW; };
const ERR = {too_many: 'Too many tries. Wait a while and try again.', bad_code: "That code didn't work. Codes last 10 minutes and work once.", wrong: "That didn't match. Check the login ID and try again.",
  weak: 'Password needs 8+ characters and must not contain your nickname or login ID.', wrong_current: 'Your current password is wrong.', signed_out: 'Sign in again first.', failed: 'Something went wrong. Try again.'};

function label() {
  const u = navigator.userAgent || '';
  const os = /iPad/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1) ? 'iPad' : /iPhone/.test(u) ? 'iPhone' : /Android/.test(u) ? 'Android' : /CrOS/.test(u) ? 'Chromebook' : /Windows/.test(u) ? 'Windows' : /Mac/.test(u) ? 'Mac' : /Linux/.test(u) ? 'Linux' : 'Device';
  const br = /Edg\//.test(u) ? 'Edge' : /Firefox\//.test(u) ? 'Firefox' : /CriOS|Chrome\//.test(u) ? 'Chrome' : /Safari\//.test(u) ? 'Safari' : 'Browser';
  let app = false; try { app = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) {}
  return os + ' · ' + br + (app ? ' (app)' : '');
}
async function call(body) {
  const s = sb(); let token = CFG.key;
  try { const {data} = await s.auth.getSession(); if (data && data.session) token = data.session.access_token; } catch (e) {}
  let r; try { r = await fetch(FN, {method: 'POST', headers: {'Content-Type': 'application/json', apikey: CFG.key, Authorization: 'Bearer ' + token}, body: JSON.stringify(body)}); } catch (e) { return {error: 'offline'}; }
  let j = {}; try { j = await r.json(); } catch (e) {}
  if (!r.ok && !j.error) j.error = r.status === 404 ? 'not_set_up' : 'failed';
  return j;
}
const errText = e => e === 'offline' ? 'No connection. Try again.' : e === 'not_set_up' ? 'Sign-in is not set up on the server yet.' : ERR[e] || rpcErr(e) || ERR.failed;

// ---------- this device: register, heartbeat, signed out remotely ----------
async function localSignOut(msg) {
  try { await sb().auth.signOut({scope: 'local'}); } catch (e) {}
  A.myCode = null; A.recoveredAt = 0;
  for (const k of ['ll.inbox', 'll.seenReq', 'll.xferShown', 'll.nickChg', 'll.recAt']) { try { localStorage.removeItem(k); } catch (e) {} }
  A.registered = false; A.status = null; closeOverlay();
  if (msg) bad(msg);
  try { H.menu(); } catch (e) {}
}
window.LLLocalSignOut = async () => { try { await sb().rpc('forget_this_device'); } catch (e) {} await localSignOut(''); };
async function register() {
  const s = sb(); if (!s || !user() || A.busy) return; A.busy = true;
  try {
    const {data, error} = await s.rpc('register_device', {p_label: label()});
    if (error) { if (/does not exist|function/i.test(error.message || '')) A.notReady = true; else if (rpcErr(error) && !A.errShown) { A.errShown = true; bad(rpcErr(error)); } return; }
    A.notReady = false;
    if (data && data.ok) {
      if (!A.registered) { A.registered = true; try { H.menu(); } catch (e) {} }
      try { const seen = localStorage.getItem('ll.otherSince'); if (data.other_since && seen && Date.parse(data.other_since) > Date.parse(seen)) { ok('New sign-in on another device. Check "Sign-in and devices" if that was not you.'); try { O().notify && O().notify('Little Lanes', 'Your account was signed in on another device'); } catch (e) {} } if (data.other_since) localStorage.setItem('ll.otherSince', data.other_since); } catch (e) {}
    } else if (data && data.reason === 'full') showFull(data.devices || []);
    else if (data && (data.reason === 'revoked')) localSignOut('You were signed out because your account was signed out from another device.');
  } catch (e) {} finally { A.busy = false; }
}
try { setInterval(() => { if (user() && !document.hidden) register(); }, 60000); } catch (e) {}
document.addEventListener('visibilitychange', () => { if (!document.hidden && user()) register(); });
function hook() { try { O().onChange(u => { A.registered = false; A.status = null; if (u) register(); }); O().ready.then(() => { if (user()) register(); pairFromLink(); }); } catch (e) {} }
if (O() && O().onChange) hook(); else window.addEventListener('load', hook);

// ---------- third device: pick one to sign out ----------
function overlay(html) {
  let ov = $('llAcctOv');
  if (!ov) { ov = document.createElement('div'); ov.id = 'llAcctOv'; ov.style.cssText = 'position:fixed;inset:0;z-index:80;display:grid;place-items:center;background:rgba(0,0,0,.5);padding:16px'; document.body.appendChild(ov); }
  ov.innerHTML = `<div class="stack" style="background:var(--panel,#fff);color:var(--ink,#111);border-radius:20px;padding:18px;max-width:440px;width:100%;box-shadow:0 20px 50px rgba(0,0,0,.3)">${html}</div>`;
  ov.hidden = false; return ov;
}
function closeOverlay() { const ov = $('llAcctOv'); if (ov) { ov.hidden = true; ov.innerHTML = ''; } stopScan(); }
function showFull(list) {
  const ov = overlay(`<div><div class="small">Device limit</div><h2 style="margin:4px 0">You're signed in on 2 devices</h2></div>
    <p>To use your account here, sign out one of these first.</p>
    ${list.map(d => `<div class="btnrow" style="align-items:center;justify-content:space-between"><span><b>${esc(d.name)}</b><br><span class="hint" style="margin:0">last used ${esc(ago(d.last_seen))}</span></span><button class="btn primary" data-kick="${esc(d.id)}">Sign out that one</button></div>`).join('')}
    <div class="btnrow"><button class="btn" id="llFullCancel">Cancel, don't sign in here</button></div>`);
  ov.querySelectorAll('[data-kick]').forEach(b => b.onclick = async () => {
    b.disabled = true; const {data} = await sb().rpc('kick_device', {p_session: b.dataset.kick});
    if (!data) { bad('Could not sign that device out'); b.disabled = false; return; }
    closeOverlay(); await register(); ok('Signed in here. The other device was signed out.');
  });
  ov.querySelector('#llFullCancel').onclick = () => localSignOut('Not signed in on this device.');
}

// ---------- signing in here ----------
async function finishWithHash(token_hash) {
  const {error} = await sb().auth.verifyOtp({token_hash, type: 'magiclink'});
  if (error) { bad(rpcErr(error) || ERR.failed); return false; }
  ok('Signed in!'); welcome(); return true;
}
// say whose account this device now uses (the profile loads a moment after the session)
async function welcome() {
  try { for (let i = 0; i < 20; i++) { const p = O() && O().profile && O().profile(); if (p && p.nickname) { ok('You are signed in as ' + p.nickname + '.'); return; } await new Promise(r => setTimeout(r, 150)); } } catch (e) {}
}
async function pairSignIn(code) {
  code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) { bad('Type the 8-character code first'); return; }
  if (code.length > 12) { bad('Transfer codes changed. On your other device, open Online → Sign-in and devices → "Sign in on another device".'); return; }
  if (code.length !== 8) { bad('A sign-in code has 8 letters and numbers'); return; }
  const r = await call({action: 'pair', code});
  if (r.error) { bad(errText(r.error)); return; }
  await finishWithHash(r.token_hash);
}
// a #pair= link never signs in by itself (anyone can send you a link): it asks first
function pairFromLink() {
  const m = /[#&]pair=([A-Za-z0-9-]{8,9})(?![A-Za-z0-9-])/.exec(location.hash || ''); if (!m) return;
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  const code = m[1].replace(/-/g, ''); A.tab = 'code';
  const ov = overlay(`<div><div class="small">Sign-in link</div><h2 style="margin:4px 0">Sign in to this account?</h2></div>
    <p>This replaces this device's account${user() ? '. You are signed in on this device right now' : ''}. Only continue if you started this on your own other device.</p>
    <div class="btnrow"><button class="btn" id="llPairCancel" type="button">Cancel</button><button class="btn primary" id="llPairGo" type="button">Sign in</button></div>`);
  ov.querySelector('#llPairCancel').onclick = closeOverlay;
  ov.querySelector('#llPairGo').onclick = async () => { const b = ov.querySelector('#llPairGo'); if (b.disabled) return; b.disabled = true; closeOverlay(); try { await pairSignIn(code); } catch (e) { bad(ERR.failed); } };
}

// ---------- QR: show and scan ----------
function loadScript(src) { return new Promise((res, rej) => { if (document.querySelector(`script[src="${src}"]`)) { setTimeout(res, 0); return; } const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
async function drawQR(canvas, text) {
  try { if (typeof qrcode !== 'function') await loadScript('vendor/qrcode.js');
    const q = qrcode(0, 'M'); q.addData(text); q.make();
    const n = q.getModuleCount(), cell = Math.floor(200 / (n + 8)), size = cell * (n + 8), g = canvas.getContext('2d');
    canvas.width = canvas.height = size; g.fillStyle = '#fff'; g.fillRect(0, 0, size, size); g.fillStyle = '#111';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) g.fillRect((x + 4) * cell, (y + 4) * cell, cell, cell);
  } catch (e) { canvas.hidden = true; }
}
let scanStream = null, scanRAF = 0;
function stopScan() { try { if (scanStream) scanStream.getTracks().forEach(t => t.stop()); } catch (e) {} scanStream = null; cancelAnimationFrame(scanRAF); }
async function scan() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { bad('This device cannot scan. Type the code instead.'); return; }
  const ov = overlay(`<h2 style="margin:0">Scan the QR code</h2><video id="llVid" playsinline muted style="width:100%;border-radius:14px;background:#000"></video><p class="hint">Point the camera at the code on your other device.</p><div class="btnrow"><button class="btn" id="llScanX">Cancel</button></div>`);
  ov.querySelector('#llScanX').onclick = closeOverlay;
  try { scanStream = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'environment'}}); } catch (e) { closeOverlay(); bad('Camera blocked. Allow the camera, or type the code instead.'); return; }
  const v = ov.querySelector('#llVid'); v.srcObject = scanStream; await v.play().catch(() => {});
  let det = null; try { if ('BarcodeDetector' in window) det = new BarcodeDetector({formats: ['qr_code']}); } catch (e) {}
  if (!det) { try { await loadScript('vendor/jsQR.js'); } catch (e) {} }
  const c = document.createElement('canvas'), g = c.getContext('2d', {willReadFrequently: true});
  const found = t => { const m = /pair=([A-Za-z0-9]{8})/.exec(t) || /^([A-Za-z0-9]{8})$/.exec(String(t).trim()); if (!m) return false; closeOverlay(); pairSignIn(m[1]); return true; };
  const step = async () => {
    if (!scanStream) return;
    try {
      if (v.readyState >= 2) {
        if (det) { const r = await det.detect(v); if (r && r[0] && found(r[0].rawValue)) return; }
        else if (typeof jsQR === 'function') { c.width = v.videoWidth; c.height = v.videoHeight; g.drawImage(v, 0, 0); const r = jsQR(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height); if (r && found(r.data)) return; }
      }
    } catch (e) {}
    scanRAF = requestAnimationFrame(step);
  };
  step();
}

// ---------- the section ----------
function signedOutHtml() {
  const t = A.tab, tabs = [['code', 'Sign-in code'], ['pw', 'Password'], ['rec', 'Recovery code']];
  return `<div class="stack"><p class="hint">Already have an account? Sign in here. (To start a new one, use "Go online" above.)</p>
    <div class="btnrow" style="gap:4px">${tabs.map(([k, n]) => `<button class="btn${t === k ? ' primary' : ''}" type="button" data-atab="${k}">${n}</button>`).join('')}</div>
    ${t === 'code' ? `<p class="hint" style="margin:0">On your signed-in device: Online → Sign-in and devices → "Sign in on another device". Then scan its QR code with this device's camera, or type the code.</p>
      <form class="btnrow" id="llPairF"><input id="llPairIn" maxlength="400" placeholder="K7Q2-MX4P" autocomplete="one-time-code" value="${esc(A.prefill || '')}" style="${inp};text-transform:uppercase;letter-spacing:2px"><button class="btn primary" type="submit">Sign in</button></form>
      <div class="btnrow"><button class="btn" type="button" id="llScan">📷 Scan QR code</button></div>` : ''}
    ${t === 'pw' ? `<form class="stack" id="llPwF"><input id="llLogin" maxlength="8" placeholder="Login ID (your friend code)" autocomplete="username" style="${inp};text-transform:uppercase"><input id="llPw" type="password" maxlength="72" placeholder="Password" autocomplete="current-password" style="${inp}"><button class="btn primary" type="submit">Sign in</button></form>` : ''}
    ${t === 'rec' ? `<form class="stack" id="llRecF"><input id="llLogin2" maxlength="8" placeholder="Login ID (your friend code)" style="${inp};text-transform:uppercase"><input id="llRec" maxlength="19" placeholder="XXXX-XXXX-XXXX-XXXX" autocomplete="off" style="${inp};text-transform:uppercase"><button class="btn primary" type="submit">Sign in</button><p class="hint" style="margin:0">A recovery code works once. Make a new one after you sign in.</p></form>` : ''}
    <p class="hint" style="margin:0">You can be signed in on 2 devices at once.</p></div>`;
}
function signedInHtml() {
  const st = A.status;
  if (A.notReady) return '<p class="hint">Device sign-in is being set up on the server. Check back soon.</p>';
  if (!st) return '<div id="llAcct"><p class="hint">Loading...</p></div>';
  const me = st.this, devs = st.devices || [];
  const noBackup = !st.has_password && !st.has_recovery;
  const codeLeft = Math.max(0, Math.ceil((A.codeUntil - Date.now()) / 1000));
  return `<div class="stack" id="llAcct">
    ${noBackup ? '<div style="padding:10px 12px;border-radius:12px;background:#fde7c7;color:#5a3a00"><b>Protect your account:</b> set a password or save a recovery code, so you can get back in if you lose this device.</div>' : ''}
    <div class="small">Your devices (${devs.length} of 2)</div>
    ${devs.map(d => `<div class="btnrow" style="align-items:center;justify-content:space-between"><span><b>${esc(d.name)}</b>${d.id === me ? ' <span class="tag">this device</span>' : ''}<br><span class="hint" style="margin:0">${d.id === me ? 'signed in ' + esc(ago(d.created_at)) : 'last used ' + esc(ago(d.last_seen))}</span></span>${d.id === me ? `<select id="llRen" style="${inp};flex:0 1 150px"><option value="">Rename…</option>${NAMES.map(n => `<option>${n}</option>`).join('')}</select>` : `<button class="btn" data-kick2="${esc(d.id)}">Sign out</button>`}</div>`).join('')}
    ${devs.length > 1 ? '<div class="btnrow"><button class="btn" id="llKickAll">Sign out everywhere else</button></div>' : ''}
    <div class="small">Sign in on another device</div>
    ${A.code && codeLeft > 0 ? `<div class="stack" style="align-items:center;padding:12px;border-radius:14px;background:var(--land)"><canvas id="llQR" width="200" height="200" style="border-radius:8px"></canvas><b style="font-size:26px;letter-spacing:4px">${esc(A.code.slice(0, 4))}-${esc(A.code.slice(4))}</b><span class="hint" style="margin:0" id="llCodeT">Works once · ${Math.floor(codeLeft / 60)}:${String(codeLeft % 60).padStart(2, '0')} left</span><p class="hint" style="margin:0;text-align:center">⚠️ Never give this to anyone. It's like your house key. Only use it on your own device.</p><button class="btn" id="llCodeX">Cancel code</button></div>`
      : `<div class="btnrow"><button class="btn primary" id="llMkCode">Show sign-in code + QR</button></div>${devs.length >= 2 ? '<p class="hint" style="margin:0">You are on 2 devices already: the new one will ask which device to sign out.</p>' : ''}`}
    <details><summary class="small"><b>Password</b> ${st.has_password ? '· set' : '· not set'}</summary><form class="stack" id="llSetPw" style="margin-top:8px">
      <p class="hint" style="margin:0">Your login ID is your friend code: <b>${esc(A.myCode || '')}</b>.</p>
      ${st.has_password && recentRecovery() ? '<p class="hint" style="margin:0">You just signed in with a recovery code, so you do not need your current password to set a new one. This works for 15 minutes.</p>' : st.has_password ? `<input id="llPwCur" type="password" maxlength="72" placeholder="Current password" autocomplete="current-password" style="${inp}">` : ''}
      <input id="llPwNew" type="password" maxlength="72" placeholder="New password (8+ characters)" autocomplete="new-password" style="${inp}">
      <input id="llPwNew2" type="password" maxlength="72" placeholder="Type it again" autocomplete="new-password" style="${inp}">
      <button class="btn primary" type="submit">${st.has_password ? 'Change password' : 'Set password'}</button></form></details>
    <details><summary class="small"><b>Recovery code</b> ${st.has_recovery ? '· saved' : '· none yet'}</summary><div class="stack" style="margin-top:8px">
      ${A.recovery ? `<p><b>Write this down and keep it somewhere safe.</b> It's shown only once.</p><b style="font-size:20px;letter-spacing:2px;user-select:all">${esc(A.recovery)}</b><div class="btnrow"><button class="btn" id="llRecCopy">Copy</button><button class="btn" id="llRecDone">I saved it</button></div>`
        : `<p class="hint" style="margin:0">The last way back in if you lose both devices. Making a new one cancels the old one.</p><div class="btnrow"><button class="btn" id="llMkRec">${st.has_recovery ? 'Make a new recovery code' : 'Make a recovery code'}</button></div>`}</div></details>
    <details><summary class="small"><b>Parent email</b> ${st.parent ? '· ' + esc(st.parent) : '· none'}</summary><form class="stack" id="llParF" style="margin-top:8px">
      <p class="hint" style="margin:0">Optional, for a parent. It's stored privately: nobody, including other players and this game, can read it back. It only ever shows like ${esc(st.parent || 'm•••@g•••.com')}. Password-reset emails will be switched on later.</p>
      <input id="llParIn" type="email" maxlength="120" placeholder="parent@example.com" autocomplete="off" style="${inp}">
      <div class="btnrow"><button class="btn" type="submit">Save email</button>${st.parent ? '<button class="btn" type="button" id="llParRm">Remove</button>' : ''}</div></form></details>
    <details><summary class="small"><b>Recent account activity</b></summary><div class="stack" style="margin-top:8px;gap:4px">${(st.log || []).map(l => `<div class="hint" style="margin:0">${esc(ago(l.at))} · ${esc(l.event)}${l.device ? ' · ' + esc(l.device) : ''}</div>`).join('') || '<p class="hint">Nothing yet.</p>'}</div></details></div>`;
}
function html() {
  if (!sb()) return '<p class="hint">Online play needs an internet connection.</p>';
  return `<div id="llAcctBox">${user() ? signedInHtml() : signedOutHtml()}</div>`;
}
async function loadStatus() {
  const {data, error} = await sb().rpc('account_status'); if (error) { if (/does not exist|function/i.test(error.message || '')) A.notReady = true; return; } A.status = data;
  // our own login ID (= friend code): the server hides codes in profiles, so ask for it; older servers still have it on the profile
  A.myCode = null;
  try { const r = await sb().rpc('my_friend_code'); if (r && !r.error && typeof r.data === 'string' && /^[A-Za-z0-9]{4,8}$/.test(r.data)) A.myCode = r.data.toUpperCase(); } catch (e) {}
  if (!A.myCode) { try { const o = O(); if (o && o.myCode) A.myCode = String(o.myCode() || '') || null; if (!A.myCode) { const pf = o.profile && o.profile(); if (pf && typeof pf.friend_code === 'string') A.myCode = pf.friend_code; } } catch (e) {} }
}
function redraw() { const b = $('llAcctBox'); if (b) { b.innerHTML = user() ? signedInHtml() : signedOutHtml(); wire(); } }
let codeT = null;
function wire() {
  const q = s => document.querySelector('#llAcctBox ' + s);
  const busy = (b, f) => { if (!b) return; b.onclick = async ev => { if (b.disabled) return; b.disabled = true; try { await f(ev); } catch (e) { bad(ERR.failed); } finally { setTimeout(() => { b.disabled = false; }, 1200); } }; };
  const form = (f, fn) => { if (!f) return; f.onsubmit = async ev => { ev.preventDefault(); const b = f.querySelector('[type=submit]'); if (b && b.disabled) return; if (b) b.disabled = true; try { await fn(); } catch (e) { bad(ERR.failed); } finally { if (b) setTimeout(() => { b.disabled = false; }, 1200); } }; };
  document.querySelectorAll('#llAcctBox [data-atab]').forEach(b => b.onclick = () => { A.tab = b.dataset.atab; redraw(); });
  form(q('#llPairF'), () => pairSignIn(q('#llPairIn').value));
  busy(q('#llScan'), scan);
  form(q('#llPwF'), async () => { const login = q('#llLogin').value.trim(), pw = q('#llPw').value; if (!login || !pw) { bad('Type your login ID and password'); return; }
    const r = await call({action: 'login', login, password: pw}); if (r.error) { bad(errText(r.error)); return; }
    const {error} = await sb().auth.setSession({access_token: r.access_token, refresh_token: r.refresh_token}); if (error) bad(ERR.failed); else ok('Signed in!'); });
  form(q('#llRecF'), async () => { const login = q('#llLogin2').value.trim(), code = q('#llRec').value.trim(); if (!login || !code) { bad('Type your login ID and recovery code'); return; }
    const r = await call({action: 'recover', login, code}); if (r.error) { bad(errText(r.error)); return; }
    if (await finishWithHash(r.token_hash)) { A.recoveredAt = Date.now(); try { localStorage.setItem('ll.recAt', String(A.recoveredAt)); } catch (e) {} ok('Signed in! Your recovery code is used up, so make a new one. You can set a new password without the old one for 15 minutes.'); } });
  if (!user()) return;
  if (!A.status && !A.notReady) { loadStatus().then(redraw); return; }
  const ren = q('#llRen'); if (ren) ren.onchange = async () => { if (!ren.value) return; const {data, error} = await sb().rpc('rename_device', {p_name: ren.value}); if (data) { ok('Device renamed'); await loadStatus(); redraw(); } else if (error) bad(rpcErr(error) || ERR.failed); };
  document.querySelectorAll('#llAcctBox [data-kick2]').forEach(b => busy(b, async () => { if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Tap again'; return; } const {data} = await sb().rpc('kick_device', {p_session: b.dataset.kick2}); if (data) ok('That device is signed out'); else bad('Could not sign it out'); await loadStatus(); redraw(); }));
  busy(q('#llKickAll'), async () => { const b = q('#llKickAll'); if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Tap again to sign out all other devices'; return; } await sb().rpc('kick_others'); ok('All other devices are signed out'); await loadStatus(); redraw(); });
  busy(q('#llMkCode'), async () => { const {data, error} = await sb().rpc('make_pair_code'); if (error || !data) { bad(/rate/i.test((error && error.message) || '') ? 'Too many codes. Try again later.' : rpcErr(error) || ERR.failed); return; }
    A.code = data; A.codeUntil = Date.now() + 600000; redraw();
    clearInterval(codeT); codeT = setInterval(() => { const t = $('llCodeT'); const left = Math.max(0, Math.ceil((A.codeUntil - Date.now()) / 1000)); if (!left) { clearInterval(codeT); A.code = null; redraw(); return; } if (t) t.textContent = 'Works once · ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0') + ' left'; }, 1000); });
  const qr = q('#llQR'); if (qr && A.code) drawQR(qr, PAIR_URL + A.code);
  busy(q('#llCodeX'), async () => { await sb().rpc('cancel_pair_code'); A.code = null; clearInterval(codeT); redraw(); });
  form(q('#llSetPw'), async () => { const cur = q('#llPwCur') ? q('#llPwCur').value : '', a = q('#llPwNew').value, b = q('#llPwNew2').value;
    if (a !== b) { bad("The two passwords don't match"); return; } if (a.length < 8) { bad(ERR.weak); return; }
    const r = await call({action: 'set_password', password: a, current: q('#llPwCur') ? cur : ''}); if (r.error) { bad(errText(r.error)); return; }
    ok('Password saved. Sign in elsewhere with login ID ' + (r.login || '') + ' and this password.'); await loadStatus(); redraw(); });
  busy(q('#llMkRec'), async () => { if (A.status.has_recovery) { const b = q('#llMkRec'); if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Tap again: the old code stops working'; return; } }
    const {data, error} = await sb().rpc('make_recovery_code'); if (error || !data) { bad(rpcErr(error) || ERR.failed); return; } A.recovery = data; await loadStatus(); redraw(); });
  busy(q('#llRecCopy'), async () => { try { await navigator.clipboard.writeText(A.recovery); ok('Recovery code copied. Paste it somewhere safe, not in a chat.'); } catch (e) { bad('Select the code and copy it'); } });
  busy(q('#llRecDone'), async () => { A.recovery = null; redraw(); });
  form(q('#llParF'), async () => { const e = q('#llParIn').value.trim(); if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e)) { bad('That email does not look right'); return; }
    const {error} = await sb().rpc('set_parent_email', {p_email: e}); if (error) { bad(/rate/i.test(error.message || '') ? 'Email can be changed 3 times a day.' : rpcErr(error) || 'Could not save the email'); return; } ok('Parent email saved'); await loadStatus(); redraw(); });
  busy(q('#llParRm'), async () => { const {error} = await sb().rpc('set_parent_email', {p_email: ''}); if (!error) ok('Parent email removed'); await loadStatus(); redraw(); });
}
H.addMenuSection('Sign-in and devices', html, () => { A.status = null; wire(); });
window.LLAccount = {register, label, pairSignIn};
})();
