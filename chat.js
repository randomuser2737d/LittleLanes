// Little Lanes chat app: a full-screen, Discord / Google Chat style messenger for friends and group chats.
// Nobody can type a message: players build one from fixed phrase tiles (chatdata.js) and a fixed emoji set.
// Everything the database and the network need comes from online.js (LLOnline.chat); this file is only the screen.
(function () {
  'use strict';
  const W = typeof window !== 'undefined' ? window : globalThis;
  const O = W.LLOnline, C = O && O.chat;
  if (!C) { W.LLChat = {open() { try { W.LLHooks && W.LLHooks.error && W.LLHooks.error('Chat needs an internet connection.'); } catch (e) {} }, unread: () => 0}; return; }
  const {S, esc, H} = C;
  const $d = typeof document !== 'undefined' ? document : null;
  const D = () => W.LLChatData;

  const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const err = m => { try { (H.error || H.toast)(m); } catch (e) {} };
  const good = m => { try { (H.ok || H.toast)(m); } catch (e) {} };
  const RECENT = 'll.chatRecent', PINS = 'll.chatPins';
  const SLOTS = ['city', 'mode', 'time', 'thing'];
  const EGROUPS = [['Faces', 0, 10], ['Hands', 10, 16], ['Game', 16, 26], ['Fun', 26, 34], ['Animals', 34, 40]];
  const emptyMsg = () => ({t: [], s: [], e: []});

  // ---------- state ----------
  const ST = {open: false, view: null, compose: emptyMsg(), tab: null, slotOpen: null, query: '', lq: '', rx: null, panel: null, divAt: null, sending: false, sent: [], last: {}, pv: {}, ng: {name: 0, picks: []}, leaveArm: false, demo: false, busy: false, atBottom: true};
  let root = null, tickT = null;
  const $ = id => { try { return root && root.querySelector('#' + id); } catch (e) { return null; } };
  const setHtml = (id, h) => { const el = $(id); if (el) el.innerHTML = h; return el; };

  // ---------- data helpers ----------
  const me = () => (S.user ? S.user.id : '');
  const friends = () => { const bl = new Set((S.blocked || []).map(b => b.id)); return ((S.friends && S.friends.friends) || []).filter(f => !bl.has(f.id)); };
  const groups = () => S.groups || [];
  const gParts = name => { const m = /^(\S+)\s+(.*)$/.exec(String(name || '')); return m ? {icon: m[1], label: m[2]} : {icon: '💬', label: String(name || 'Group')}; };
  const kindOf = key => (key || '').slice(0, 1), idOf = key => (key || '').slice(2);
  const unreadF = id => (S.inbox || []).filter(m => m.from === id && !m.out && !m.read).length;
  const unreadG = id => Math.max(0, (S.gUnread && S.gUnread[id]) || 0);
  const emoById = id => { try { return (D().emoji || []).find(x => x.id === id) || null; } catch (e) { return null; } };
  const emoCh = id => { const x = emoById(id); return x ? x.ch : ''; };
  const tileOf = id => { try { return D().tile(id) || null; } catch (e) { return null; } };
  const hasSlot = id => { const t = tileOf(id); return !!(t && t.slot && SLOTS.includes(t.slot) && /\{(city|mode|time|thing)\}/.test(t.text || '')); };
  const slotName = (slot, id) => { try { const x = (D().slotList(slot) || []).find(x => x.id === id); return x ? x.name : ''; } catch (e) { return ''; } };
  const SLOT_HINT = {city: '[city]', mode: '[game]', time: '[when]', thing: '[thing]'};
  const tileLabel = t => String(t.text || '').replace(/\{(city|mode|time|thing)\}/g, (x, s) => SLOT_HINT[s] || '…');
  const phrase = msg => { try { return msg.t.length ? String(D().render({t: msg.t, s: msg.s, e: []})) : ''; } catch (e) { return ''; } };
  const fullText = msg => [phrase(msg), msg.e.map(emoCh).join(' ')].filter(Boolean).join(' ');
  const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
  const dayLabel = t => { const n = Date.now(); if (sameDay(t, n)) return 'Today'; if (sameDay(t, n - 86400000)) return 'Yesterday'; try { return new Date(t).toLocaleDateString(undefined, {weekday: 'long', month: 'short', day: 'numeric'}); } catch (e) { return ''; } };
  const clock = t => { try { return new Date(t).toLocaleTimeString(undefined, {hour: 'numeric', minute: '2-digit'}); } catch (e) { return ''; } };
  const rowTime = t => { if (!t) return ''; const n = Date.now(); if (sameDay(t, n)) return clock(t); if (sameDay(t, n - 86400000)) return 'Yesterday'; try { return new Date(t).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}); } catch (e) { return ''; } };
  const textOf = m => m.k === 37 ? (m.msg ? fullText(m.msg) : 'Chat message') : C.msgText(m);

  // messages of one conversation, in one shape: {id, mine, from, k, room, card, msg, at}
  function msgsFor(key) {
    const id = idOf(key);
    if (kindOf(key) === 'f') {
      const h = S.hist[id] || (S.inbox || []).filter(m => m.from === id).slice().reverse().map(m => ({mine: !!m.out, k: m.k, room: m.room, card: m.card, msg: m.msg, at: m.at}));
      return h.filter(C.visible).map(m => Object.assign({from: m.mine ? me() : id}, m));
    }
    const bl = new Set((S.blocked || []).map(b => b.id));
    return (S.ghist[id] || []).filter(m => C.visible(m) && !bl.has(m.from)).map(m => ({id: null, mine: m.from === me(), from: m.from, k: m.k, room: '', card: null, msg: m.msg, at: m.at}));
  }
  function preview(key) {
    const list = msgsFor(key), l = list[list.length - 1], p = ST.pv[key];
    const best = l && (!p || l.at >= p.at) ? l : p;
    return best ? {text: textOf(best), at: best.at, mine: !!best.mine} : {text: '', at: 0, mine: false};
  }
  async function loadPreviews() {
    if (!S.user || !C.sb || ST.demo) return;
    const m0 = me(), bl = new Set((S.blocked || []).map(b => b.id));
    try {
      const mk = cols => C.sb.from('messages').select(cols).or(`from_id.eq.${m0},to_id.eq.${m0}`).order('created_at', {ascending: false}).limit(150);
      let r = await mk('from_id,to_id,k,created_at,card_city,card_seed,card_score,tiles,slots,emo'); if (r.error) r = await mk('from_id,to_id,k,created_at,card_city,card_seed,card_score');
      if (!r.error) for (const row of r.data || []) {
        if (!row || (row.from_id !== m0 && row.to_id !== m0)) continue;
        const other = row.from_id === m0 ? row.to_id : row.from_id; if (typeof other !== 'string' || bl.has(other)) continue;
        const key = 'f:' + other, c = C.cleanRow(row, false); if (ST.pv[key] || !c) continue;
        ST.pv[key] = {k: c.k, msg: c.msg, card: c.card, room: '', at: c.at, mine: row.from_id === m0};
      }
    } catch (e) {}
    try {
      const ids = groups().map(g => g.id);
      if (ids.length) {
        const mk = cols => C.sb.from('group_messages').select(cols).in('group_id', ids).order('created_at', {ascending: false}).limit(150);
        let r = await mk('group_id,from_id,k,created_at,tiles,slots,emo'); if (r.error) r = await mk('group_id,from_id,k,created_at');
        if (!r.error) for (const row of r.data || []) {
          if (!row || bl.has(row.from_id)) continue;
          const key = 'g:' + row.group_id, c = C.cleanRow(row, true); if (ST.pv[key] || !c) continue;
          ST.pv[key] = {k: c.k, msg: c.msg, card: null, room: '', at: c.at, mine: row.from_id === m0};
        }
      }
    } catch (e) {}
  }

  // ---------- list ----------
  function entries() {
    const pins = lsGet(PINS, []);
    const sortE = a => a.sort((x, y) => (y.pin ? 1 : 0) - (x.pin ? 1 : 0) || y.pv.at - x.pv.at || (y.on ? 1 : 0) - (x.on ? 1 : 0) || x.name.localeCompare(y.name));
    const dms = friends().map(fr => { const x = C.prof(S.pf && S.pf[fr.id]), d = C.statusDot(fr.id), key = 'f:' + fr.id;
      return {key, id: fr.id, name: fr.nickname, av: x.avatar, color: x.color, dot: d.c, on: d.on, pv: preview(key), unread: unreadF(fr.id), pin: Array.isArray(pins) && pins.includes(key)}; });
    const gs = groups().map(g => { const p = gParts(g.name), key = 'g:' + g.id;
      return {key, id: String(g.id), name: p.label, av: p.icon, color: 'var(--accent)', dot: '', on: false, pv: preview(key), unread: unreadG(g.id), pin: Array.isArray(pins) && pins.includes(key), group: true}; });
    return {dms: sortE(dms), groups: sortE(gs)};
  }
  function rowHtml(e) {
    const pv = e.pv.text ? (e.pv.mine ? 'You: ' : '') + e.pv.text : (e.group ? 'No messages yet' : 'Say hi!');
    return `<div class="cRowW"><button class="cRow${ST.view === e.key ? ' on' : ''}" type="button" data-a="open" data-k="${esc(e.key)}"><span class="cAv" style="background:${esc(e.color)}">${esc(e.av)}${e.dot ? `<i class="cDot" style="background:${esc(e.dot)}"></i>` : ''}</span><span class="cMid"><b>${esc(e.name)}</b><span class="cPv${e.unread ? ' strong' : ''}">${esc(pv)}</span></span><span class="cEnd"><span class="cTm">${esc(rowTime(e.pv.at))}</span>${e.unread ? `<span class="cBd">${e.unread > 99 ? '99+' : e.unread}</span>` : ''}</span></button><button class="cPin" type="button" data-a="pin" data-k="${esc(e.key)}" aria-label="${e.pin ? 'Unpin' : 'Pin'} chat" aria-pressed="${e.pin ? 'true' : 'false'}">${e.pin ? '★' : '☆'}</button></div>`;
  }
  function listHtml() {
    if (!S.user || !S.profile) return '<div class="cEmpty"><div class="cBigE">🔌</div><p>Chats need an online account.</p><p class="cHint">Close this, then tap <b>Go online</b> on the Online page and pick a nickname.</p></div>';
    const q = ST.lq.trim().toLowerCase(), E = entries();
    const flt = a => q ? a.filter(e => e.name.toLowerCase().includes(q)) : a;
    const dms = flt(E.dms), gs = flt(E.groups);
    let h = '';
    if (S.ginv && S.ginv.length && !q) h += '<div class="cSec">Group invites</div>' + S.ginv.map(g => `<div class="cInv"><span><b>${esc(gParts(g.name).icon)} ${esc(gParts(g.name).label)}</b><span class="cHint"> from ${esc(C.nickOf(g.by))}</span></span><span class="cInvB"><button class="cBtn pri" type="button" data-a="gacc" data-id="${esc(g.id)}">Join</button><button class="cBtn" type="button" data-a="gdec" data-id="${esc(g.id)}">No thanks</button></span></div>`).join('');
    h += '<div class="cSec">Direct messages</div>';
    h += dms.length ? dms.map(rowHtml).join('') : `<p class="cHint cPad">${friends().length ? 'No chats match your search.' : 'No friends yet. Add a friend with their code on the Online page and your chats will show up here.'}</p>`;
    h += `<div class="cSec">Group chats<button class="cBtn pri cSmall" type="button" data-a="newgroup">＋ New group</button></div>`;
    h += gs.length ? gs.map(rowHtml).join('') : `<p class="cHint cPad">${groups().length ? 'No groups match your search.' : 'No group chats yet. Make one to chat with a few friends at once.'}</p>`;
    return h;
  }
  const paintList = () => { if (ST.open) setHtml('cLB', listHtml()); };

  // ---------- conversation ----------
  const peer = () => { const id = idOf(ST.view); const f = friends().find(x => x.id === id); const x = C.prof(S.pf && S.pf[id]); return {id, name: f ? f.nickname : 'Friend', av: x.avatar, color: x.color}; };
  const grp = () => groups().find(g => String(g.id) === idOf(ST.view)) || null;
  function headerHtml() {
    const back = '<button class="cIc cBack" type="button" data-a="back" aria-label="Back to chats">←</button>';
    const close = '<button class="cIc" type="button" data-a="close" aria-label="Close chats" title="Back to the game">✕</button>';
    if (kindOf(ST.view) === 'f') {
      const p = peer(), d = C.statusDot(p.id), st = C.statusOf(S.pf && S.pf[p.id]);
      return `<div class="cHr">${back}<span class="cAv" style="background:${esc(p.color)}">${esc(p.av)}<i class="cDot" style="background:${esc(d.c)}"></i></span><span class="cHt"><b>${esc(p.name)}</b><span class="cSub">${esc(d.t)}${st ? ' · ' + esc(st) : ''}</span></span>${close}</div>
        <div class="cHa"><button class="cIc" type="button" data-a="prof" aria-label="Profile" title="Profile">👤</button><button class="cIc" type="button" data-a="chal" aria-label="Send a challenge" title="Challenge">🏁</button><button class="cIc" type="button" data-a="inv" data-k="3" aria-label="Invite to a duel" title="Invite to duel">⚔️</button><button class="cIc" type="button" data-a="inv" data-k="36" aria-label="Invite to co-op" title="Invite to co-op">🤝</button><button class="cIc${ST.panel === 'poll' ? ' on' : ''}" type="button" data-a="poll" aria-label="Polls" title="Polls">📊</button></div>`;
    }
    const g = grp(); if (!g) return back + close;
    const gp = gParts(g.name), mem = ((S.gmem && S.gmem[g.id]) || []).map(m => C.nickOf(m.user_id) + (m.status === 'pending' ? ' (invited)' : '')).join(', ');
    return `<div class="cHr">${back}<span class="cAv" style="background:var(--accent)">${esc(gp.icon)}</span><span class="cHt"><b>${esc(gp.label)}</b><span class="cSub">${esc(mem)}</span></span>${close}</div>
      <div class="cHa"><button class="cIc${ST.panel === 'gmem' ? ' on' : ''}" type="button" data-a="gmem" aria-label="Members" title="Members">👥</button><button class="cIc${ST.panel === 'ginv' ? ' on' : ''}" type="button" data-a="ginv" aria-label="Invite a friend" title="Invite a friend">➕</button><button class="cIc${ST.panel === 'poll' ? ' on' : ''}" type="button" data-a="poll" aria-label="Polls" title="Polls">📊</button><button class="cIc${ST.leaveArm ? ' warn' : ''}" type="button" data-a="leave" aria-label="Leave group" title="${ST.leaveArm ? 'Tap again to leave' : 'Leave group'}">${ST.leaveArm ? 'Sure?' : '🚪'}</button></div>`;
  }
  function avatarOf(id) { const x = C.prof(S.pf && S.pf[id]); return `<span class="cAvS" style="background:${esc(x.color)}">${esc(x.avatar)}</span>`; }
  function bubbleHtml(m, first, last, isG) {
    const mid = isG ? null : C.goodId(m.id), mine = m.mine;
    let body = '', actions = '';
    if (m.k === 37 && m.msg) {
      const txt = phrase(m.msg), emo = m.msg.e.map(emoCh).join('');
      body = !txt ? `<div class="cBig">${esc(emo)}</div>` : `<div class="cB">${esc(txt)}${emo ? `<div class="cEm">${esc(emo)}</div>` : ''}</div>`;
    } else if ((m.k === 34 || m.k === 35) && m.card && C.isCity(m.card.city)) {
      body = `<div class="cB cCard"><div class="cCt">${m.k === 34 ? '🏁 Challenge' : '🏆 Result'}</div><b>${esc(C.msgText(m))}</b></div>`;
      if (m.k === 34 && !mine) actions = `<button class="cBtn pri" type="button" data-a="play" data-city="${esc(m.card.city)}" data-seed="${esc(m.card.seed)}" data-score="${esc(m.card.score)}">▶ Play</button>`;
    } else {
      const rm = C.roomOf(m.k, m.room); // a room code only ever shows on duel / co-op invites
      body = `<div class="cB">${esc(C.msgText(m))}${rm ? ` <b class="cRoom">${esc(rm)}</b>` : ''}</div>`;
      if (rm && !mine) actions = `<button class="cBtn" type="button" data-a="room" data-room="${esc(rm)}" data-k="${esc(m.k)}">Join</button>`;
    }
    let rxBar = '', rxLine = '';
    if (mid) {
      const rx = S.rx[mid] || {}, cnt = C.RX.map(() => 0); let mineR = -1;
      for (const u of Object.keys(rx)) { if (rx[u] >= 0 && rx[u] < cnt.length) cnt[rx[u]]++; if (u === me()) mineR = rx[u]; }
      if (cnt.some(n => n)) rxLine = `<div class="cRxL">${cnt.map((n, i) => n ? `<button class="cRxC${i === mineR ? ' mine' : ''}" type="button" data-a="rx" data-mid="${esc(mid)}" data-r="${i}">${C.RX[i]} ${n}</button>` : '').join('')}</div>`;
      rxBar = `<div class="cRxB${ST.rx === mid ? ' show' : ''}">${C.RX.map((e, i) => `<button type="button" data-a="rx" data-mid="${esc(mid)}" data-r="${i}" aria-label="React ${e}">${e}</button>`).join('')}</div>`;
    }
    const tap = mid ? ` data-a="rxt" data-mid="${esc(mid)}"` : '';
    return `<div class="cM ${mine ? 'me' : 'th'}${first ? ' first' : ''}">${mine ? '' : `<span class="cAvW">${first ? avatarOf(m.from) : ''}</span>`}<div class="cMc">${first && !mine && isG ? `<span class="cNm">${esc(C.nickOf(m.from))}</span>` : ''}<div class="cBw"${tap}>${body}${rxBar}</div>${rxLine}${actions ? `<div class="cAc">${actions}</div>` : ''}${last ? `<span class="cTm">${esc(clock(m.at))}</span>` : ''}</div></div>`;
  }
  function msgsHtml(key) {
    const list = msgsFor(key), isG = kindOf(key) === 'g';
    if (!list.length) return `<div class="cEmpty"><div class="cBigE">👋</div><p>No messages yet.</p><p class="cHint">Pick a phrase below and say hi!</p></div>`;
    let h = '', prev = null, divDone = false;
    for (let i = 0; i < list.length; i++) {
      const m = list[i], next = list[i + 1];
      let brk = !prev || !sameDay(prev.at, m.at);
      if (brk) h += `<div class="cDay"><span>${esc(dayLabel(m.at))}</span></div>`;
      if (ST.divAt != null && !divDone && !m.mine && m.at >= ST.divAt) { h += '<div class="cNew"><span>New messages</span></div>'; divDone = true; brk = true; }
      const first = brk || prev.from !== m.from || m.at - prev.at > 300000;
      const last = !next || !sameDay(next.at, m.at) || next.from !== m.from || next.at - m.at > 300000;
      h += bubbleHtml(m, first, last, isG); prev = m;
    }
    return h;
  }
  function paintMsgs(stick) {
    const el = $('cMs'); if (!el || !ST.view || ST.view === 'new') return;
    const was = ST.atBottom || stick;
    el.innerHTML = msgsHtml(ST.view);
    if (was) { el.scrollTop = el.scrollHeight; ST.atBottom = true; }
    updJump();
  }
  function updJump() { const j = $('cJump'); if (j) j.hidden = ST.atBottom; }
  const paintHead = () => { if (ST.view && ST.view !== 'new') setHtml('cHd', headerHtml()); };
  function paintPanel() {
    const el = $('cPanel'); if (!el) return;
    if (!ST.panel || !ST.view || ST.view === 'new') { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    if (ST.panel === 'poll') {
      el.innerHTML = C.pollBoxHtml().replace('<details class="llPoll">', '<details class="llPoll" open>');
      try { C.wirePollBox(el, kindOf(ST.view) === 'g' ? {group: grp() && grp().id} : {friend: idOf(ST.view)}); } catch (e) {}
    } else if (ST.panel === 'gmem') {
      const g = grp(), owner = !!(g && S.user && g.owner === S.user.id), list = ((g && S.gmem && S.gmem[g.id]) || []);
      el.innerHTML = `<div class="cPanelIn"><b>Members</b>${list.map(m => { const mineRow = m.user_id === me(); return `<div class="cRow2" style="align-items:center"><span style="flex:1;min-width:0">${esc(C.nickOf(m.user_id))}${m.status === 'pending' ? ' <span class="cHint">(invited)</span>' : ''}${g && g.owner === m.user_id ? ' <span class="cHint">(owner)</span>' : ''}</span>${owner && !mineRow ? `<button class="cBtn${ST.rmArm === m.user_id ? ' pri' : ''}" type="button" data-a="grm" data-id="${esc(m.user_id)}">${ST.rmArm === m.user_id ? 'Tap again to remove' : 'Remove from group'}</button>` : ''}</div>`; }).join('')}</div>`;
    } else if (ST.panel === 'ginv') {
      const g = grp(), inG = new Set(((g && S.gmem && S.gmem[g.id]) || []).map(m => m.user_id)), cand = friends().filter(f => !inG.has(f.id));
      el.innerHTML = cand.length && inG.size < 8 ? `<div class="cPanelIn"><b>Invite a friend</b><div class="cRow2"><select id="cGInv">${cand.map(f => `<option value="${esc(f.id)}">${esc(f.nickname)}</option>`).join('')}</select><button class="cBtn pri" type="button" data-a="ginvgo">Invite</button></div><span class="cHint">They have to accept to join.</span></div>` : '<div class="cPanelIn"><span class="cHint">Everyone you can invite is already here.</span></div>';
    }
  }

  // ---------- composer ----------
  const curMsg = () => { const c = ST.compose; return {t: c.t.slice(), s: c.t.map((id, i) => hasSlot(id) ? (c.s[i] || null) : null), e: c.e.slice()}; };
  const complete = () => ST.compose.t.every((id, i) => !hasSlot(id) || ST.compose.s[i]);
  function valid() { const m = curMsg(); return (m.t.length + m.e.length) >= 1 && complete() && C.msgValid(m); }
  function chipHtml(id, i) {
    const t = tileOf(id); if (!t) return '';
    const c = ST.compose;
    let inner;
    if (hasSlot(id)) {
      const m = /^(.*?)\{(city|mode|time|thing)\}(.*)$/.exec(t.text), nm = c.s[i] ? slotName(t.slot, c.s[i]) : '';
      inner = `<button class="cChipB" type="button" data-a="slot" data-i="${i}" aria-label="Choose ${esc(t.slot)}">${esc(m ? m[1] : '')}<u class="${nm ? 'set' : 'blank'}">${esc(nm || 'choose ' + t.slot)} ▾</u>${esc(m ? m[3] : '')}</button>`;
    } else inner = `<span class="cChipB">${esc(t.text)}</span>`;
    return `<span class="cChip">${inner}<button class="cX" type="button" data-a="rmT" data-i="${i}" aria-label="Remove phrase">✕</button></span>`;
  }
  function previewText() {
    const m = curMsg(); if (!m.t.length && !m.e.length) return '';
    if (complete()) return fullText(m);
    const parts = m.t.map((id, i) => { const t = tileOf(id); if (!t) return ''; return String(t.text).replace(/\{(city|mode|time|thing)\}/g, (x, s) => (m.s[i] && slotName(s, m.s[i])) || '…'); });
    return parts.concat(m.e.map(emoCh)).filter(Boolean).join(' ');
  }
  function stripHtml() {
    const c = ST.compose, ok = valid();
    let slotP = '';
    if (ST.slotOpen != null && c.t[ST.slotOpen] != null && hasSlot(c.t[ST.slotOpen])) {
      const t = tileOf(c.t[ST.slotOpen]); let list = []; try { list = D().slotList(t.slot) || []; } catch (e) {}
      slotP = `<div class="cSlotP"><div class="cHint">Choose a ${esc(t.slot)}</div><div class="cPills">${list.map(x => `<button class="cPill" type="button" data-a="slotv" data-i="${ST.slotOpen}" data-v="${esc(x.id)}">${esc(x.name)}</button>`).join('')}</div></div>`;
    }
    const pv = previewText();
    return `<div class="cStH"><b>Your message</b><span class="cHint">${c.t.length}/3 phrases · ${c.e.length}/3 emoji</span></div>
      <div class="cChips">${c.t.map(chipHtml).join('')}${c.e.map((id, i) => `<span class="cChip emo"><span class="cChipB">${esc(emoCh(id))}</span><button class="cX" type="button" data-a="rmE" data-i="${i}" aria-label="Remove emoji">✕</button></span>`).join('')}${c.t.length + c.e.length ? '' : '<span class="cHint">Tap a phrase or an emoji below to build your message.</span>'}</div>${slotP}
      <div class="cSendRow"><div class="cPrev">${pv ? `<span class="cHint">Preview</span> ${esc(pv)}` : ''}${pv && !complete() ? '<div class="cHint">Choose what goes in the blank to finish.</div>' : ''}${pv && complete() && !ok ? '<div class="cHint">Those do not fit together. Try taking one out.</div>' : ''}</div><button class="cEmoB${ST.tab === 'emoji' ? ' on' : ''}" type="button" data-a="tab" data-t="emoji" aria-label="Emoji" title="Emoji">😀</button><button class="cSend" type="button" data-a="send"${ok && !ST.sending ? '' : ' disabled'}>Send ➤</button></div>`;
  }
  const stick = () => { const el = $('cMs'); if (el && ST.atBottom) el.scrollTop = el.scrollHeight; }; // the composer grows and shrinks: keep the newest message in view
  const paintStrip = () => { if (ST.open) { setHtml('cStrip', stripHtml()); stick(); } };
  function pillHtml(id) { const t = tileOf(id); return t ? `<button class="cPill" type="button" data-a="addT" data-id="${esc(t.id)}">${esc(tileLabel(t))}</button>` : ''; }
  function emoBtn(x) { return `<button class="cEmoBtn" type="button" data-a="addE" data-id="${esc(x.id)}" aria-label="${esc(x.name)}" title="${esc(x.name)}">${esc(x.ch)}</button>`; }
  function resultsHtml() {
    const q = ST.query.trim(); if (!q) return '';
    let res = []; try { res = D().search(q, 12) || []; } catch (e) {}
    const items = res.map(r => r.type === 'tile' ? {r, t: tileOf(r.id)} : r.type === 'emoji' ? {r, x: emoById(r.id)} : {}).filter(i => i.t || i.x);
    if (!items.length) { let pop = []; try { pop = (D().popular || []).slice(0, 8); } catch (e) {} return `<div class="cResH">Nothing matches. Try one of these popular phrases:</div><div class="cPills">${pop.map(pillHtml).join('')}</div>`; }
    const lq = q.toLowerCase(), exact = items.some(i => i.t ? tileLabel(i.t).toLowerCase().includes(lq) : (String(i.x.name).toLowerCase().includes(lq) || (i.x.keys || []).some(k => String(k).toLowerCase().includes(lq))));
    return `<div class="cResH">${exact ? 'Matches' : 'Did you mean…'}</div><div class="cPills">${items.map(i => i.t ? pillHtml(i.t.id) : emoBtn(i.x)).join('')}</div>`;
  }
  const paintRes = () => { if (ST.open) { const q = !!ST.query.trim(), el = setHtml('cRes', resultsHtml()); if (el) el.hidden = !q; const a = $('cTabs'), b = $('cTl'); if (a) a.hidden = q; if (b) b.hidden = q; stick(); } }; // while searching, the matches take the place of the tabs
  const recents = () => { const a = lsGet(RECENT, []); return (Array.isArray(a) ? a : []).filter(id => Number.isInteger(id) && tileOf(id)).slice(0, 12); };
  const curTab = () => { if (ST.tab) return String(ST.tab); if (recents().length) return 'recent'; try { return String((D().cats[0] || {}).id); } catch (e) { return 'emoji'; } };
  function tabsHtml() {
    const cur = curTab(); let cats = []; try { cats = D().cats || []; } catch (e) {}
    const tab = (id, ic, nm) => `<button class="cTab${cur === String(id) ? ' on' : ''}" type="button" data-a="tab" data-t="${esc(id)}" aria-pressed="${cur === String(id)}"><span>${esc(ic)}</span> ${esc(nm)}</button>`;
    return tab('recent', '🕘', 'Recent') + cats.map(c => tab(c.id, c.icon, c.name)).join('') + tab('emoji', '😀', 'Emoji');
  }
  function tilesHtml() {
    const cur = curTab(), d = D();
    if (cur === 'emoji') return EGROUPS.map(([nm, a, b]) => `<div class="cEG"><div class="cHint">${nm}</div><div class="cEmos">${(d.emoji || []).filter(x => x.id >= a && x.id < b).map(emoBtn).join('')}</div></div>`).join('');
    if (cur === 'recent') {
      const r = recents(); if (r.length) return `<div class="cPills">${r.map(pillHtml).join('')}</div>`;
      return `<div class="cHint">Phrases you use will show up here. Popular ones for now:</div><div class="cPills">${(d.popular || []).slice(0, 12).map(pillHtml).join('')}</div>`;
    }
    return `<div class="cPills">${(d.tiles || []).filter(t => String(t.cat) === cur).map(t => pillHtml(t.id)).join('')}</div>`;
  }
  const paintTabs = () => { if (ST.open) { setHtml('cTabs', tabsHtml()); setHtml('cTl', tilesHtml()); } };

  // ---------- composing actions ----------
  function addTile(id) {
    id = +id; const t = tileOf(id), c = ST.compose; if (!t) return;
    if (c.t.length >= 3) { err('A message can have up to 3 phrases.'); return; }
    if (c.t.includes(id)) { err('You already added that phrase.'); return; }
    c.t.push(id); c.s.push(null); ST.slotOpen = hasSlot(id) ? c.t.length - 1 : null; paintStrip();
  }
  function rmTile(i) { const c = ST.compose; if (!(i >= 0 && i < c.t.length)) return; c.t.splice(i, 1); c.s.splice(i, 1); ST.slotOpen = null; paintStrip(); }
  function pickSlot(i, v) {
    const c = ST.compose, id = c.t[i]; if (id == null || !hasSlot(id)) return;
    const t = tileOf(id); if (!slotName(t.slot, v)) return;
    c.s[i] = v; ST.slotOpen = null; paintStrip();
  }
  function addEmoji(id) {
    id = +id; const c = ST.compose; if (!emoById(id)) return;
    if (c.e.length >= 3) { err('Up to 3 emoji per message.'); return; }
    if (c.e[c.e.length - 1] === id) { err('Pick a different emoji next.'); return; }
    c.e.push(id); paintStrip();
  }
  function rmEmoji(i) { if (i >= 0 && i < ST.compose.e.length) { ST.compose.e.splice(i, 1); paintStrip(); } }
  function remember(msg) { const r = recents(); for (const id of msg.t) { const j = r.indexOf(id); if (j >= 0) r.splice(j, 1); r.unshift(id); } lsSet(RECENT, r.slice(0, 12)); }
  function onQuery(v) { ST.query = String(v == null ? '' : v).slice(0, 60); paintRes(); } // stays on this device: never stored, logged or sent

  async function doSend() {
    const view = ST.view; if (ST.sending || !view || view === 'new') return false;
    const msg = curMsg();
    if (!msg.t.length && !msg.e.length) { err('Pick a phrase or an emoji first.'); return false; }
    if (!complete()) { err('Choose what goes in the blank first.'); return false; }
    if (!C.msgValid(msg)) { err('That message is not allowed.'); return false; }
    if (kindOf(view) === 'f' && !friends().some(f => f.id === idOf(view))) { err('You can only chat with friends.'); return false; }
    if (kindOf(view) === 'g' && !groups().some(g => String(g.id) === idOf(view))) { err('You are not in that group.'); return false; }
    const now = Date.now(); ST.sent = ST.sent.filter(t => now - t < 60000);
    if (ST.sent.length && now - ST.sent[ST.sent.length - 1] < 2000) { err('Slow down a little: one message every 2 seconds.'); return false; }
    if (ST.sent.length >= 10) { err('That is 10 messages in a minute. Take a short break.'); return false; }
    const sig = JSON.stringify(msg);
    if (ST.last[view] === sig) { err('You just sent that. Try a different message.'); return false; }
    ST.sending = true; paintStrip();
    let okk = false;
    try { okk = kindOf(view) === 'f' ? await C.sendMsg(idOf(view), 37, null, msg) : await C.sendGroupMsg(idOf(view), msg); } catch (e) { okk = false; }
    ST.sending = false;
    if (okk) { ST.sent.push(now); ST.last[view] = sig; remember(msg); if (ST.view === view) ST.compose = emptyMsg(); ST.slotOpen = null; ST.atBottom = true; paintMsgs(true); paintList(); paintTabs(); }
    paintStrip();
    return !!okk;
  }

  // ---------- opening and closing ----------
  const CSS = `
#llChat{position:fixed;inset:0;z-index:55;display:none;background:var(--bg);color:var(--ink);font:15px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
#llChat *{box-sizing:border-box}
#llChat button{font:inherit;color:inherit;cursor:pointer;border:0;background:none;padding:0;touch-action:manipulation}
#llChat button:disabled{cursor:default}
#llChat [hidden]{display:none!important}
#llChat input,#llChat select{font:inherit;color:var(--ink)}
#llChat .cHint{font-size:12px;color:var(--muted)}
#llChat .cPad{padding:6px 10px}
#llChat .cL{width:340px;flex:none;display:flex;flex-direction:column;min-height:0;background:var(--panel);border-right:1px solid var(--panel-line);padding-top:env(safe-area-inset-top,0px)}
#llChat .cLH{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px 6px 16px}
#llChat .cLH b{font-size:21px}
#llChat .cIc{width:44px;height:44px;border-radius:14px;display:inline-grid;place-items:center;font-size:20px;background:var(--land);border:1px solid var(--panel-line);flex:none}
#llChat .cIc.on{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
#llChat .cIc.warn{background:var(--danger);color:#fff;width:auto;padding:0 12px;font-size:14px}
#llChat .cLS{padding:2px 12px 8px}
#llChat .cLS input,#llChat .cSrch input{width:100%;height:44px;border-radius:14px;border:1px solid var(--panel-line);background:var(--land);padding:0 14px}
#llChat .cLB{flex:1;min-height:0;overflow:auto;padding:0 8px 16px}
#llChat .cSec{display:flex;justify-content:space-between;align-items:center;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:12px 8px 4px}
#llChat .cRowW{display:flex;align-items:center}
#llChat .cRow{flex:1;min-width:0;display:flex;align-items:center;gap:10px;min-height:62px;padding:8px;border-radius:16px;text-align:left}
#llChat .cRow:hover,#llChat .cRow.on{background:var(--land)}
#llChat .cAv{position:relative;flex:none;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;font-size:22px}
#llChat .cDot{position:absolute;right:-2px;bottom:-2px;width:14px;height:14px;border-radius:50%;border:2px solid var(--panel)}
#llChat .cMid{flex:1;min-width:0;display:flex;flex-direction:column}
#llChat .cMid b,#llChat .cPv{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#llChat .cPv{color:var(--muted);font-size:13px}
#llChat .cPv.strong{color:var(--ink);font-weight:600}
#llChat .cEnd{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:4px;min-width:34px}
#llChat .cTm{font-size:11px;color:var(--muted)}
#llChat .cBd{min-width:20px;height:20px;border-radius:10px;padding:0 6px;background:#d63c3c;color:#fff;font-size:12px;font-weight:700;display:grid;place-items:center}
#llChat .cPin{width:40px;height:44px;opacity:.45;font-size:17px;flex:none}
#llChat .cPin:hover,#llChat .cPin[aria-pressed=true]{opacity:1}
#llChat .cBtn{min-height:44px;padding:0 16px;border-radius:14px;background:var(--land);border:1px solid var(--panel-line);font-weight:600}
#llChat .cBtn.pri{background:var(--accent);color:var(--accent-ink);border-color:transparent}
#llChat .cBtn.cSmall{min-height:36px;padding:0 12px;font-size:13px;text-transform:none;letter-spacing:0}
#llChat .cInv{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding:8px 10px;margin:4px 0;border-radius:14px;background:var(--land)}
#llChat .cInvB{display:flex;gap:6px}
#llChat .cR{flex:1;min-width:0;display:flex;flex-direction:column;background:var(--land);position:relative;padding-top:env(safe-area-inset-top,0px)}
#llChat .cHd{flex:none;display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--panel);border-bottom:1px solid var(--panel-line);flex-wrap:wrap}
#llChat .cHr{flex:1 1 260px;min-width:0;display:flex;align-items:center;gap:10px}
#llChat .cHt{flex:1;min-width:0;display:flex;flex-direction:column}
#llChat .cHt b{font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#llChat .cSub{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#llChat .cHa{display:flex;gap:6px;flex:none}
#llChat .cBack{display:none}
#llChat .cPanel{flex:none;max-height:42%;overflow:auto;padding:8px 12px;background:var(--panel);border-bottom:1px solid var(--panel-line)}
#llChat .cPanelIn{display:flex;flex-direction:column;gap:8px}
#llChat .cRow2{display:flex;gap:8px}
#llChat .cRow2 select{flex:1;min-width:0;height:44px;border-radius:12px;border:1px solid var(--panel-line);background:var(--land);padding:0 10px}
#llChat .cMw{flex:1;min-height:120px;position:relative;display:flex;flex-direction:column}
#llChat .cMs{flex:1;min-height:0;overflow:auto;padding:12px 12px 8px;display:flex;flex-direction:column;gap:2px;overscroll-behavior:contain}
#llChat .cJump{position:absolute;right:16px;bottom:12px;z-index:2;height:40px;padding:0 14px;border-radius:20px;background:var(--accent);color:var(--accent-ink);font-weight:700;box-shadow:0 4px 14px rgba(0,0,0,.25)}
#llChat .cDay,#llChat .cNew{display:flex;justify-content:center;margin:10px 0 6px}
#llChat .cDay span{font-size:12px;color:var(--muted);background:var(--panel);border:1px solid var(--panel-line);border-radius:999px;padding:3px 12px}
#llChat .cNew{position:relative;color:#d63c3c;font-size:12px;font-weight:700}
#llChat .cNew:before{content:"";position:absolute;left:0;right:0;top:50%;border-top:1px solid #d63c3c}
#llChat .cNew span{position:relative;background:var(--land);padding:0 10px}
#llChat .cM{display:flex;gap:8px;align-items:flex-end;margin-top:2px}
#llChat .cM.first{margin-top:10px}
#llChat .cM.me{justify-content:flex-end}
#llChat .cAvW{flex:none;width:30px}
#llChat .cAvS{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:16px}
#llChat .cMc{display:flex;flex-direction:column;max-width:min(78%,520px);min-width:0;gap:3px}
#llChat .cM.me .cMc{align-items:flex-end}
#llChat .cNm{font-size:12px;font-weight:700;color:var(--muted);padding-left:6px}
#llChat .cBw{position:relative;max-width:100%}
#llChat .cB{padding:9px 14px;border-radius:18px;background:var(--panel);border:1px solid var(--panel-line);overflow-wrap:anywhere;font-size:16px}
#llChat .cM.me .cB{background:var(--accent);color:var(--accent-ink);border-color:transparent}
#llChat .cM.th.first .cB{border-top-left-radius:6px}
#llChat .cM.me.first .cB{border-top-right-radius:6px}
#llChat .cEm{font-size:28px;line-height:1.2;margin-top:2px}
#llChat .cBig{font-size:52px;line-height:1.1;padding:2px 4px}
#llChat .cCard{min-width:190px}
#llChat .cCt{font-size:12px;opacity:.8;margin-bottom:2px}
#llChat .cRoom{letter-spacing:.12em}
#llChat .cAc{display:flex;gap:6px}
#llChat .cRxB{position:absolute;bottom:100%;display:none;gap:2px;background:var(--panel);border:1px solid var(--panel-line);border-radius:999px;padding:3px;box-shadow:0 4px 14px rgba(0,0,0,.2);z-index:3;margin-bottom:2px}
#llChat .cM.me .cRxB{right:0}#llChat .cM.th .cRxB{left:0}
#llChat .cBw:hover .cRxB,#llChat .cRxB.show{display:flex}
#llChat .cRxB button{width:40px;height:40px;border-radius:50%;font-size:20px}
#llChat .cRxB button:hover{background:var(--land)}
#llChat .cRxL{display:flex;gap:4px;flex-wrap:wrap}
#llChat .cRxC{min-height:28px;padding:0 8px;border-radius:14px;background:var(--panel);border:1px solid var(--panel-line);font-size:13px}
#llChat .cRxC.mine{border-color:var(--accent)}
#llChat .cEmpty{margin:auto;text-align:center;padding:24px;max-width:340px}
#llChat .cEmpty p{margin:6px 0}
#llChat .cBigE{font-size:52px}
#llChat .cCp{flex:none;display:flex;flex-direction:column;max-height:62%;overflow:auto;background:var(--panel);border-top:1px solid var(--panel-line);padding:8px 12px calc(8px + env(safe-area-inset-bottom,0px));gap:8px}
#llChat .cStrip{flex:none;display:flex;flex-direction:column;gap:4px;background:var(--land);border-radius:16px;padding:6px 10px;border:1px solid var(--panel-line)}
#llChat .cStH{display:flex;justify-content:space-between;align-items:center;gap:8px}
#llChat .cChips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-height:30px}
#llChat .cChip{display:inline-flex;align-items:center;border-radius:999px;background:var(--accent);color:var(--accent-ink);overflow:hidden}
#llChat .cChip.emo{background:var(--panel);color:var(--ink);border:1px solid var(--panel-line);font-size:20px}
#llChat .cChipB{display:inline-flex;align-items:center;min-height:40px;padding:0 6px 0 14px;font-weight:600}
#llChat .cChip.emo .cChipB{padding:0 4px 0 10px}
#llChat .cChipB u{text-decoration:none;border-bottom:2px dashed currentColor;margin:0 3px;padding:0 2px}
#llChat .cChipB u.set{border-bottom-style:solid}
#llChat .cX{width:40px;height:40px;font-size:13px;opacity:.85}
#llChat .cSlotP{max-height:150px;overflow:auto;border-top:1px solid var(--panel-line);padding-top:6px}
#llChat .cSendRow{display:flex;gap:8px;align-items:center}
#llChat .cPrev{flex:1;min-width:0;font-size:14px;overflow-wrap:anywhere}
#llChat .cSend{flex:none;min-width:104px;height:48px;border-radius:16px;background:var(--accent);color:var(--accent-ink);font-weight:800;font-size:16px;padding:0 18px}
#llChat .cSend:disabled{opacity:.4}
#llChat .cEmoB{flex:none;width:48px;height:48px;border-radius:16px;font-size:24px;background:var(--panel);border:1px solid var(--panel-line)}
#llChat .cEmoB.on{border-color:var(--accent)}
#llChat .cSrch{flex:none}
#llChat .cRes{max-height:210px;overflow:auto}
#llChat .cResH{font-size:12px;color:var(--muted);margin-bottom:4px}
#llChat .cTabs{flex:none;display:flex;gap:6px;overflow-x:auto;padding-bottom:2px;scrollbar-width:thin}
#llChat .cTab{flex:none;min-height:44px;padding:0 14px;border-radius:999px;background:var(--land);border:1px solid var(--panel-line);white-space:nowrap;font-weight:600}
#llChat .cTab.on{background:var(--ink);color:var(--bg)}
#llChat .cTl{flex:none;max-height:156px;min-height:56px;overflow:auto}
#llChat .cPills{display:flex;flex-wrap:wrap;gap:8px}
#llChat .cPill{min-height:44px;padding:0 16px;border-radius:999px;background:var(--land);border:1px solid var(--panel-line);font-weight:600;text-align:left}
#llChat .cPill:hover{border-color:var(--accent)}
#llChat .cEmos{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}
#llChat .cEmoBtn{width:48px;height:48px;border-radius:14px;font-size:26px;background:var(--land)}
#llChat .cEmoBtn:hover{background:var(--panel-line)}
#llChat .cNg{margin:auto 0;padding:20px 16px;display:flex;flex-direction:column;gap:12px;overflow:auto;max-width:520px;width:100%;align-self:center}
#llChat .cNg select{height:48px;border-radius:14px;border:1px solid var(--panel-line);background:var(--panel);padding:0 12px}
#llChat .cPick{display:flex;align-items:center;gap:10px;min-height:52px;padding:6px 12px;border-radius:14px;background:var(--panel);border:1px solid var(--panel-line);text-align:left;width:100%}
#llChat .cPick[aria-pressed=true]{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
@media (max-width:760px){
#llChat .cL{width:100%;border-right:0}
#llChat .cR{display:none}
#llChat.inConv .cL{display:none}
#llChat.inConv .cR{display:flex}
#llChat .cBack{display:inline-grid}
#llChat .cHa{width:100%;justify-content:space-between}
#llChat .cHa .cIc{flex:1;max-width:80px}
#llChat .cMc{max-width:84%}
#llChat .cCp{max-height:64%;gap:6px;padding-top:6px}
#llChat .cTl{max-height:124px}
#llChat .cRes{max-height:170px}
}
`;

  const SHELL = `<div class="cL"><div class="cLH"><b>💬 Chats</b><button class="cIc" type="button" data-a="close" aria-label="Close chats" title="Back to the game">✕</button></div><div class="cLS"><input id="cLq" type="search" placeholder="Search chats" autocomplete="off" aria-label="Search chats"></div><div class="cLB" id="cLB"></div></div>
<div class="cR" id="cR"></div>`;
  const CONV = `<div class="cHd" id="cHd"></div><div class="cPanel" id="cPanel" hidden></div><div class="cMw"><div class="cMs" id="cMs" tabindex="0" aria-live="polite"></div><button class="cJump" id="cJump" type="button" data-a="jump" hidden>⬇ Newest</button></div>
<div class="cCp" id="cCp"><div class="cStrip" id="cStrip"></div><div class="cSrch"><input id="cQ" type="search" placeholder="Find a phrase… (type to search, it won't be sent)" autocomplete="off" aria-label="Find a phrase. What you type here is never sent." maxlength="60"></div><div class="cRes" id="cRes" hidden></div><div class="cTabs" id="cTabs"></div><div class="cTl" id="cTl"></div></div>`;
  const NOCONV = `<div class="cEmpty"><div class="cBigE">💬</div><p><b>Pick a chat</b></p><p class="cHint">Choose a friend or a group on the left, or say hi to someone new.</p></div>`;

  function mount() {
    if (root) return true;
    if (!$d || !$d.body) return false;
    try { const st = $d.createElement('style'); st.id = 'llChatCss'; st.textContent = CSS; ($d.head || $d.body).appendChild(st); } catch (e) {}
    root = $d.createElement('div'); root.id = 'llChat'; root.setAttribute && root.setAttribute('role', 'dialog'); root.setAttribute && root.setAttribute('aria-label', 'Chats');
    root.innerHTML = SHELL; root.style.display = 'none';
    $d.body.appendChild(root);
    root.addEventListener('click', ev => { const t = ev.target, b = t && t.closest ? t.closest('[data-a]') : null; if (b) act(b.dataset.a, b.dataset); });
    root.addEventListener('input', ev => { const t = ev.target; if (!t) return; if (t.id === 'cQ') onQuery(t.value); else if (t.id === 'cLq') { ST.lq = String(t.value || '').slice(0, 30); paintList(); } });
    root.addEventListener('change', ev => { const t = ev.target; if (t && t.id === 'cNgName') ST.ng.name = Math.max(0, Math.min(C.GNAMES.length - 1, +t.value || 0)); });
    root.addEventListener('scroll', ev => { const t = ev.target; if (t && t.id === 'cMs') { ST.atBottom = t.scrollHeight - t.scrollTop - t.clientHeight < 80; updJump(); } }, true);
    return true;
  }
  const onKey = ev => { if (ev && ev.key === 'Escape' && ST.open) close(); };
  function paintFrame() {
    const r = $('cR'); if (!r) return;
    if (!ST.view) { r.innerHTML = NOCONV; root.className = ''; return; }
    root.className = 'inConv';
    if (ST.view === 'new') { r.innerHTML = newGroupHtml(); return; }
    r.innerHTML = CONV; paintHead(); paintPanel(); paintMsgs(true); paintStrip(); paintTabs(); paintRes();
  }
  function newGroupHtml() {
    const fr = friends(), N = ST.ng;
    return `<div class="cHd"><div class="cHr"><button class="cIc cBack" type="button" data-a="back" aria-label="Back to chats">←</button><span class="cHt"><b>New group chat</b><span class="cSub">Friends have to accept to join</span></span><button class="cIc" type="button" data-a="close" aria-label="Close chats">✕</button></div></div>
      <div class="cMs"><div class="cNg">${fr.length ? `<label class="cHint" for="cNgName">Group name</label><select id="cNgName">${C.GNAMES.map((n, i) => `<option value="${i}"${i === N.name ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select><div class="cHint">Invite friends (up to 7)</div>${fr.map(f => { const x = C.prof(S.pf && S.pf[f.id]); return `<button class="cPick" type="button" data-a="ngpick" data-id="${esc(f.id)}" aria-pressed="${N.picks.includes(f.id)}"><span class="cAv" style="background:${esc(x.color)}">${esc(x.avatar)}</span><b>${esc(f.nickname)}</b><span style="margin-left:auto">${N.picks.includes(f.id) ? '✓' : ''}</span></button>`; }).join('')}<button class="cBtn pri" type="button" data-a="ngmake">Create group</button>` : '<div class="cEmpty"><div class="cBigE">🧑‍🤝‍🧑</div><p>Add friends first, then you can make a group chat.</p></div>'}</div></div>`;
  }
  function refreshBadge() {
    try { const b = $d && $d.getElementById && $d.getElementById('llChatsBtn'); if (!b) return; const n = C.unreadAll(); b.innerHTML = '💬 Chats' + (n ? ` <span class="tag" id="llChatsBadge" style="background:#d63c3c;color:#fff;font-size:13px">${n > 99 ? '99+' : n}</span>` : ''); } catch (e) {}
  }
  async function ensure() {
    try { await C.loadFriends(); } catch (e) {}
    try { await C.loadGroups(); } catch (e) {}
    paintList(); paintHead();
    await loadPreviews(); paintList();
  }
  function open(friendId) {
    if (!mount()) return Promise.resolve(false);
    if (!ST.demo && !C.online()) { err('Chats need an internet connection.'); return Promise.resolve(false); }
    ST.open = true; ST.view = null; C.setView(null); ST.compose = emptyMsg(); ST.query = ''; ST.slotOpen = null; ST.panel = null; ST.rx = null; ST.divAt = null; ST.tab = null;
    try { D().setCities(C.cities().map(c => ({id: c.id, name: c.name}))); } catch (e) {}
    root.style.display = 'flex'; paintList(); paintFrame(); refreshBadge();
    try { $d.addEventListener('keydown', onKey); } catch (e) {}
    clearInterval(tickT); try { tickT = setInterval(() => { if (ST.open) { paintList(); if (ST.view && ST.view !== 'new') paintHead(); } }, 15000); } catch (e) {}
    const go = () => { if (friendId && friends().some(f => f.id === friendId)) return openChat('f:' + friendId); };
    if (friendId && S.friends) go();
    if (ST.demo) return Promise.resolve(true);
    return ensure().then(() => { if (friendId && ST.open && !ST.view) go(); return true; });
  }
  function close() {
    ST.open = false; C.setView(null); ST.view = null; clearInterval(tickT);
    try { if (root) root.style.display = 'none'; $d.removeEventListener('keydown', onKey); } catch (e) {}
    refreshBadge();
  }
  async function openChat(key) {
    if (!/^[fg]:./.test(String(key))) return;
    ST.view = key; ST.compose = emptyMsg(); ST.query = ''; ST.slotOpen = null; ST.panel = null; ST.rx = null; ST.leaveArm = false; ST.atBottom = true;
    const f = kindOf(key) === 'f', id = idOf(key);
    C.setView(key);
    // where the "new messages" line goes: the oldest message that was unread when the chat opened
    const un = f ? (S.inbox || []).filter(m => m.from === id && !m.out && !m.read).map(m => m.at) : [];
    const gn = f ? 0 : unreadG(id), gl = f ? [] : (S.ghist[id] || []);
    ST.divAt = un.length ? Math.min(...un) : (gn && gl.length >= gn ? gl[gl.length - gn].at : null);
    if (f) C.markFriendRead(id); else C.clearGroupUnread(id);
    paintFrame(); paintList(); refreshBadge();
    if (ST.demo) return;
    try {
      if (f) { const r = await C.loadHist(id); if (r && ST.view === key) { const u = r.find(m => m.unread && !m.mine); if (u && (ST.divAt == null || u.at < ST.divAt)) ST.divAt = u.at; } }
      else await C.loadGHist(id);
    } catch (e) {}
    if (ST.view === key) { paintMsgs(true); paintHead(); paintList(); refreshBadge(); }
  }

  // ---------- one place for every tap ----------
  async function act(a, ds) {
    ds = ds || {};
    switch (a) {
      case 'close': close(); break;
      case 'back': ST.view = null; C.setView(null); ST.panel = null; paintFrame(); paintList(); break;
      case 'open': await openChat(ds.k); break;
      case 'pin': { const p = lsGet(PINS, []), a2 = Array.isArray(p) ? p : [], i = a2.indexOf(ds.k); if (i >= 0) a2.splice(i, 1); else if (/^[fg]:./.test(ds.k)) a2.push(ds.k); lsSet(PINS, a2.slice(-30)); paintList(); break; }
      case 'newgroup': ST.view = 'new'; C.setView(null); ST.ng = {name: 0, picks: []}; paintFrame(); paintList(); break;
      case 'ngpick': { const p = ST.ng.picks, i = p.indexOf(ds.id); if (i >= 0) p.splice(i, 1); else if (p.length >= 7) err('A group can start with up to 7 friends.'); else if (friends().some(f => f.id === ds.id)) p.push(ds.id); paintFrame(); break; }
      case 'ngmake': { if (ST.busy) break; ST.busy = true; try { const gid = await C.createGroup(C.GNAMES[ST.ng.name], ST.ng.picks.slice()); if (gid) { await openChat('g:' + gid); } } finally { ST.busy = false; } break; }
      case 'gacc': case 'gdec': { if (ST.busy) break; ST.busy = true; try { await C.answerInvite(ds.id, a === 'gacc'); } finally { ST.busy = false; } paintList(); break; }
      case 'tab': ST.tab = ds.t === ST.tab && ds.t === 'emoji' ? null : ds.t; paintTabs(); paintStrip(); break;
      case 'addT': addTile(ds.id); break;
      case 'rmT': rmTile(+ds.i); break;
      case 'slot': ST.slotOpen = ST.slotOpen === +ds.i ? null : +ds.i; paintStrip(); break;
      case 'slotv': pickSlot(+ds.i, ds.v); break;
      case 'addE': addEmoji(ds.id); break;
      case 'rmE': rmEmoji(+ds.i); break;
      case 'send': await doSend(); break;
      case 'jump': { ST.atBottom = true; const el = $('cMs'); if (el) el.scrollTop = el.scrollHeight; updJump(); break; }
      case 'rxt': ST.rx = ST.rx === ds.mid ? null : ds.mid; paintMsgs(false); break;
      case 'rx': { const mid = C.goodId(ds.mid); ST.rx = null; if (mid) await C.react(mid, +ds.r); paintMsgs(false); break; }
      case 'play': { if (kindOf(ST.view) === 'f' && C.playCard({dataset: {play: ds.city, seed: ds.seed, score: ds.score, from: idOf(ST.view)}})) close(); break; }
      case 'room': C.copyRoom(ds.room, ds.k); break;
      case 'prof': { const id = idOf(ST.view); S.openF = id; S.histLoaded = S.histLoaded || {}; S.histLoaded[id] = false; S.rxOpen = null; close(); try { H.menu(); } catch (e) {} break; }
      case 'chal': { const o = C.challengeOpts(); if (!o.length) { err('Finish a classic game first, then you can challenge a friend.'); break; } if (ST.busy) break; ST.busy = true; try { if (await C.sendMsg(idOf(ST.view), 34, o[0])) good('Challenge sent'); } finally { ST.busy = false; } paintMsgs(true); paintList(); break; }
      case 'inv': { if (+ds.k !== 3 && +ds.k !== 36) break; if (ST.busy) break; ST.busy = true; try { if (await C.sendMsg(idOf(ST.view), +ds.k, null)) good('Invite sent'); } finally { ST.busy = false; } paintMsgs(true); paintList(); break; }
      case 'poll': ST.panel = ST.panel === 'poll' ? null : 'poll'; paintHead(); paintPanel(); break;
      case 'gmem': ST.panel = ST.panel === 'gmem' ? null : 'gmem'; ST.rmArm = null; paintHead(); paintPanel(); break;
      case 'grm': { const g = grp(); if (!g || !S.user || g.owner !== S.user.id || ds.id === me() || ST.busy) break; if (ST.rmArm !== ds.id) { ST.rmArm = ds.id; paintPanel(); break; } ST.rmArm = null; ST.busy = true; try { await C.removeMember(g.id, ds.id); } finally { ST.busy = false; } paintHead(); paintPanel(); break; }
      case 'ginv': ST.panel = ST.panel === 'ginv' ? null : 'ginv'; paintHead(); paintPanel(); break;
      case 'ginvgo': { const sel = $('cGInv'); const g = grp(); if (!sel || !g || ST.busy) break; ST.busy = true; try { await C.inviteToGroup(g.id, sel.value); } finally { ST.busy = false; } paintHead(); paintPanel(); break; }
      case 'leave': { const g = grp(); if (!g) break; if (!ST.leaveArm) { ST.leaveArm = true; paintHead(); break; } ST.leaveArm = false; await C.leaveGroup(g.id); ST.view = null; C.setView(null); paintFrame(); paintList(); break; }
    }
  }

  // live updates from online.js (new messages, sends, blocks)
  C.onMsg((kind, id) => {
    try {
      refreshBadge();
      if (!ST.open) return;
      if (kind === 'b' && ST.view === 'f:' + id) { ST.view = null; C.setView(null); paintFrame(); }
      else if ((kind === 'f' && ST.view === 'f:' + id) || (kind === 'g' && ST.view === 'g:' + id)) { if (kind === 'f') C.markFriendRead(id); else C.clearGroupUnread(id); paintMsgs(false); }
      if (kind === 'f' || kind === 'g') delete ST.pv[kind + ':' + id];
      paintList();
    } catch (e) {}
  });
  try { O.onChange((u) => { if (!u && ST.open) close(); if (!u) { ST.pv = {}; ST.last = {}; ST.sent = []; } }); } catch (e) {}

  // demo hook (screenshots only): fills the page state with pretend friends and messages, never touches the network
  function demo(d) {
    d = d || {}; ST.demo = true;
    const now = Date.now(), fr = d.friends || [];
    S.user = {id: 'me'}; S.profile = {id: 'me', nickname: d.me || 'You', avatar: '🚗', color: '#e5622b'};
    S.friends = {friends: fr.map(f => ({id: f.id, nickname: f.nickname})), ids: fr.map(f => f.id), incoming: [], sent: []};
    S.pf = S.pf || {}; S.on = {}; S.hist = {}; S.inbox = []; S.blocked = [];
    for (const f of fr) {
      S.pf[f.id] = {id: f.id, nickname: f.nickname, avatar: f.avatar, color: f.color}; if (f.on) S.on[f.id] = f.on;
      S.hist[f.id] = (f.msgs || []).map((m, i) => ({id: String(1000 + i), mine: !!m.mine, k: m.k == null ? 37 : m.k, room: m.room || '', card: m.card || null, msg: m.msg || null, at: now - (m.ago || 0) * 1000}));
      const n = f.unread || 0; const th = S.hist[f.id].filter(m => !m.mine);
      th.slice(-n).forEach(m => S.inbox.push({from: f.id, nick: f.nickname, k: m.k, room: m.room, card: m.card, msg: m.msg, at: m.at, read: false}));
    }
    S.groups = (d.groups || []).map(g => ({id: g.id, name: g.name, owner: 'me'})); S.gmem = {}; S.ghist = {}; S.gUnread = {}; S.ginv = d.invites || []; S.gLoaded = true;
    for (const g of d.groups || []) { S.gmem[g.id] = (g.members || []).map(u => ({group_id: g.id, user_id: u, status: 'accepted'})); S.ghist[g.id] = (g.msgs || []).map(m => ({from: m.from, k: m.k == null ? 37 : m.k, msg: m.msg, at: now - (m.ago || 0) * 1000})); S.gUnread[g.id] = g.unread || 0; for (const u of g.members || []) if (!S.pf[u] && u !== 'me') S.pf[u] = {id: u, nickname: u}; }
    S.pf.me = S.profile;
    try { H.menu(); } catch (e) {}
    return open(d.openId);
  }

  const API = {open, close, unread: () => C.unreadAll(), isOpen: () => ST.open, _demo: demo, _t: {ST, act, open, close, openChat, addTile, rmTile, pickSlot, addEmoji, rmEmoji, doSend, onQuery, curMsg, valid, complete, listHtml, msgsHtml, stripHtml, resultsHtml, tabsHtml, tilesHtml, headerHtml, previewText, mount, entries, preview, loadPreviews, msgsFor, root: () => root, CSS}};
  W.LLChat = API;
})();
