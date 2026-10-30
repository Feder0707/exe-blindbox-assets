/* EXE BLIND BOX · engine v0.6.1 · form&soul.exe */
(function () {
  'use strict';
  const VERSION = '0.6.1';
  const RAR = ['common', 'rare', 'epic', 'legendary', 'mythic'];
  const RCOL = { common: '#7f97b3', rare: '#3f9fe0', epic: '#9a5ff0', legendary: '#f0b030', mythic: '#ff5fa2' };
  const RLABEL = { common: 'COMMON', rare: 'RARE', epic: 'EPIC', legendary: 'LEGENDARY', mythic: 'MYTHIC' };
  const CRUMB = { common: 1, rare: 2, epic: 4, legendary: 8, mythic: 15 };
  const DEF = {
    assetBase: '', themeBase: '', theme: null,
    openCmd: '!open', colCmd: '!collection', craftCmd: '!bake', modCmd: '!blindbox',
    mode: 'both', rewardId: '', who: 'everyone', cooldown: 60,
    weights: { common: 58, rare: 27, epic: 10, legendary: 4, mythic: 1 },
    shinyChance: 0.04, pity: 10, craftCost: 12,
    subBoxes: 1, bitsPerBox: 100, tipPerBox: 5, followBox: false, raidOn: true, rainSecs: 60, raidMin: 1,
    community: true, communityRain: true,
    light: 'B', fx: 'v4', celebStyle: 'cinema', holdSecs: 5.5, panelSecs: 9, showHint: true, hint: '', hintDelay: 25,
    sound: true, volume: 0.7, scale: 1, storeKey: 'exeblindbox_main', autoHide: 0,
  };
  const W = 1000, H = 1100;

  // ---------- utils
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const eo = t => 1 - Math.pow(1 - t, 3);
  const spring = (t, f = 2.2, d = 5) => 1 - Math.exp(-d * t) * Math.cos(f * 2 * Math.PI * t);
  const norm = s => String(s || '').trim().toLowerCase().replace(/^@/, '');
  const rnd = (a, b) => a + Math.random() * (b - a);

  function create(opts) {
    const canvas = opts.canvas, ctx = canvas.getContext('2d');
    canvas.width = W; canvas.height = H;
    let cfg = Object.assign({}, DEF, opts.config || {});
    cfg.weights = Object.assign({}, DEF.weights, (opts.config || {}).weights || {});
    const save = opts.save || (() => {});
    const manual = !!opts.manual;
    let theme = cfg.theme;
    let S = opts.state && opts.state.viewers ? opts.state : { v: 1, viewers: {}, community: { found: {}, done: false }, rewardId: '' };
    S.community = S.community || { found: {}, done: false };
    const imgs = {};
    let ready = false;
    const queue = [], panels = [], toasts = [], celebs = [];
    let cur = null, panel = null, celeb = null, rain = null, setRewardArm = false;
    let clock = 0, lastIdle = 0, pendingComm = 0; const hudFly = []; let hudDisp = null, hudPrevRain = false, hudFlip = -1, hudDoneT = -1, hudPing = -9, hudLast = 0;
    const lastOpen = {};

    // ---------- assets
    function load(src) {
      return new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
    }
    async function loadAll() {
      const b = cfg.themeBase, bx = theme.box;
      const icons = theme.icons ? Object.values(theme.icons) : [];
      const bnr = (theme.banners ? Object.values(theme.banners).map(b => b.img) : []).concat(theme.hud ? [theme.hud.bar, theme.hud.fill, theme.hud.gift] : []);
      const list = bnr.concat([bx.body, bx.lid, bx.seal, bx.piece]).concat(bx.puffs).concat(theme.items.map(i => i.img)).concat(theme.items.map(i => shinyName(i))).concat(theme.plaque ? [theme.plaque] : []).concat(icons);
      const snd = theme.sfx ? Object.entries(theme.sfx).map(async ([k, f]) => { try { const r = await fetch(b + f); if (r.ok) sfxRaw[k] = await r.arrayBuffer(); } catch (e) {} }) : [];
      await Promise.all(list.map(async f => { imgs[f] = await load(b + f); }).concat(snd));
      try { await document.fonts.load('700 40px Fredoka'); await document.fonts.load('600 30px Fredoka'); } catch (e) {}
      ready = true;
    }
    function shinyName(i) { return i.shinyImg || i.img.replace(/\.webp$/, '_shiny.webp'); }
    const READY = loadAll();
    const off = document.createElement('canvas'), octx = off.getContext('2d');

    // ---------- audio (synth)
    let AC = null;
    function ac() { if (!cfg.sound) return null; try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) { return null; } return AC; }
    function tone(f0, f1, dur, type = 'sine', vol = 0.3, delay = 0) {
      const a = ac(); if (!a) return; const t = a.currentTime + delay;
      const o = a.createOscillator(), g = a.createGain(); o.type = type;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * cfg.volume, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
    }
    function noise(dur, vol = 0.15, delay = 0, hp = 1200) {
      const a = ac(); if (!a) return; const t = a.currentTime + delay;
      const n = a.createBufferSource(), buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      n.buffer = buf; const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
      const g = a.createGain(); g.gain.value = vol * cfg.volume; n.connect(f).connect(g).connect(a.destination); n.start(t);
    }
    // recorded theme sounds (theme.sfx: key -> file). Falls back to the synth below when a file is missing.
    const sfxRaw = {}, sfxP = {}; let lastClaimSfx = -9;
    function sfx(key, fb, delay = 0) {
      const a = ac(); if (!a) return;
      if (!sfxRaw[key]) { if (fb) fb(); return; }
      if (!sfxP[key]) sfxP[key] = a.decodeAudioData(sfxRaw[key].slice(0)).catch(() => null);
      sfxP[key].then(bf => { if (!bf) { if (fb) fb(); return; } const src = a.createBufferSource(), g = a.createGain(); g.gain.value = cfg.volume; src.buffer = bf; src.connect(g).connect(a.destination); src.start(a.currentTime + delay); });
    }
    function sfxWarm() { const a = ac(); if (a) Object.keys(sfxRaw).forEach(k => { if (!sfxP[k]) sfxP[k] = a.decodeAudioData(sfxRaw[k].slice(0)).catch(() => null); }); }
    const SFX = {
      shake() { for (let i = 0; i < 6; i++) noise(0.05, 0.08 + i * 0.02, i * 0.09, 2500); },
      pop() { tone(700, 120, 0.22, 'triangle', 0.5); noise(0.18, 0.25, 0, 800); },
      reveal(r) { const base = { common: 523, rare: 587, epic: 659, legendary: 698, mythic: 784 }[r]; [0, 4, 7, 12].forEach((s, i) => tone(base * Math.pow(2, s / 12), base * Math.pow(2, s / 12), 0.25, 'triangle', 0.22, 0.08 * i)); },
      shiny() { [0, 3, 7, 10, 14, 19].forEach((s, i) => tone(1200 * Math.pow(2, s / 12), 1200 * Math.pow(2, s / 12), 0.18, 'sine', 0.12, 0.06 * i)); },
      fanfare() { [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => tone(392 * Math.pow(2, s / 12), 392 * Math.pow(2, s / 12), 0.3, 'square', 0.12, 0.13 * i)); },
      bad() { tone(300, 180, 0.2, 'sine', 0.2); },
    };

    // ---------- state helpers
    function viewer(name) {
      const k = norm(name); if (!k) return null;
      const v = S.viewers[k] || (S.viewers[k] = { n: name, items: {}, crumbs: 0, opened: 0, pity: 0, free: 0, sets: {} });
      v.n = name; v.seen = Date.now(); return v;
    }
    const itemById = id => theme.items.find(i => i.id === id);
    const owned = (v, id) => !!(v.items[id] && (v.items[id][0] > 0 || v.items[id][1] > 0));
    function persist() { save(JSON.parse(JSON.stringify(S))); }
    function allowed(roles) {
      roles = roles || {};
      if (roles.broadcaster || roles.mod) return true;
      if (cfg.who === 'subs') return !!(roles.sub || roles.vip);
      if (cfg.who === 'vips') return !!roles.vip;
      if (cfg.who === 'mods') return false;
      return true;
    }

    // ---------- roll
    function roll(v) {
      let pool = RAR.filter(r => theme.items.some(i => i.rarity === r));
      if (v.pity >= cfg.pity - 1 && cfg.pity > 0) pool = pool.filter(r => r !== 'common');
      const tot = pool.reduce((s, r) => s + (+cfg.weights[r] || 0), 0) || 1;
      let x = Math.random() * tot, rar = pool[0];
      for (const r of pool) { x -= (+cfg.weights[r] || 0); if (x <= 0) { rar = r; break; } }
      const opts = theme.items.filter(i => i.rarity === rar);
      const item = opts[Math.floor(Math.random() * opts.length)];
      const shiny = Math.random() < cfg.shinyChance;
      return { item, shiny };
    }
    function grant(v, item, shiny, src) {
      const slot = v.items[item.id] || (v.items[item.id] = [0, 0]);
      const idx = shiny ? 1 : 0;
      const isNew = slot[idx] === 0;
      slot[idx]++;
      let crumbs = 0;
      if (!isNew) { crumbs = CRUMB[item.rarity] * (shiny ? 2 : 1); v.crumbs += crumbs; }
      v.opened += src === 'craft' ? 0 : 1;
      v.pity = item.rarity === 'common' ? v.pity + 1 : 0;
      // set completion
      let setDone = null;
      const set = item.set;
      if (!v.sets[set] && theme.items.filter(i => i.set === set).every(i => owned(v, i.id))) { v.sets[set] = 1; setDone = theme.sets.find(s => s.id === set); }
      const allDone = !v.sets.__all && theme.items.every(i => owned(v, i.id)) ? (v.sets.__all = 1) : 0;
      // community
      let commDone = false, commNew = false;
      if (cfg.community && !S.community.found[item.id]) { S.community.found[item.id] = 1; commNew = true; if (!S.community.done && theme.items.every(i => S.community.found[i.id])) { S.community.done = true; commDone = true; } }
      const setCount = theme.items.filter(i => i.set === set).filter(i => owned(v, i.id)).length;
      const setTotal = theme.items.filter(i => i.set === set).length;
      const total = theme.items.filter(i => owned(v, i.id)).length;
      return { item, shiny, isNew, crumbs, setDone, allDone, commDone, commNew, setCount, setTotal, total };
    }

    // ---------- actions
    function enqueueOpen(name, src) {
      if (queue.length >= 60) return;
      const v = viewer(name); if (!v) return;
      const { item, shiny } = roll(v);
      const res = grant(v, item, shiny, src);
      if (res.commNew) pendingComm++;
      queue.push({ name: v.n, res, src });
      persist();
    }
    // test hook (demo/QA only, never called by the StreamElements files): open a box with a forced rarity / shiny / duplicate
    function testOpen(name, o) {
      o = o || {}; const v = viewer(name); if (!v) return;
      let pool = theme.items.filter(i => !o.rarity || i.rarity === o.rarity); if (!pool.length) return;
      if (o.dupe) { const own = pool.filter(i => owned(v, i.id)); if (own.length) pool = own; else { const f = pool[Math.floor(Math.random() * pool.length)]; grant(v, f, false, 'gift'); pool = [f]; } }
      else { const nw = pool.filter(i => !owned(v, i.id)); if (nw.length) pool = nw; }
      const item = pool[Math.floor(Math.random() * pool.length)], res = grant(v, item, !!o.shiny, 'gift');
      if (res.commNew) pendingComm++;
      queue.push({ name: v.n, res, src: 'gift' }); persist();
    }
    function toast(text, col) { toasts.push({ text, col: col || '#8f1c22', t0: null }); if (toasts.length > 4) toasts.shift(); }
    function showCollection(name) {
      const v = S.viewers[norm(name)];
      if (!v) { toast(name + ' has no collection yet · type ' + cfg.openCmd); return; }
      if (panels.some(p => p.key === norm(name)) || (panel && panel.key === norm(name))) return;
      panels.push({ key: norm(name), name: v.n });
    }
    function craft(name) {
      const v = viewer(name);
      const missing = theme.items.filter(i => !owned(v, i.id));
      if (!missing.length) { toast(v.n + ' already has every ' + theme.boxWord + ' friend!'); return; }
      if (v.crumbs < cfg.craftCost) { toast(v.n + ': ' + v.crumbs + '/' + cfg.craftCost + ' crumbs · open more boxes!'); sfx('bad', SFX.bad); return; }
      v.crumbs -= cfg.craftCost;
      const w = missing.map(i => ({ common: 6, rare: 4, epic: 2, legendary: 1, mythic: 0.5 }[i.rarity]));
      let x = Math.random() * w.reduce((a, b) => a + b, 0), pick = missing[0];
      for (let k = 0; k < missing.length; k++) { x -= w[k]; if (x <= 0) { pick = missing[k]; break; } }
      const res = grant(v, pick, false, 'craft');
      if (res.commNew) pendingComm++;
      queue.push({ name: v.n, res, src: 'craft' }); persist(); sfx('bake');
    }
    function startRain(secs, by) { rain = { until: clock + secs, total: secs, t0: clock, claimed: {}, by: by || '' }; sfx('rain_start'); if (!(theme.hud && imgs[theme.hud.bar])) toast((by ? by + ' brought a ' : '') + 'BOX RAIN! type ' + cfg.openCmd + ' for a free box', '#3f8fe0'); }

    function onChat(name, text, meta) {
      meta = meta || {}; const roles = meta.roles || {};
      const t = String(text || '').trim(); const low = t.toLowerCase(); const parts = low.split(/\s+/);
      const isMod = roles.broadcaster || roles.mod;
      // channel point redemption
      if (meta.rewardId) {
        if (setRewardArm && isMod) { S.rewardId = meta.rewardId; setRewardArm = false; persist(); toast('Blind box reward linked!', '#3f8fe0'); return; }
        const rid = cfg.rewardId || S.rewardId;
        if (rid && meta.rewardId === rid && cfg.mode !== 'command') { if (allowed(roles)) enqueueOpen(name, 'points'); return; }
      }
      if (parts[0] === norm(cfg.modCmd) && isMod) {
        const sub = parts[1];
        if (sub === 'give' && parts[2]) { const n = Math.min(20, Math.max(1, parseInt(parts[3] || '1', 10) || 1)); for (let i = 0; i < n; i++) enqueueOpen(t.split(/\s+/)[2].replace(/^@/, ''), 'gift'); }
        else if (sub === 'rain') startRain(Math.min(600, parseInt(parts[2] || cfg.rainSecs, 10) || cfg.rainSecs), name);
        else if (sub === 'setreward') { setRewardArm = true; toast('Now redeem the blind box reward once to link it', '#3f8fe0'); }
        else if (sub === 'crumbs' && parts[2]) { const v = viewer(t.split(/\s+/)[2].replace(/^@/, '')); v.crumbs += parseInt(parts[3] || '0', 10) || 0; persist(); }
        else if (sub === 'reset') { if (parts[2]) { delete S.viewers[norm(parts[2])]; } else { S = { v: 1, viewers: {}, community: { found: {}, done: false }, rewardId: S.rewardId }; } persist(); toast('Collection reset', '#3f8fe0'); }
        return;
      }
      if (parts[0] === norm(cfg.openCmd)) {
        if (!allowed(roles)) return;
        const k = norm(name);
        if (rain && clock < rain.until && !rain.claimed[k]) { rain.claimed[k] = 1; lastOpen[k] = clock; hudFly.push({ t0: clock, name }); hudPing = clock; if (clock - lastClaimSfx > 0.15) { lastClaimSfx = clock; sfx('rain_claim'); sfx('gift_fly', null, 0.05); } enqueueOpen(name, 'rain'); return; }
        const v = S.viewers[k];
        if (v && v.free > 0) { v.free--; enqueueOpen(name, 'free'); return; }
        if (cfg.mode === 'points') { toast(name + ': redeem the channel point reward to open a box'); return; }
        const last = lastOpen[k] || -1e9;
        if (!isMod && clock - last < cfg.cooldown) { return; }
        lastOpen[k] = clock; enqueueOpen(name, 'command'); return;
      }
      if (parts[0] === norm(cfg.colCmd)) { showCollection(parts[1] ? t.split(/\s+/)[1].replace(/^@/, '') : name); return; }
      if (parts[0] === norm(cfg.craftCmd)) { if (allowed(roles)) craft(name); return; }
    }
    function onEvent(ev, test) {
      ev = ev || {}; const name = ev.name || 'someone';
      if (ev.type === 'subscriber') { for (let i = 0; i < Math.max(0, cfg.subBoxes); i++) enqueueOpen(name, 'sub'); }
      else if (ev.type === 'cheer') { const n = Math.min(20, Math.floor((+ev.amount || 0) / Math.max(1, cfg.bitsPerBox))); for (let i = 0; i < n; i++) enqueueOpen(name, 'bits'); }
      else if (ev.type === 'tip') { const n = Math.min(20, Math.floor((+ev.amount || 0) / Math.max(0.01, cfg.tipPerBox))); for (let i = 0; i < n; i++) enqueueOpen(name, 'tip'); }
      else if (ev.type === 'follower') { if (cfg.followBox) enqueueOpen(name, 'follow'); }
      else if (ev.type === 'raid') { if (cfg.raidOn && (+ev.amount || 0) >= cfg.raidMin) startRain(cfg.rainSecs, name); }
    }

    // ---------- drawing helpers
    function font(sz, w = 700) { return w + ' ' + sz + 'px Fredoka, sans-serif'; }
    function pill(x, y, text, bg, fg, sz = 26, padX = 18, padY = 8) {
      ctx.font = font(sz); const w = ctx.measureText(text).width + padX * 2, h = sz + padY * 2;
      ctx.fillStyle = bg; rr(x - w / 2, y - h / 2, w, h, h / 2); ctx.fill();
      ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 1); return w;
    }
    function rr(x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    function drawImg(im, cx, cy, w, h, rot = 0, alpha = 1) {
      if (!im || w < 1 || h < 1) return; ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(cx, cy); if (rot) ctx.rotate(rot); ctx.drawImage(im, -w / 2, -h / 2, w, h); ctx.restore();
    }
    function itemArt(item, cx, cy, size, shiny, silhouette, alpha = 1) {
      const sim = shiny ? imgs[shinyName(item)] : null;
      const im = sim || imgs[item.img];
      ctx.save(); ctx.globalAlpha *= alpha;
      if (silhouette) ctx.filter = 'brightness(0) opacity(0.35)';
      else if (shiny && !sim) ctx.filter = 'hue-rotate(175deg) saturate(1.35) brightness(1.08)';
      if (im) {
        const s = size / Math.max(im.width, im.height), w = im.width * s, h = im.height * s;
        if (shiny && !silhouette && size > 60) {
          // holographic sheen: a moving rainbow band clipped to the character
          const ow = Math.ceil(w), oh = Math.ceil(h); off.width = ow; off.height = oh;
          octx.clearRect(0, 0, ow, oh); octx.globalCompositeOperation = 'source-over'; octx.drawImage(im, 0, 0, ow, oh);
          octx.globalCompositeOperation = 'source-atop';
          const ph = ((clock * 0.45) % 1.6) - 0.3;
          const g = octx.createLinearGradient(0, 0, ow, oh);
          const st = (x, c) => g.addColorStop(clamp(x), c);
          st(ph - 0.22, 'rgba(255,255,255,0)'); st(ph - 0.12, 'rgba(255,170,230,0.35)'); st(ph - 0.04, 'rgba(170,240,255,0.5)');
          st(ph + 0.04, 'rgba(255,255,220,0.6)'); st(ph + 0.12, 'rgba(190,170,255,0.35)'); st(ph + 0.22, 'rgba(255,255,255,0)');
          octx.fillStyle = g; octx.fillRect(0, 0, ow, oh); octx.globalCompositeOperation = 'source-over';
          ctx.drawImage(off, cx - w / 2, cy - h / 2, w, h);
        } else ctx.drawImage(im, cx - w / 2, cy - h / 2, w, h);
      } else { // placeholder art (no image yet)
        ctx.fillStyle = RCOL[item.rarity]; ctx.beginPath(); ctx.arc(cx, cy, size * 0.42, 0, 7); ctx.fill();
        ctx.lineWidth = Math.max(2, size * 0.03); ctx.strokeStyle = '#5a2e1a'; ctx.stroke();
        ctx.fillStyle = '#fff8ea'; ctx.font = font(Math.max(10, size * 0.16)); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const words = item.name.split(' '); words.slice(0, 2).forEach((wd, k) => ctx.fillText(wd, cx, cy + (k - (Math.min(2, words.length) - 1) / 2) * size * 0.18));
      }
      ctx.restore();
    }
    function plaque(x, y, w, h) {
      const im = theme.plaque && imgs[theme.plaque];
      if (!im) return false;
      const sc = h / im.height, cw = Math.min(w / 2, im.height * 0.27 * sc), sw = cw / sc;
      ctx.drawImage(im, 0, 0, sw, im.height, x, y, cw, h);
      ctx.drawImage(im, im.width - sw, 0, sw, im.height, x + w - cw, y, cw, h);
      ctx.drawImage(im, sw, 0, im.width - 2 * sw, im.height, x + cw - 1, y, w - 2 * cw + 2, h);
      return true;
    }
    function icon(key, cx, cy, sz) { const im = theme.icons && imgs[theme.icons[key]]; if (!im) return false; const s = sz / Math.max(im.width, im.height); ctx.drawImage(im, cx - im.width * s / 2, cy - im.height * s / 2, im.width * s, im.height * s); return true; }

    // ---------- box geometry
    const BOXW = 470;
    function boxGeo() {
      const bx = theme.box, body = imgs[bx.body], lid = imgs[bx.lid];
      const k = BOXW / (body ? body.width : 632);
      const bw = BOXW, bh = (body ? body.height : 508) * k;
      const baseY = theme.hud ? 988 : 1020, topY = baseY - bh;
      const lw = bw * bx.lidWidth, lh = lid ? lid.height * lw / lid.width : 300;
      const seamY = topY + bx.seam * k;
      const lidCy = seamY - lh * bx.lidBottom + lh / 2;
      return { k, bw, bh, baseY, topY, lw, lh, seamY, lidCy };
    }

    // ---------- opening animation state
    const T_POP = 0.8;
    function startOpen(entry) {
      if (entry.res.commNew) pendingComm = Math.max(0, pendingComm - 1);
      const g = boxGeo(); const bx = theme.box;
      const shells = [], drops = [], puffs = [];
      const sw = g.bw * bx.sealWidth;
      for (let i = 0; i < bx.pieces; i++) shells.push({ x0: W / 2 - sw / 2 + sw * (i + 0.5) / bx.pieces, vx: (i - (bx.pieces - 1) / 2) / ((bx.pieces - 1) / 2) * rnd(200, 340) + rnd(-50, 50), vy: -rnd(380, 580), vr: rnd(-9, 9), flip: i < bx.pieces / 2, s: rnd(0.95, 1.25) });
      for (let i = 0; i < 22; i++) { const a = rnd(0, Math.PI * 2), sp = rnd(260, 640); drops.push({ x0: W / 2 + rnd(-sw / 2, sw / 2), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8 - 180, im: bx.puffs[i % bx.puffs.length], s: rnd(22, 42), vr: rnd(-7, 7) }); }
      [[-0.42, 0], [-0.16, -16], [0.1, -8], [0.38, 4], [-0.02, 10]].forEach((p, i) => puffs.push({ dx: p[0] * sw, dy: p[1], im: bx.puffs[i % bx.puffs.length], s1: rnd(0.9, 1.15), rot: rnd(-0.3, 0.3) }));
      cur = { entry, t: 0, shells, drops, puffs, hold: queue.length > 2 ? Math.max(3, cfg.holdSecs - 2) : cfg.holdSecs, sfx: {} };
      if (cfg.fx === 'v3' || cfg.fx === 'v4') { const b3 = burstFor(cfg.previewRarity || entry.res.item.rarity, g, bx); Object.assign(cur, { shells: b3.shells, drops: b3.drops, puffs: b3.puffs, P: b3.P }); }
    }

    function drawBox(t, g, part) {
      const bx = theme.box;
      const body = imgs[bx.body], lid = imgs[bx.lid], seal = imgs[bx.seal], piece = imgs[bx.piece];
      const opening = !!cur;
      const ot = opening ? cur.t : 0;
      let shake = 0;
      if (opening && ot < T_POP) { const k = clamp((ot - 0.25) / (T_POP - 0.25)); shake = Math.sin(ot * 75) * 7 * (cur.P ? cur.P.shake : 1) * k * k; }
      else if (!opening) { shake = 0; }
      const idleBob = opening ? 0 : Math.sin(clock * 2) * 3;
      // body squash
      let bsy = 1;
      if (opening && ot >= T_POP) { const u = ot - T_POP; bsy = 1 - 0.07 * Math.exp(-6 * u) * Math.cos(16 * u); }
      const bh = g.bh * bsy, bw = g.bw * (2 - bsy);
      if (part !== 'lid' && body) ctx.drawImage(body, W / 2 - bw / 2 + shake, g.baseY - bh, bw, bh);
      const topShift = g.bh - bh;
      // lid
      const closeT = opening ? clamp((ot - (T_POP + 1.0 + cur.hold + 0.4)) / 0.6) : 1;
      if (!opening || ot < T_POP) {
        const lift = opening ? -6 * clamp((ot - 0.45) / (T_POP - 0.45)) * Math.abs(Math.sin(ot * 60)) : idleBob * 0.4;
        drawImg(lid, W / 2 + shake, g.lidCy + lift + topShift, g.lw, g.lh);
      } else if (closeT <= 0) {
        if (part === 'body') return { shake };
        const u = ot - T_POP;
        // lid pops up, then swings off to the upper right and leaves the canvas
        const up = g.lidCy - 220 * eo(clamp(u / 0.35));
        const k = eo(clamp((u - 0.25) / 0.6));
        const x = W / 2 + 40 * eo(clamp(u / 0.35)) + 700 * k, y = up - 420 * k;
        if (u < 1.0) drawImg(lid, x, y + topShift, g.lw * (1 - 0.3 * k), g.lh * (1 - 0.3 * k), -0.28 * eo(clamp(u / 0.35)) + 0.9 * k);
      } else {
        // lid drops back on
        const y = g.lidCy - 700 * (1 - eo(closeT));
        drawImg(lid, W / 2, y, g.lw, g.lh, 0);
      }
      // seal
      const sw = g.bw * bx.sealWidth, sh = seal ? seal.height * sw / seal.width : 30;
      if (!opening || ot < T_POP) {
        const k = opening ? clamp((ot - 0.4) / (T_POP - 0.4)) : 0;
        const swell = 1 + 0.28 * k * k + 0.04 * Math.sin(ot * 50) * k;
        drawImg(seal, W / 2 + shake, g.seamY + bx.sealDy * g.k + topShift, sw * (1 + 0.02 * k), sh * swell);
      } else if (closeT > 0.7) {
        const k = clamp((closeT - 0.7) / 0.3);
        drawImg(seal, W / 2, g.seamY + bx.sealDy * g.k, sw * spring(k), sh * spring(k));
      }
      return { shake };
    }

    function drawBurst(u, g) {
      const bx = theme.box, piece = imgs[bx.piece]; const G = 1500, seamY = g.seamY;
      const sw = g.bw * bx.sealWidth;
      const pw = sw / bx.pieces * 1.1, ph = piece ? piece.height * pw / piece.width : pw;
      for (const p of cur.puffs) {
        const k = clamp(u / 0.22); const z = (0.35 + (p.s1 - 0.35) * eo(k)) * (1 - eo(clamp((u - 0.22) / 0.3)));
        const im = imgs[p.im]; if (z > 0.04 && im) { const w = sw * 0.32 * z, h = im.height * w / im.width; drawImg(im, W / 2 + p.dx, seamY + p.dy - 50 * eo(clamp(u / 0.5)), w, h, p.rot + u); }
      }
      const P3 = cur.P;
      for (const d of cur.drops) {
        const gd = P3 ? d.g : G, myth = P3 && P3.curl;
        const x = d.x0 + d.vx * u + (myth ? Math.sin(u * 3 + d.ph) * 22 * u : 0), y = seamY + d.vy * u + 0.5 * gd * u * u;
        const z = P3 ? 1 - clamp((u - P3.fade * 0.55) / (P3.fade * 0.5)) : 1 - clamp((u - 0.4) / 0.35);
        const im = imgs[d.im]; if (z > 0.1 && im) drawImg(im, x, y, d.s * z, d.s * z * im.height / im.width, d.vr * u);
      }
      for (const s of cur.shells) {
        const Gs = P3 ? P3.G : G;
        const x = s.x0 + s.vx * u + (P3 && P3.curl ? Math.sin(u * 4 + s.ph) * 40 * u : 0), y = seamY + s.vy * u + 0.5 * Gs * u * u;
        const vy = s.vy + Gs * u, spd = Math.hypot(s.vx, vy) / 700;
        let sx, sy; if (u < 0.06) { sx = 1.35; sy = 0.68; } else { const st = 1 + 0.25 * clamp(spd - 0.3); sx = 1 / st; sy = st; }
        const z = P3 ? 1 - eo(clamp((u - P3.fade * 0.7) / (P3.fade * 0.45))) * 1 : 1 - eo(clamp((u - 0.7) / 0.35));
        if (z > 0.08 && piece) { ctx.save(); ctx.translate(x, y); ctx.rotate(s.vr * u); if (s.flip) ctx.scale(-1, 1); ctx.drawImage(piece, -pw * sx * s.s * z / 2, -ph * sy * s.s * z / 2, pw * sx * s.s * z, ph * sy * s.s * z); ctx.restore(); }
      }
      if (u < 0.55 && cfg.fx !== 'v3' && cfg.fx !== 'v4') { // POP badge
        const k = spring(clamp(u / 0.35)); const a = 1 - clamp((u - 0.4) / 0.15);
        ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2 + 190, seamY - 150); ctx.rotate(-0.14); ctx.scale(Math.max(0.05, k), Math.max(0.05, k));
        ctx.beginPath(); for (let q = 0; q < 16; q++) { const ang = q * Math.PI / 8, r1 = q % 2 ? 76 : 120, r2 = q % 2 ? 46 : 72; ctx.lineTo(Math.cos(ang) * r1, Math.sin(ang) * r2); } ctx.closePath();
        ctx.fillStyle = '#fff8ea'; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = '#5a2e1a'; ctx.stroke();
        ctx.font = font(68); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 8; ctx.strokeStyle = '#5a2e1a'; ctx.strokeText(theme.box.popWord || 'POP!', 0, 2); ctx.fillStyle = '#cd303c'; ctx.fillText(theme.box.popWord || 'POP!', 0, 2);
        ctx.restore();
      }
    }

    function drawReveal(u, g) {
      // u = time since pop
      const r0 = cur.entry.res, rar = cfg.previewRarity || r0.item.rarity;           // previewRarity = visual preview only
      const it = rar === r0.item.rarity ? r0.item : Object.assign({}, r0.item, { rarity: rar });
      const r = it === r0.item ? r0 : Object.assign({}, r0, { item: it }), col = RCOL[it.rarity];
      const hold = cur.hold, out = clamp((u - 1.0 - hold) / 0.4);
      if (out >= 1) return;
      const rise = eo(clamp((u - 0.12) / (cur.P ? cur.P.rise : 0.55)));
      const cy = g.seamY - 40 - (g.seamY - 470) * rise;
      const sz = 380 * (0.3 + 0.7 * spring(clamp((u - 0.12) / (cur.P ? cur.P.grow : 0.7)))) * (1 - out);
      if (cfg.fx === 'v3' || cfg.fx === 'v4') drawFX3(u, it, rar, cy, sz, out);
      else if (cfg.fx === 'v2') drawFX(u, it, rar, cy, sz, out);
      else if (cfg.light) drawLight(u, it, cy, sz, out);
      else {
      ctx.save(); ctx.translate(W / 2, cy); ctx.rotate(clock * 0.4);
      const ra = clamp((u - 0.3) / 0.4) * (1 - out) * (it.rarity === 'common' ? 0.35 : 0.6);
      ctx.globalAlpha = ra; ctx.fillStyle = col;
      for (let i = 0; i < 14; i++) { ctx.rotate(Math.PI / 7); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-30, -360); ctx.lineTo(30, -360); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      const gl = ctx.createRadialGradient(W / 2, cy, 10, W / 2, cy, 260); gl.addColorStop(0, 'rgba(255,248,230,' + (0.55 * (1 - out)) + ')'); gl.addColorStop(1, 'rgba(255,248,230,0)');
      ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
      }
      itemArt(r0.item, W / 2, cy, sz, cur.entry.res.shiny, false);
      if (r.shiny) { for (let i = 0; i < 10; i++) { const a = clock * 1.5 + i * 0.63, rr2 = 150 + 30 * Math.sin(clock * 3 + i); star(W / 2 + Math.cos(a) * rr2, cy + Math.sin(a) * rr2 * 0.8, 10 + 6 * Math.sin(clock * 6 + i), (1 - out)); } }
      // card
      const ca = clamp((u - 0.55) / 0.25) * (1 - out);
      if (ca > 0) drawCard(ca, r, cur.entry);
    }

    // ================= reveal light (art direction B approved; A / C kept for reference) =================
    const RM = () => cfg.reduceMotion !== undefined ? !!cfg.reduceMotion : !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const LVL = { common: 0.55, rare: 0.7, epic: 0.82, legendary: 0.92, mythic: 1 };
    const NSHAFT = { common: 6, rare: 7, epic: 8, legendary: 9, mythic: 10 };
    const NSPARK = { common: 3, rare: 4, epic: 5, legendary: 6, mythic: 8 };
    const anchors = {};
    function mix(h1, h2, t) { const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16); const c = (sh) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t); return [c(16), c(8), c(0)]; }
    const rgba = (c, a) => 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
    // light is born behind the main body: deepest region of the silhouette (distance transform)
    function anchorOf(item) {
      if (anchors[item.id]) return anchors[item.id];
      const im = imgs[item.img]; const N = 72;
      const res = { ax: 0.5, ay: 0.5, br: 0.25 };
      if (im) {
        const c = document.createElement('canvas'); c.width = N; c.height = N; const x = c.getContext('2d');
        const sc = N / Math.max(im.width, im.height), w = im.width * sc, h = im.height * sc;
        x.drawImage(im, (N - w) / 2, (N - h) / 2, w, h);
        const d = x.getImageData(0, 0, N, N).data, D = new Float32Array(N * N);
        for (let i = 0; i < N * N; i++) D[i] = d[i * 4 + 3] > 120 ? 1e9 : 0;
        for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) { const i = y * N + xx; if (!D[i]) continue; let v = D[i]; if (xx) v = Math.min(v, D[i - 1] + 1); if (y) v = Math.min(v, D[i - N] + 1); if (xx && y) v = Math.min(v, D[i - N - 1] + 1.414); if (y && xx < N - 1) v = Math.min(v, D[i - N + 1] + 1.414); D[i] = v; }
        for (let y = N - 1; y >= 0; y--) for (let xx = N - 1; xx >= 0; xx--) { const i = y * N + xx; if (!D[i]) continue; let v = D[i]; if (xx < N - 1) v = Math.min(v, D[i + 1] + 1); if (y < N - 1) v = Math.min(v, D[i + N] + 1); if (xx < N - 1 && y < N - 1) v = Math.min(v, D[i + N + 1] + 1.414); if (y < N - 1 && xx) v = Math.min(v, D[i + N - 1] + 1.414); D[i] = v; }
        let mx = 0; for (let i = 0; i < N * N; i++) if (D[i] > mx) mx = D[i];
        let sx = 0, sy = 0, sw = 0;
        for (let i = 0; i < N * N; i++) if (D[i] >= mx * 0.6) { const wt = D[i]; sx += (i % N) * wt; sy += Math.floor(i / N) * wt; sw += wt; }
        if (sw) { const cx = sx / sw, cy = sy / sw; res.ax = (cx - (N - w) / 2) / w; res.ay = (cy - (N - h) / 2) / h; res.br = mx / N; }
        res.asp = Math.max(0.8, Math.min(1.25, Math.sqrt(im.width / im.height)));
      }
      return (anchors[item.id] = res);
    }
    function hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
    function rng(seed) { let a = seed || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
    let lightCache = null;
    function lightSetup(it) {
      if (lightCache && lightCache.id === it.id + cfg.light) return lightCache;
      const R = rng(hash(it.id) + 7), n = NSHAFT[it.rarity] || 7, m = NSPARK[it.rarity] || 4;
      const shafts = [], step = Math.PI * 2 / n, off = R() * 6.28;
      for (let i = 0; i < n; i++) shafts.push({ a: off + i * step + (R() - 0.5) * step * 0.5, w: 0.045 + R() * 0.085, l: 1.35 + R() * 0.85, f: 0.35 + R() * 0.55, ph: R() * 6.28, f2: 0.25 + R() * 0.4, ph2: R() * 6.28 });
      const sparks = [];
      for (let i = 0; i < m; i++) sparks.push({ a: R() * 6.28, r: 0.95 + R() * 0.6, s: 3 + R() * 3.5, per: 1.6 + R() * 1.6, ph: R() * 6.28, dr: (R() - 0.5) * 0.08 });
      return (lightCache = { id: it.id + cfg.light, shafts, sparks, rot: (R() < 0.5 ? -1 : 1) * (0.045 + R() * 0.03) });
    }
    function drawLight(u, it, cy, sz, out) {
      const mode = cfg.light, im = imgs[it.img]; if (!im) return;
      const A = anchorOf(it), L = lightSetup(it), rm = RM();
      const sc = sz / Math.max(im.width, im.height);
      const X = W / 2 + (A.ax - 0.5) * im.width * sc, Y = cy + (A.ay - 0.5) * im.height * sc;
      const k = sz / 380;                                   // follows the prize while it pops in
      const env = (mode === 'C' ? clamp((u - 0.06) / 0.1) : clamp((u - 0.18) / 0.45)) * (1 - out);     // fade in / out with the reveal (C: fast, for the impulse)
      if (env <= 0) return;
      const lvl = LVL[it.rarity] || 0.7, R0 = 200 * k, asp = A.asp || 1;
      const inner = Math.max(26, A.br * Math.max(im.width, im.height) * sc * 0.55);
      const ivory = [255, 246, 226], warm = mix(RCOL[it.rarity], '#ffcf8a', 0.55), tint = mix(RCOL[it.rarity], '#fff1d6', 0.35);
      const tv = u - 0.18;                                  // reveal-local time (same for every prize)
      // C: one short impulse then settle below B
      let boost = 1, settle = 1;
      if (mode === 'C') { const p = u - 0.12; const bump = p < 0 ? 0 : p < 0.09 ? p / 0.09 : Math.exp(-(p - 0.09) * 5.5); boost = 1 + 0.55 * bump; settle = 0.85 + 0.15 * clamp(1 - p / 0.6); }
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      // ---- halo (all options): warm radial with gradual falloff, ellipse adapts to wide / narrow prizes (constant area)
      const hb = rm ? 1 : 1 + 0.025 * Math.sin(tv * 2.6);
      const haloA = (mode === 'A' ? 1.15 : 0.72) * lvl * env * boost * settle;
      ctx.save(); ctx.translate(X, Y); ctx.scale(asp, 1 / asp);
      let g = ctx.createRadialGradient(0, 0, 0, 0, 0, R0 * 1.75 * hb);
      g.addColorStop(0, rgba(ivory, haloA * 0.75)); g.addColorStop(0.22, rgba(warm, haloA * 0.5)); g.addColorStop(0.5, rgba(warm, haloA * 0.2)); g.addColorStop(0.78, rgba(tint, haloA * 0.06)); g.addColorStop(1, rgba(tint, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R0 * 1.75 * hb, 0, 6.2832); ctx.fill();
      ctx.restore();
      // ---- ivory core behind the prize (A strongest)
      const coreA = (mode === 'A' ? 0.68 : 0.48) * env * Math.min(1.25, boost) * (0.7 + 0.3 * lvl);
      g = ctx.createRadialGradient(X, Y, 0, X, Y, inner * 2.1);
      g.addColorStop(0, rgba(ivory, coreA)); g.addColorStop(0.6, rgba(ivory, coreA * 0.35)); g.addColorStop(1, rgba(ivory, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, inner * 2.1, 0, 6.2832); ctx.fill();
      // ---- shafts (B, C): feathered, fading to the tip, different widths/lengths, slow partial rotation
      if (mode === 'B' || mode === 'C') {
        const grow = 0.6 + 0.4 * eo(clamp(tv / 0.6)), rot = rm ? 0 : L.rot * Math.max(0, tv);
        for (const sh of L.shafts) {
          const a = sh.a + rot, ca = Math.cos(a), sa = Math.sin(a);
          const er = 1 / Math.sqrt((ca / asp) * (ca / asp) + (sa * asp) * (sa * asp));      // ellipse radius in this direction
          const len = R0 * sh.l * er * grow * (rm ? 1 : 0.95 + 0.05 * Math.sin(tv * sh.f2 * 6.28 + sh.ph2)) * (0.85 + 0.15 * lvl);
          const al = 0.52 * lvl * env * settle * Math.min(1.3, boost) * (rm ? 0.9 : 0.8 + 0.2 * Math.sin(tv * sh.f * 6.28 + sh.ph));
          for (const [wf, af] of [[1, 0.28], [0.62, 0.36], [0.3, 0.5]]) {          // 3 passes = soft edges, defined core
            const lg = ctx.createRadialGradient(X, Y, inner * 0.6, X, Y, len);
            lg.addColorStop(0, rgba(ivory, al * af)); lg.addColorStop(0.35, rgba(warm, al * af * 0.7)); lg.addColorStop(0.75, rgba(tint, al * af * 0.22)); lg.addColorStop(1, rgba(tint, 0));
            ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(X + Math.cos(a) * inner * 0.6, Y + Math.sin(a) * inner * 0.6);
            ctx.arc(X, Y, len, a - sh.w * wf, a + sh.w * wf); ctx.closePath(); ctx.fill();
          }
        }
      }
      // ---- C: single thin expanding ring right after the pop
      if (mode === 'C' && !rm) {
        const p = (u - 0.14) / 0.75;
        if (p > 0 && p < 1) {
          const rr0 = inner + (R0 * 2.5 - inner) * eo(p);
          ctx.save(); ctx.translate(X, Y); ctx.scale(asp, 1 / asp);
          ctx.strokeStyle = rgba(mix(RCOL[it.rarity], '#fff4dc', 0.6), 0.5 * Math.pow(1 - p, 1.6) * env);
          ctx.lineWidth = 3.2 * (1 - p) + 0.8; ctx.beginPath(); ctx.arc(0, 0, rr0, 0, 6.2832); ctx.stroke(); ctx.restore();
        }
      }
      // ---- a few sugar sparkles, each twinkling on its own clock
      const ns = mode === 'A' ? Math.max(3, L.sparks.length - 1) : Math.max(2, Math.round(L.sparks.length * 0.7));
      for (let i = 0; i < ns; i++) {
        const p = L.sparks[i];
        const a = p.a + (rm ? 0 : p.dr * tv), r = R0 * p.r * (0.85 + 0.15 * eo(clamp(tv / 0.8)));
        const x = X + Math.cos(a) * r * asp, y = Y + Math.sin(a) * r / asp - (rm ? 0 : 6 * Math.sin(tv * 0.5 + p.ph));
        const tw = rm ? 0.6 : Math.pow(0.5 + 0.5 * Math.sin(tv * 6.28 / p.per + p.ph), 2);
        const sa2 = 0.85 * env * tw * (0.6 + 0.4 * lvl), s = p.s * (0.7 + 0.3 * lvl);
        const sg = ctx.createRadialGradient(x, y, 0, x, y, s * 2.2); sg.addColorStop(0, rgba(ivory, sa2)); sg.addColorStop(1, rgba(ivory, 0));
        ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x, y, s * 2.2, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = rgba(ivory, sa2 * 0.7); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - s * 2.6, y); ctx.lineTo(x + s * 2.6, y); ctx.moveTo(x, y - s * 2.6); ctx.lineTo(x, y + s * 2.6); ctx.stroke();
      }
      ctx.restore();
    }
    // =============================================================================

    // ================= REVIEW v2 · "Confitería encantada de colección" =================
    // All effects are temporary: their state lives in cur.fx and disappears with the reveal.
    const IVORY = [255, 246, 226], CARAMEL = [255, 205, 140], PEARL = [244, 238, 255];
    const FXR = { common: 0.8, rare: 1.0, epic: 1.08, legendary: 1.2, mythic: 1.05 };   // halo reach per rarity
    const softTint = rar => mix(RCOL[rar], '#fff1d6', 0.6);
    function fxSetup(item, rar) {
      if (cur.fx && cur.fx.key === item.id + rar) return cur.fx;
      const R = rng(hash(item.id + '|' + rar) + 11);
      // accents: irregular but balanced around the silhouette (golden angle + jitter), each with entry/peak/exit
      const acc = [], n = 6, ga = 2.39996;
      const times = [0.42, 0.78, 1.35, 2.05, 2.9, 3.7, 4.6];
      for (let i = 0; i < n; i++) {
        let a = -1.2 + i * ga + (R() - 0.5) * 0.6;
        a = ((a % 6.2832) + 6.2832) % 6.2832;
        if (a > 4.25 && a < 5.15) a += 0.95;                    // keep away from the face-above-card zone
        acc.push({ a, f: 1.1 + R() * 0.28, t0: times[i] + (R() - 0.5) * 0.25, dur: 0.75 + R() * 0.45, s: 4.5 + R() * 3.5 });
      }
      const shafts = [];
      const nS = rar === 'legendary' ? 9 : 6;
      for (let i = 0; i < nS; i++) {
        if (rar === 'epic') {               // contained crown: upper arc only
          const a = -2.55 + (i + 0.5) * (1.9 / nS) + (R() - 0.5) * 0.12;
          shafts.push({ a, w: 0.05 + R() * 0.045, l: 1.2 + R() * 0.45, ph: R() * 6.28, f: 0.25 + R() * 0.3 });
        } else {
          const step = 6.2832 / nS, a = R() * 0.5 + i * step + (R() - 0.5) * step * 0.45;
          shafts.push({ a, w: 0.06 + R() * 0.07, l: 1.45 + R() * 0.75, ph: R() * 6.28, f: 0.25 + R() * 0.35 });
        }
      }
      return (cur.fx = { key: item.id + rar, acc, shafts, rot: (R() < 0.5 ? -1 : 1) * 0.035 });
    }
    function accent(x, y, s, a, rm) {          // sugar glint: soft core + thin tapered cross
      if (a <= 0.01) return;
      const g = ctx.createRadialGradient(x, y, 0, x, y, s * 2.4);
      g.addColorStop(0, rgba(IVORY, a)); g.addColorStop(0.4, rgba(CARAMEL, a * 0.35)); g.addColorStop(1, rgba(CARAMEL, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s * 2.4, 0, 6.2832); ctx.fill();
      ctx.fillStyle = rgba(IVORY, a * 0.85);
      const L = s * 3.2, t = Math.max(0.8, s * 0.22);
      ctx.beginPath(); ctx.moveTo(x - L, y); ctx.quadraticCurveTo(x, y - t, x + L, y); ctx.quadraticCurveTo(x, y + t, x - L, y); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, y - L); ctx.quadraticCurveTo(x + t, y, x, y + L); ctx.quadraticCurveTo(x - t, y, x, y - L); ctx.fill();
    }
    const envP = (u, t0, dur) => { const p = (u - t0) / dur; if (p <= 0 || p >= 1) return 0; return p < 0.3 ? eo(p / 0.3) : Math.pow(1 - (p - 0.3) / 0.7, 1.6); };

    function drawFX(u, it, rar, cy, sz, out) {
      const im = imgs[it.img]; if (!im) return;
      const F = fxSetup(it, rar), A = anchorOf(it), rm = RM();
      const sc = sz / Math.max(im.width, im.height), hw = im.width * sc / 2, hh = im.height * sc / 2;
      const X = W / 2 + (A.ax - 0.5) * im.width * sc, Y = cy + (A.ay - 0.5) * im.height * sc;
      const k = sz / 380, asp = A.asp || 1;
      const Rb = 0.5 * Math.sqrt(im.width * im.height) * (380 / Math.max(im.width, im.height)) * k;   // area-equivalent radius: wide = narrow
      const env = clamp((u - 0.1) / 0.35) * (1 - out);
      if (env <= 0) return;
      const tint = rar === 'mythic' ? PEARL : softTint(rar);
      ctx.save(); ctx.globalCompositeOperation = 'screen';

      // ---------- halo (shared family, size/shape per rarity)
      let haloMul = 1;
      if (rar === 'legendary') {               // single warm burst, then calm contemplation
        const p = u - 0.02; const burst = p < 0 ? 0 : p < 0.09 ? p / 0.09 : Math.exp(-(p - 0.09) * 4.2);
        haloMul = (rm ? 1 : 1 + 0.6 * burst) * (0.7 + 0.3 * clamp(1 - (u - 1.0) / 1.2));
        if (!rm && burst > 0.02) {
          const br = Rb * (1.2 + 1.9 * eo(clamp(p / 0.5)));
          const g = ctx.createRadialGradient(X, Y, 0, X, Y, br);
          g.addColorStop(0, rgba(CARAMEL, 0.32 * burst)); g.addColorStop(0.5, rgba(softTint(rar), 0.16 * burst)); g.addColorStop(1, rgba(CARAMEL, 0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, br, 0, 6.2832); ctx.fill();
        }
      }
      const Rh = Rb * (FXR[rar] || 1) * (rar === 'common' ? 1 : 1.25);
      const breath = rm ? 1 : 1 + 0.02 * Math.sin(u * 1.9);
      ctx.save(); ctx.translate(X, Y); ctx.scale(asp, 1 / asp);
      let g = ctx.createRadialGradient(0, 0, 0, 0, 0, Rh * 1.6 * breath);
      const ha = (rar === 'common' ? 0.5 : 0.55) * env * haloMul;
      g.addColorStop(0, rgba(IVORY, ha * 0.8)); g.addColorStop(rar === 'common' ? 0.35 : 0.28, rgba(CARAMEL, ha * 0.42));
      g.addColorStop(0.6, rgba(tint, ha * (rar === 'common' ? 0.08 : 0.16))); g.addColorStop(1, rgba(tint, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, Rh * 1.6 * breath, 0, 6.2832); ctx.fill(); ctx.restore();

      // ---------- RARE · two short glint arcs travel up the sides and dissolve
      if (rar === 'rare') {
        const ex = hw * 1.12 + 18, ey = hh * 1.06 + 18, cx = W / 2;
        for (const side of [1, -1]) {
          const a0 = side > 0 ? 1.05 : Math.PI - 1.05, a1 = side > 0 ? -0.62 : Math.PI + 0.62;
          const p = rm ? 1 : clamp((u - 0.42) / 0.85), head = eo(p);
          const fade = rm ? clamp((u - 0.4) / 0.5) * (1 - clamp((u - 2.2) / 0.8)) : (p < 1 ? 1 : Math.max(0, 1 - (u - 1.27) / 0.45));
          if (fade <= 0) continue;
          const N = 22, span = rm ? 1 : 0.5;
          for (let i = 0; i < N; i++) {
            const q = head - (i / N) * span; if (q < 0) break;
            const a = a0 + (a1 - a0) * q;
            const al = (rm ? 0.5 : (1 - i / N)) * 0.85 * fade * env;
            const s = (rm ? 2.8 : 4.6 * (1 - i / N) + 1.1);
            const x = cx + Math.cos(a) * ex, y = cy + Math.sin(a) * ey;
            const gg = ctx.createRadialGradient(x, y, 0, x, y, s * 2.2); gg.addColorStop(0, rgba(IVORY, al)); gg.addColorStop(1, rgba(CARAMEL, 0));
            ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, s * 2.2, 0, 6.2832); ctx.fill();
          }
          if (!rm) { const a = a0 + (a1 - a0) * head; accent(cx + Math.cos(a) * ex, cy + Math.sin(a) * ey, 5.5, 0.9 * fade * env, rm); }
        }
      }

      // RARE contemplation: the arcs leave a fine sugar dust that drifts down both sides (shape + motion, not brightness)
      if (rar === 'rare') {
        const ex = hw * 1.12 + 18, ey = hh * 1.06 + 18, cx = W / 2, on = clamp((u - 1.0) / 0.5);
        if (on > 0) for (const side of [1, -1]) for (let i = 0; i < 9; i++) {
          const ph = (i * 0.37 + (side > 0 ? 0 : 0.19)) % 1, sp = 0.16 + (i % 3) * 0.04;
          const q = rm ? ph : ((u - 1.0) * sp + ph) % 1;                      // 0 = shoulder, 1 = hip
          const a = side > 0 ? -0.5 + q * 1.35 : Math.PI + 0.5 - q * 1.35;
          const x = cx + Math.cos(a) * ex * (1.02 + 0.05 * Math.sin(i * 3.1)), y = cy + Math.sin(a) * ey;
          const al = on * env * 0.55 * Math.sin(q * Math.PI) * (rm ? 0.8 : 1), r2 = 1.6 + (i % 3) * 0.7;
          const gg = ctx.createRadialGradient(x, y, 0, x, y, r2 * 2.4); gg.addColorStop(0, rgba(IVORY, al)); gg.addColorStop(1, rgba(CARAMEL, 0));
          ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, r2 * 2.4, 0, 6.2832); ctx.fill();
        }
      }

      // ---------- EPIC · one thin ring behind the prize, then a contained crown
      if (rar === 'epic') {
        const p = (u - 0.12) / 0.8;
        ctx.save(); ctx.translate(X, Y); ctx.scale(asp, 1 / asp);
        if (rm) { const ra = 0.32 * clamp((u - 0.15) / 0.5) * (1 - clamp((u - 1.4) / 0.6)) * env; ctx.strokeStyle = rgba(IVORY, ra); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, 0, Rb * 1.9, 0, 6.2832); ctx.stroke(); }
        else if (p > 0 && p < 1) { ctx.strokeStyle = rgba(mix(RCOL.epic, '#fff4dc', 0.7), 0.6 * Math.pow(1 - p, 1.4) * env); ctx.lineWidth = 3 * (1 - p) + 0.7; ctx.beginPath(); ctx.arc(0, 0, Rb * (0.75 + 1.65 * eo(p)), 0, 6.2832); ctx.stroke(); }
        ctx.restore();
      }

      // ---------- EPIC crown / LEGENDARY wide shafts (feathered, fading to the tip)
      if (rar === 'epic' || rar === 'legendary') {
        const leg = rar === 'legendary';
        const appear = leg ? eo(clamp((u - 0.04) / 0.6)) : eo(clamp((u - 0.55) / 0.5));
        const calm = leg ? 0.62 + 0.38 * clamp(1 - (u - 0.9) / 1.0) : 1;
        const rot = rm || !leg ? 0 : F.rot * Math.max(0, u - 0.2);
        const inner = Math.max(24, A.br * Math.max(im.width, im.height) * sc * 0.5);
        for (const sh of F.shafts) {
          const sway = rm ? 0 : (leg ? 0 : 0.03 * Math.sin(u * sh.f * 6.28 + sh.ph));
          const a = sh.a + rot + sway, ca = Math.cos(a), sa = Math.sin(a);
          const er = 1 / Math.sqrt((ca / asp) * (ca / asp) + (sa * asp) * (sa * asp));
          // legendary shafts unfold from the top outward; epic grow gently
          const unfold = leg && !rm ? clamp((appear * 1.4) - Math.abs(Math.sin((a + 1.5708) / 2)) * 0.4) : appear;
          const len = Rb * sh.l * er * (leg ? 1.35 : 1.15) * (0.55 + 0.45 * unfold);
          const al = (leg ? 0.42 : 0.44) * env * unfold * calm * (rm ? 0.9 : 0.85 + 0.15 * Math.sin(u * sh.f * 6.28 + sh.ph));
          if (al <= 0.005) continue;
          for (const [wf, af] of [[1, 0.28], [0.6, 0.38], [0.28, 0.55]]) {
            const lg = ctx.createRadialGradient(X, Y, inner * 0.6, X, Y, len);
            lg.addColorStop(0, rgba(IVORY, al * af)); lg.addColorStop(0.35, rgba(CARAMEL, al * af * 0.62)); lg.addColorStop(0.78, rgba(tint, al * af * 0.18)); lg.addColorStop(1, rgba(tint, 0));
            ctx.fillStyle = lg; ctx.beginPath(); ctx.moveTo(X + ca * inner * 0.6, Y + sa * inner * 0.6);
            ctx.arc(X, Y, len, a - sh.w * wf, a + sh.w * wf); ctx.closePath(); ctx.fill();
          }
        }
      }

      // ---------- MYTHIC · opalescent ribbon born inside the box, rises and frames the prize (open arch), one culminating glint
      if (rar === 'mythic') {
        const ex = hw * 1.14 + 26, ey = hh * 1.08 + 26, cx = W / 2;
        const g0 = boxGeo(), sx = W / 2 + 18, sy = g0.topY + 14;
        const a0 = 1.0, a1 = a0 - 6.2832 * 0.8;                       // up the right, over the top, down the left: an open frame
        const rad = a => 1 + 0.055 * Math.sin(3 * a + 0.7) + 0.035 * Math.sin(5 * a + 2.1);   // organic, never a perfect ellipse
        const pt = s => {
          if (s < 0.18) { const q = s / 0.18, x1 = cx + Math.cos(a0) * ex * rad(a0), y1 = cy + Math.sin(a0) * ey * rad(a0);
            return [(1 - q) * (1 - q) * sx + 2 * (1 - q) * q * (sx + 70) + q * q * x1, (1 - q) * (1 - q) * sy + 2 * (1 - q) * q * (sy - 10) + q * q * y1]; }
          const q = (s - 0.18) / 0.82, an = a0 + (a1 - a0) * q; return [cx + Math.cos(an) * ex * rad(an), cy + Math.sin(an) * ey * rad(an)];
        };
        const head = rm ? 1 : eo(clamp((u - 0.02) / 1.15));
        const vis = rm ? clamp((u - 0.1) / 0.7) : 1;
        const N = 140, P = [];
        for (let i = 0; i <= N; i++) { const s0 = (i / N) * head; P.push([s0, pt(s0)]); }
        // band: width swells along the length and pinches where the ribbon twists; face shade follows the twist
        for (let i = 1; i < P.length; i++) {
          const [s0, [x, y]] = P[i], [, [px, py]] = P[i - 1];
          const nx = -(y - py), ny = x - px, nl = Math.hypot(nx, ny) || 1;
          const tw = Math.cos(s0 * 15 + (rm ? 0 : u * 0.8)), face = Math.abs(tw);
          const wdt = (5 + 11 * Math.sin(Math.PI * Math.min(1, s0 / 0.95))) * (0.25 + 0.75 * face);
          const [, [qx, qy]] = P[i - 1]; const pnx = nx / nl, pny = ny / nl;
          const hue = 285 + 75 * Math.sin(s0 * 7 + (rm ? 0 : u * 0.7));          // lilac → mint → peach pearl
          const tail = clamp((s0 - 0.02) / 0.12);
          const shimmer = rm ? 0.7 : 0.6 + 0.4 * Math.pow(0.5 + 0.5 * Math.sin(s0 * 18 - u * 2.6), 4);
          const al = vis * env * tail * (0.26 + 0.34 * face) * shimmer;
          ctx.fillStyle = `hsla(${hue},${tw > 0 ? 55 : 40}%,${tw > 0 ? 88 : 80}%,${al})`;
          ctx.beginPath(); ctx.moveTo(px + pnx * wdt, py + pny * wdt); ctx.lineTo(x + pnx * wdt, y + pny * wdt); ctx.lineTo(x - pnx * wdt, y - pny * wdt); ctx.lineTo(px - pnx * wdt, py - pny * wdt); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = `hsla(${hue},60%,92%,${al * 1.4})`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(px + pnx * wdt, py + pny * wdt); ctx.lineTo(x + pnx * wdt, y + pny * wdt); ctx.moveTo(px - pnx * wdt, py - pny * wdt); ctx.lineTo(x - pnx * wdt, y - pny * wdt); ctx.stroke();
        }
        // soft pearl glow under the ribbon
        const pg = ctx.createRadialGradient(cx, cy, Rb * 0.6, cx, cy, Rb * 2.1);
        pg.addColorStop(0, rgba(PEARL, 0)); pg.addColorStop(0.7, rgba(PEARL, 0.1 * vis * env * head)); pg.addColorStop(1, rgba(PEARL, 0));
        ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(cx, cy, Rb * 2.1, 0, 6.2832); ctx.fill();
        // single culminating glint where the ribbon ends
        const [fx, fy] = pt(1);
        const fp = rm ? clamp((u - 1.0) / 0.6) * 0.55 * (1 - clamp((u - 2.2) / 0.8)) : envP(u, 1.12, 0.75);
        if (fp > 0) { accent(fx, fy, 9.5, fp * env, rm); const gg = ctx.createRadialGradient(fx, fy, 0, fx, fy, 64); gg.addColorStop(0, rgba(PEARL, 0.32 * fp)); gg.addColorStop(1, rgba(PEARL, 0)); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(fx, fy, 64, 0, 6.2832); ctx.fill(); }
      }

      // ---------- accents (all rarities): enter, peak, vanish — irregular, never all at once
      {
        const ex = hw * 1.1 + 16, ey = hh * 1.05 + 16;
        for (const p of F.acc) {
          const e = rm ? clamp((u - p.t0) / 0.5) * (1 - clamp((u - p.t0 - 1.2) / 0.5)) * 0.7 : envP(u, p.t0, p.dur);
          if (e <= 0) continue;
          const x = W / 2 + Math.cos(p.a) * ex * p.f, y = cy + Math.sin(p.a) * ey * p.f - (rm ? 0 : 8 * ((u - p.t0) / p.dur));
          accent(x, y, p.s * (rar === 'common' ? 0.85 : 1), e * env * 0.9, rm);
        }
      }
      ctx.restore();
    }

    // box interior light + rim reflection (overlay only, the asset is never repainted)
    function drawBoxFX(u, g, rar) {
      const rm = RM(); const k = g.k;
      const top = g.topY + 6 * k, seam = g.seamY, cx = W / 2;
      const lvl = { common: 0.5, rare: 0.62, epic: 0.74, legendary: 0.86, mythic: 0.8 }[rar] || 0.6;
      const tint = rar === 'mythic' ? PEARL : CARAMEL;
      const a = lvl * clamp(u / 0.2) * (1 - clamp((u - 1.6) / 1.4) * 0.65) * (cur ? 1 - clamp((u - 1.0 - cur.hold) / 0.4) : 1);
      if (a <= 0) return;
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      ctx.beginPath(); ctx.rect(cx - g.bw * 0.43, top, g.bw * 0.86, (seam - top) * 0.95); ctx.clip();
      ctx.save(); ctx.translate(cx, top + (seam - top) * 0.35); ctx.scale(1, 0.32);
      const gg = ctx.createRadialGradient(0, 0, 0, 0, 0, g.bw * 0.45);
      gg.addColorStop(0, rgba(IVORY, 0.55 * a)); gg.addColorStop(0.5, rgba(tint, 0.28 * a)); gg.addColorStop(1, rgba(tint, 0));
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, g.bw * 0.45, 0, 6.2832); ctx.fill(); ctx.restore();
      ctx.restore();
      // brief reflection travelling once along the inner rim
      const p = rm ? 0 : (u - 0.05) / 0.55;
      if (p > 0 && p < 1) {
        const x0 = cx - g.bw * 0.4, x1 = cx + g.bw * 0.4, hx = x0 + (x1 - x0) * eo(p), y = top + 4 * k;
        ctx.save(); ctx.globalCompositeOperation = 'screen';
        const lg = ctx.createLinearGradient(hx - 90, 0, hx + 90, 0);
        lg.addColorStop(0, rgba(IVORY, 0)); lg.addColorStop(0.5, rgba(IVORY, 0.55 * Math.sin(p * Math.PI) * lvl)); lg.addColorStop(1, rgba(IVORY, 0));
        ctx.strokeStyle = lg; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(Math.max(x0, hx - 90), y); ctx.lineTo(Math.min(x1, hx + 90), y); ctx.stroke(); ctx.restore();
      }
    }
    // legendary only: brief anticipation — warm light leaks through the meringue seam before the pop
    function drawAnticipation(t, g, rar) {
      if (rar !== 'legendary') return;
      const rm = RM(); const k = clamp((t - 0.3) / (T_POP - 0.3)); if (k <= 0) return;
      const fl = rm ? 1 : 0.88 + 0.12 * Math.sin(t * 31) * Math.sin(t * 17);
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      ctx.save(); ctx.translate(W / 2, g.seamY - 6); ctx.scale(1, 0.42);
      const gg = ctx.createRadialGradient(0, 0, g.bw * 0.2, 0, 0, g.bw * 0.85);
      gg.addColorStop(0, rgba(CARAMEL, 0.6 * k * fl)); gg.addColorStop(0.55, rgba(CARAMEL, 0.26 * k * fl)); gg.addColorStop(1, rgba(CARAMEL, 0));
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, g.bw * 0.85, 0, 6.2832); ctx.fill(); ctx.restore();
      // thin seam line glowing through the meringue
      const lg = ctx.createLinearGradient(W / 2 - g.bw * 0.55, 0, W / 2 + g.bw * 0.55, 0);
      lg.addColorStop(0, rgba(IVORY, 0)); lg.addColorStop(0.5, rgba(IVORY, 0.75 * k * fl)); lg.addColorStop(1, rgba(IVORY, 0));
      ctx.strokeStyle = lg; ctx.lineWidth = 3 + 3 * k; ctx.beginPath(); ctx.moveTo(W / 2 - g.bw * 0.55, g.seamY + 18); ctx.lineTo(W / 2 + g.bw * 0.55, g.seamY + 18); ctx.stroke();
      if (!rm) for (let i = 0; i < 5; i++) { const ph = (t * 0.9 + i * 0.21) % 1, x = W / 2 + (i - 2) * g.bw * 0.2 + Math.sin(i * 7) * 12, y = g.seamY + 10 - ph * 120; accent(x, y, 3 + i % 2, k * Math.sin(ph * Math.PI) * 0.8, rm); }
      ctx.restore();
    }
    // plaque finish per rarity: discreet border + small emblem (shape, not only colour)
    function drawPlaqueMark(y0, rar, a) {
      const x = 130, y = y0 - 4, w = 740, h = 184, cx = W / 2, ey = y0 - 10;
      ctx.save(); ctx.globalAlpha *= a;
      const col = mix(RCOL[rar], '#fff1d6', 0.45);
      if (rar !== 'common') {
        ctx.lineWidth = rar === 'rare' ? 1.6 : 2.2;
        if (rar === 'mythic') { const lg = ctx.createLinearGradient(x, 0, x + w, 0); ['#f6e9ff', '#dff7ee', '#ffe9da', '#e9e4ff', '#f6e9ff'].forEach((c, i) => lg.addColorStop(i / 4, c)); ctx.strokeStyle = lg; }
        else ctx.strokeStyle = rgba(col, rar === 'rare' ? 0.7 : 0.85);
        rr(x, y, w, h, 24); ctx.stroke();
        if (rar === 'legendary') { ctx.strokeStyle = rgba([240, 196, 110], 0.6); ctx.lineWidth = 1.2; rr(x + 5, y + 5, w - 10, h - 10, 20); ctx.stroke(); }
      }
      // emblem
      ctx.translate(cx, ey); ctx.lineWidth = 3; ctx.strokeStyle = '#5e2a14'; ctx.fillStyle = '#fff8ea';
      const path = () => {
        ctx.beginPath();
        if (rar === 'common') ctx.arc(0, 0, 8, 0, 6.2832);
        else if (rar === 'rare') { ctx.moveTo(0, -12); ctx.lineTo(10, 0); ctx.lineTo(0, 12); ctx.lineTo(-10, 0); ctx.closePath(); }
        else if (rar === 'epic') { ctx.arc(0, 0, 12, 0, 6.2832); ctx.moveTo(5, 0); ctx.arc(0, 0, 5, 0, 6.2832); }
        else if (rar === 'legendary') { for (let i = 0; i < 16; i++) { const r = i % 2 ? 6 : 15, an = i * Math.PI / 8 - Math.PI / 2; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); } ctx.closePath(); }
        else { ctx.moveTo(0, -15); ctx.bezierCurveTo(9, -4, 11, 4, 0, 12); ctx.bezierCurveTo(-11, 4, -9, -4, 0, -15); ctx.closePath(); }
      };
      path(); ctx.stroke();
      if (rar === 'mythic') { const lg = ctx.createLinearGradient(-10, -15, 10, 12); lg.addColorStop(0, '#fbf4ff'); lg.addColorStop(0.5, '#e3f6ee'); lg.addColorStop(1, '#ffe6d8'); ctx.fillStyle = lg; }
      else if (rar === 'legendary') ctx.fillStyle = '#ffe0a0';
      else if (rar === 'epic') ctx.fillStyle = rgba(col, 1);
      path(); ctx.fill('evenodd');
      ctx.restore();
    }
    // =====================================================================================


    // ================= REVIEW v3 · refined "confitería encantada" =================
    // half-resolution soft layer: glow passes are drawn here and composited with a light blur (feathered edges, no flat wedges)
    const SOFT = document.createElement('canvas'); SOFT.width = W / 2; SOFT.height = H / 2; const sctx = SOFT.getContext('2d');
    function softBegin() { sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.clearRect(0, 0, SOFT.width, SOFT.height); sctx.setTransform(0.5, 0, 0, 0.5, 0, 0); return sctx; }
    function softEnd(blur, alpha) { ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = alpha; ctx.filter = 'blur(' + blur + 'px)'; ctx.drawImage(SOFT, 0, 0, W, H); ctx.restore(); }
    function shaft(c, X, Y, a, w, inner, len, al, cA, cB, cC) {
      for (const [wf, af] of [[1, 0.18], [0.72, 0.24], [0.46, 0.32], [0.22, 0.42]]) {
        const lg = c.createRadialGradient(X, Y, inner, X, Y, len);
        lg.addColorStop(0, rgba(cA, al * af)); lg.addColorStop(0.3, rgba(cB, al * af * 0.72)); lg.addColorStop(0.7, rgba(cC, al * af * 0.2)); lg.addColorStop(1, rgba(cC, 0));
        c.fillStyle = lg; c.beginPath(); c.moveTo(X + Math.cos(a) * inner, Y + Math.sin(a) * inner); c.arc(X, Y, len, a - w * wf, a + w * wf); c.closePath(); c.fill();
      }
    }
    function fx3Setup(it, rar) {
      if (cur.fx3 && cur.fx3.key === it.id + rar) return cur.fx3;
      const R = rng(hash(it.id + '#' + rar) + 29);
      const leg = [];
      for (let i = 0; i < 9; i++) { const step = 6.2832 / 9; leg.push({ a: -1.5708 + (i - 4) * step + (R() - 0.5) * step * 0.55, w: 0.035 + R() * 0.095, l: 1.2 + R() * 1.1, d: R() * 0.18, ph: R() * 6.28, f: 0.2 + R() * 0.3 }); }
      const frag = []; for (let i = 0; i < 24; i++) frag.push({ keep: R() > 0.22, s: 0.7 + R() * 0.6, j: (R() - 0.5) * 0.5 });
      return (cur.fx3 = { key: it.id + rar, leg, frag, rot: (R() < 0.5 ? -1 : 1) * 0.03 });
    }
    // RARE trail: small bright head + fragmented tail of glints that lose intensity; asymmetric pair
    function trail(cx, cy, ex, ey, a0, a1, t0, dur, u, F, side, rm, env) {
      const p = rm ? 1 : clamp((u - t0) / dur), head = eo(p);
      const dis = rm ? clamp((u - t0) / 0.5) * (1 - clamp((u - t0 - 1.6) / 0.7)) : (p < 1 ? 1 : Math.max(0, 1 - (u - t0 - dur) / 0.38));
      if (dis <= 0 || (u < t0 && !rm)) return;
      const ah = a0 + (a1 - a0) * head;
      for (let i = 0; i < 11; i++) {
        const fr = F.frag[i + side * 11]; if (!fr.keep) continue;
        const back = (0.035 + i * 0.05 + i * i * 0.004) * Math.sign(a1 - a0);
        const a = ah - back + fr.j * 0.03; if ((a1 - a0) > 0 ? a < a0 : a > a0) continue;
        const k = Math.pow(1 - i / 11, 1.3) * dis, s = (3.1 - i * 0.18) * fr.s;
        const x = cx + Math.cos(a) * ex * (1 + fr.j * 0.04), y = cy + Math.sin(a) * ey * (1 + fr.j * 0.04);
        const g = ctx.createRadialGradient(x, y, 0, x, y, s * 2.3); g.addColorStop(0, rgba(IVORY, 0.8 * k * env)); g.addColorStop(1, rgba(CARAMEL, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, s * 2.3, 0, 6.2832); ctx.fill();
      }
      accent(cx + Math.cos(ah) * ex, cy + Math.sin(ah) * ey, rm ? 4.5 : 6.2, 0.95 * dis * env * (rm ? 0.7 : 1), rm);
    }
    // MYTHIC ribbon geometry (shared by the back pass and the front pass)
    function ribbonPath(u, cx, cy, hw, hh, rm) {
      const g0 = boxGeo(), sx = W / 2 + 14, sy = g0.topY + 30;
      const ex = hw * 1.15 + 30, ey = hh * 1.08 + 26, a0 = Math.PI - 0.95, a1 = a0 + 6.2832 * 0.82;
      const rad = a => 1 + 0.05 * Math.sin(3 * a + 0.7) + 0.03 * Math.sin(5 * a + 2.1);
      const pt = s => {
        if (s < 0.17) { const q = s / 0.17, x1 = cx + Math.cos(a0) * ex * rad(a0), y1 = cy + Math.sin(a0) * ey * rad(a0);
          return [(1 - q) * (1 - q) * sx + 2 * (1 - q) * q * (sx - 120) + q * q * x1, (1 - q) * (1 - q) * sy + 2 * (1 - q) * q * (sy - 40) + q * q * y1]; }
        const q = (s - 0.17) / 0.83, an = a0 + (a1 - a0) * q, inw = s > 0.94 ? 1 - (s - 0.94) * 1.6 : 1;
        return [cx + Math.cos(an) * ex * rad(an) * inw, cy + Math.sin(an) * ey * rad(an) * inw];
      };
      const head = rm ? 1 : eo(clamp((u + 0.02) / 1.2));
      const N = 150, P = []; for (let i = 0; i <= N; i++) { const s = (i / N) * head; P.push([s, pt(s)]); }
      return { P, head, end: pt(1) };
    }
    const PINK = [255, 178, 214], MINT = [158, 238, 208], LAV = [194, 176, 255];
    function pearlAt(s, u, rm) {
      const t = rm ? 0 : u * 0.35, w1 = 0.5 + 0.5 * Math.sin(s * 8 + t), w2 = 0.5 + 0.5 * Math.sin(s * 8 + 2.1 + t), w3 = 0.5 + 0.5 * Math.sin(s * 8 + 4.2 + t), ws = w1 + w2 + w3;
      return [0, 1, 2].map(c => Math.round(IVORY[c] * 0.22 + 0.78 * (PINK[c] * w1 + MINT[c] * w2 + LAV[c] * w3) / ws));
    }
    function drawRibbon(R, u, env, rm, front) {
      const { P } = R; const settle = u > 1.5 ? 0.62 + 0.38 * clamp(1 - (u - 1.5) / 1.2) : 1;
      const vis = (rm ? clamp((u - 0.1) / 0.8) : 1) * env * settle;
      const isFront = s => s < 0.16 || s > 0.94;
      const quads = (c, alMul) => {
        for (let i = 1; i < P.length; i++) {
          const [s, [x, y]] = P[i], [, [px, py]] = P[i - 1]; if (isFront(s) !== front) continue;
          const taper = Math.pow(Math.sin(Math.PI * clamp(s / 1)), 0.7) * clamp(s / 0.05), headGlow = rm ? 0 : clamp(1 - (R.head - s) / 0.08) * 0.6;
          const nx = -(y - py), ny = x - px, nl = Math.hypot(nx, ny) || 1, ux = nx / nl, uy = ny / nl;
          const wd = (3 + 20 * taper) * (0.72 + 0.28 * Math.abs(Math.cos(s * 12 + (rm ? 0 : u * 0.6))));
          c.fillStyle = rgba(pearlAt(s, u, rm), (0.62 * taper + headGlow * 0.4) * vis * alMul);
          c.beginPath(); c.moveTo(px + ux * wd, py + uy * wd); c.lineTo(x + ux * wd, y + uy * wd); c.lineTo(x - ux * wd, y - uy * wd); c.lineTo(px - ux * wd, py - uy * wd); c.closePath(); c.fill();
        }
      };
      quads(softBegin(), 1); softEnd(6, 1); quads(softBegin(), 1); softEnd(2, 0.55);                                  // luminous body (feathered)
      ctx.save(); ctx.globalCompositeOperation = 'screen'; quads(ctx, 0.22);  // translucent ribbon surface
      // delicate core line
      ctx.lineCap = 'round';
      for (let i = 1; i < P.length; i++) {
        const [s, [x, y]] = P[i], [, [px, py]] = P[i - 1]; if (isFront(s) !== front) continue;
        const taper = Math.pow(Math.sin(Math.PI * s), 1.2);
        ctx.strokeStyle = rgba([255, 252, 246], 0.45 * taper * vis); ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y); ctx.stroke();
      }
      ctx.restore();
    }

    function drawFX3(u, it, rar, cy, sz, out) {
      const im = imgs[it.img]; if (!im) return;
      const F = fxSetup(it, rar), F3 = fx3Setup(it, rar), A = anchorOf(it), rm = RM();
      const sc = sz / Math.max(im.width, im.height), hw = im.width * sc / 2, hh = im.height * sc / 2;
      const X = W / 2 + (A.ax - 0.5) * im.width * sc, Y = cy + (A.ay - 0.5) * im.height * sc;
      const k = sz / 380, asp = A.asp || 1;
      const Rb = 0.5 * Math.sqrt(im.width * im.height) * (380 / Math.max(im.width, im.height)) * k;
      const env = clamp((u - 0.04) / 0.3) * (1 - out);
      cur.fx3.geo = { hw, hh, cy, env };
      if (env <= 0) return;
      const tint = rar === 'mythic' ? PEARL : softTint(rar);
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      // ---- halo
      let hm = 1;
      if (rar === 'legendary') { const p = u - 0.02, b = p < 0 ? 0 : p < 0.08 ? p / 0.08 : Math.exp(-(p - 0.08) * 4); hm = (rm ? 1 : 1 + 0.5 * b) * (0.62 + 0.38 * clamp(1 - (u - 0.9) / 1.3));
        if (!rm && b > 0.02) { const br = Rb * (1.1 + 1.8 * eo(clamp(p / 0.5))); const g = ctx.createRadialGradient(X, Y, 0, X, Y, br); g.addColorStop(0, rgba(CARAMEL, 0.3 * b)); g.addColorStop(0.55, rgba(tint, 0.13 * b)); g.addColorStop(1, rgba(CARAMEL, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, br, 0, 6.2832); ctx.fill(); } }
      const Rh = Rb * (FXR[rar] || 1) * (rar === 'common' ? 1 : 1.2), br2 = rm ? 1 : 1 + 0.02 * Math.sin(u * 1.9);
      ctx.save(); ctx.translate(X, Y); ctx.scale(asp, 1 / asp);
      let g = ctx.createRadialGradient(0, 0, 0, 0, 0, Rh * 1.6 * br2); const ha = (rar === 'common' ? 0.5 : rar === 'mythic' ? 0.42 : 0.55) * env * hm;
      g.addColorStop(0, rgba(IVORY, ha * 0.8)); g.addColorStop(rar === 'common' ? 0.35 : 0.28, rgba(rar === 'mythic' ? PEARL : CARAMEL, ha * 0.42)); g.addColorStop(0.6, rgba(tint, ha * (rar === 'common' ? 0.08 : 0.15))); g.addColorStop(1, rgba(tint, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, Rh * 1.6 * br2, 0, 6.2832); ctx.fill(); ctx.restore();
      // ---- RARE · two short asymmetric glint trails + sparse sugar dust afterwards
      if (rar === 'rare') {
        const ex = hw * 1.1 + 18, ey = hh * 1.04 + 16;
        trail(W / 2, cy, ex * 1.04, ey, 2.25, 3.75, 0.36, 0.72, u, F3, 0, rm, env);
        trail(W / 2, cy, ex * 1.12, ey * 0.98, 0.85, -0.42, 0.5, 0.6, u, F3, 1, rm, env);
        const on = clamp((u - 1.15) / 0.6);
        if (on > 0) for (const [side, n] of [[1, 7], [-1, 6]]) for (let i = 0; i < n; i++) {
          const ph = (i * 0.41 + (side > 0 ? 0.07 : 0.29)) % 1, q = rm ? ph : ((u - 1.15) * (0.14 + (i % 3) * 0.035) + ph) % 1;
          const a = side > 0 ? -0.45 + q * 1.3 : Math.PI + 0.55 - q * 1.25;
          const x = W / 2 + Math.cos(a) * ex * (1.03 + 0.05 * Math.sin(i * 3.1)), y = cy + Math.sin(a) * ey, al = on * env * 0.62 * Math.sin(q * Math.PI), r2 = 1.7 + (i % 3) * 0.7;
          const gg = ctx.createRadialGradient(x, y, 0, x, y, r2 * 2.4); gg.addColorStop(0, rgba(IVORY, al)); gg.addColorStop(1, rgba(CARAMEL, 0)); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, r2 * 2.4, 0, 6.2832); ctx.fill();
        }
      }
      // ---- EPIC · one legible ring (circular in scene space) then a contained crown
      if (rar === 'epic' && cfg.fx === 'v4') drawEpicFan(u, X, Y, Rb, asp, A, im, sc, env, rm);
      else if (rar === 'epic') {
        const t0 = 0.08, p = (u - t0) / 1.15;
        if (rm) { const ra = 0.5 * clamp((u - 0.1) / 0.6) * (1 - clamp((u - 1.8) / 0.8)) * env; ctx.strokeStyle = rgba(IVORY, ra); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X, Y, Rb * 2.0, 0, 6.2832); ctx.stroke(); }
        else if (p > 0 && p < 1) {
          const r0 = Rb * (0.55 + 1.85 * eo(p)), born = clamp(p / 0.08), fade = Math.pow(1 - p, 1.15) * born;
          ctx.strokeStyle = rgba(CARAMEL, 0.22 * fade * env); ctx.lineWidth = 12 * (1 - p * 0.5); ctx.beginPath(); ctx.arc(X, Y, r0, 0, 6.2832); ctx.stroke();
          ctx.strokeStyle = rgba(IVORY, 0.9 * fade * env); ctx.lineWidth = 3.4 * (1 - p) + 1; ctx.beginPath(); ctx.arc(X, Y, r0, 0, 6.2832); ctx.stroke();
        }
        const appear = eo(clamp((u - 0.5) / 0.55)), inner = Math.max(24, A.br * Math.max(im.width, im.height) * sc * 0.5), c = softBegin();
        for (const sh of F.shafts) {
          const a = sh.a + (rm ? 0 : 0.025 * Math.sin(u * sh.f * 6.28 + sh.ph));
          shaft(c, X, Y, a, sh.w, inner * 0.6, Rb * sh.l * 1.2 * (0.6 + 0.4 * appear), 0.55 * appear * env, IVORY, CARAMEL, softTint('epic'));
        }
        softEnd(3, 1);
      }
      // ---- LEGENDARY · staggered unfolding of wide warm shafts, then a calm glow
      if (rar === 'legendary') {
        const inner = Math.max(24, A.br * Math.max(im.width, im.height) * sc * 0.5), c = softBegin(), rot = rm ? 0 : F3.rot * Math.max(0, u - 0.3);
        const calm = 0.5 + 0.5 * clamp(1 - (u - 0.85) / 1.4);
        for (const sh of F3.leg) {
          const un = rm ? clamp((u - 0.1) / 0.6) : eo(clamp((u - 0.03 - sh.d) / 0.5));
          const a = sh.a + rot, ca = Math.cos(a), sa = Math.sin(a), er = 1 / Math.sqrt((ca / asp) ** 2 + (sa * asp) ** 2);
          const len = Rb * sh.l * er * 1.3 * (0.35 + 0.65 * un), al = 0.62 * un * env * calm * (rm ? 0.9 : 0.86 + 0.14 * Math.sin(u * sh.f * 6.28 + sh.ph));
          shaft(c, X, Y, a, sh.w, inner * 0.6, len, al, IVORY, CARAMEL, softTint('legendary'));
        }
        softEnd(4, 1);
      }
      // ---- MYTHIC · ribbon (back pass here, front pass after the box is drawn)
      if (rar === 'mythic' && cfg.fx === 'v4') drawMythicVeil(u, X, Y, cy, hw, hh, Rb, env, rm);
      else if (rar === 'mythic') {
        const R = ribbonPath(u, W / 2, cy, hw, hh, rm); cur.fx3.ribbon = R;
        drawRibbon(R, u, env, rm, false);
        const [fx, fy] = R.end, fp = rm ? clamp((u - 1.1) / 0.6) * 0.5 * (1 - clamp((u - 2.4) / 0.8)) : envP(u, 1.2, 0.55);
        if (fp > 0) { const gg = ctx.createRadialGradient(fx, fy, 0, fx, fy, 70); gg.addColorStop(0, rgba(PEARL, 0.36 * fp)); gg.addColorStop(1, rgba(PEARL, 0)); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(fx, fy, 70, 0, 6.2832); ctx.fill(); accent(fx, fy, 10, fp * env, rm); }
        if (u > 1.4) { const so = clamp((u - 1.4) / 0.8) * env, gg = ctx.createRadialGradient(W / 2, cy, Rb * 0.7, W / 2, cy, Rb * 1.9); gg.addColorStop(0, rgba(PEARL, 0)); gg.addColorStop(0.6, rgba(PINK, 0.06 * so)); gg.addColorStop(0.8, rgba(MINT, 0.05 * so)); gg.addColorStop(1, rgba(LAV, 0)); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(W / 2, cy, Rb * 1.9, 0, 6.2832); ctx.fill(); }
      }
      // ---- accents: enter / peak / vanish, irregular
      { const ex = hw * 1.1 + 16, ey = hh * 1.05 + 16;
        for (const p of F.acc) { const e = rm ? clamp((u - p.t0) / 0.5) * (1 - clamp((u - p.t0 - 1.2) / 0.5)) * 0.7 : envP(u, p.t0, p.dur); if (e <= 0) continue;
          accent(W / 2 + Math.cos(p.a) * ex * p.f, cy + Math.sin(p.a) * ey * p.f - (rm ? 0 : 8 * ((u - p.t0) / p.dur)), p.s * (rar === 'common' ? 0.8 : 1), e * env * 0.9, rm); } }
      ctx.restore();
    }

    // ================= REVIEW v4 · épico "abanico de luz" + mítico "velo de aurora nacarada" =================
    function fanSetup(it) {
      if (cur.fan && cur.fan.key === it.id) return cur.fan;
      const R = rng(hash(it.id + '#fan') + 41), n = 5, shafts = [];
      // irregular, balanced spread over the upper half (about -150° .. -30°), slightly heavier on one side
      const base = [-2.45, -2.02, -1.6, -1.15, -0.72];
      for (let i = 0; i < n; i++) shafts.push({ a: base[i] + (R() - 0.5) * 0.16, w: 0.13 + R() * 0.1, l: 1.15 + R() * 0.75, d: R() * 0.12, ph: R() * 6.28, f: 0.18 + R() * 0.22, h: 0.75 + R() * 0.25 });
      return (cur.fan = { key: it.id, shafts });
    }
    function drawEpicFan(u, X, Y, Rb, asp, A, im, sc, env, rm) {
      const F = fanSetup({ id: cur.entry.res.item.id }), c = softBegin();
      const inner = Math.max(20, A.br * Math.max(im.width, im.height) * sc * 0.45);
      const ivory = IVORY, tintE = mix(RCOL.epic, '#fff1d6', 0.62), warm = mix('#ffd7a0', RCOL.epic, 0.12);
      for (const sh of F.shafts) {
        // impulse opens the fan as the prize appears, then it gathers back and calms down
        const o = rm ? clamp((u - 0.15) / 0.6) : eo(clamp((u - 0.1 - sh.d) / 0.32));
        const gather = rm ? 0.72 : 1 - 0.32 * eo(clamp((u - 0.55 - sh.d) / 0.9));
        const len = Rb * sh.l * 1.25 * (0.3 + 0.7 * o) * gather;
        const wid = sh.w * (0.55 + 0.45 * o) * (rm ? 0.9 : 1 - 0.25 * eo(clamp((u - 0.6) / 0.9)));
        const al = 0.95 * sh.h * env * o * (rm ? 0.8 : 0.72 + 0.28 * clamp(1 - (u - 0.55) / 1.0)) * (rm ? 1 : 0.88 + 0.12 * Math.sin(u * sh.f * 6.28 + sh.ph));
        if (al < 0.01) continue;
        // a shaft = several overlapping soft wedges with irregular intensity; no outline anywhere
        for (const [wf, af, lf] of [[1, 0.16, 1], [0.7, 0.22, 0.92], [0.45, 0.3, 0.8], [0.22, 0.38, 0.66]]) {
          const lg = c.createRadialGradient(X, Y, inner, X, Y, len * lf);
          lg.addColorStop(0, rgba(ivory, al * af)); lg.addColorStop(0.28, rgba(warm, al * af * 0.8)); lg.addColorStop(0.6, rgba(tintE, al * af * 0.3)); lg.addColorStop(1, rgba(tintE, 0));
          c.fillStyle = lg; c.beginPath(); c.moveTo(X + Math.cos(sh.a) * inner, Y + Math.sin(sh.a) * inner); c.arc(X, Y, len * lf, sh.a - wid * wf, sh.a + wid * wf); c.closePath(); c.fill();
        }
      }
      // compact glow that remains in contemplation
      const cg = c.createRadialGradient(X, Y - Rb * 0.25, 0, X, Y - Rb * 0.25, Rb * 1.25);
      const ca = 0.42 * env * clamp((u - 0.4) / 0.6);
      cg.addColorStop(0, rgba(ivory, ca)); cg.addColorStop(0.5, rgba(tintE, ca * 0.35)); cg.addColorStop(1, rgba(tintE, 0));
      c.fillStyle = cg; c.beginPath(); c.arc(X, Y - Rb * 0.25, Rb * 1.25, 0, 6.2832); c.fill();
      softEnd(5, 1);
    }
    // MYTHIC veil: translucent sheets born narrow inside the box, opening as they rise behind the prize and dissolving upward
    function veilSetup(it) {
      if (cur.veil && cur.veil.key === it.id) return cur.veil;
      const R = rng(hash(it.id + '#veil') + 53);
      const sheets = [{ off: -0.18 - R() * 0.1, sw: 0.55 + R() * 0.15, ph: R() * 6.28, tilt: -0.1 - R() * 0.08, a: 1 }, { off: 0.2 + R() * 0.12, sw: 0.4 + R() * 0.12, ph: R() * 6.28, tilt: 0.12 + R() * 0.08, a: 0.7 }];
      const glints = []; for (let i = 0; i < 7; i++) glints.push({ s: 0.25 + R() * 0.7, side: R() < 0.5 ? -1 : 1, x: 0.35 + R() * 0.6, t0: 0.5 + R() * 1.6, dur: 0.6 + R() * 0.5 });
      return (cur.veil = { key: it.id, sheets, glints });
    }
    function drawMythicVeil(u, X, Y, cy, hw, hh, Rb, env, rm) {
      const V = veilSetup({ id: cur.entry.res.item.id }), g0 = boxGeo();
      const y0 = g0.topY + 26, yTop = Math.max(250, cy - hh - Rb * 1.1);          // never reaches the plaque (bottom ~ y 220)
      const H0 = y0 - yTop;
      const rise = rm ? 1 : eo(clamp((u + 0.05) / 1.25));                         // how far the veil has climbed
      const settle = rm ? 0.7 : 0.62 + 0.38 * clamp(1 - (u - 1.4) / 1.3);
      const c = softBegin();
      for (const sh of V.sheets) {
        const N = 46;
        for (let i = 0; i < N; i++) {
          const q = i / (N - 1); if (q > rise) break;                                 // q: 0 at the box, 1 at the top
          const y = y0 - q * H0;
          // width: narrow at the box, opens behind the prize, frays near the top
          const open = Math.pow(q, 0.65) * (1 - 0.25 * q);
          const wdt = (Rb * 0.22 + Rb * 1.75 * sh.sw * Math.pow(open, 0.8)) * (1 + 0.18 * Math.sin(q * 7 + sh.ph + (rm ? 0 : u * 0.9)));
          const fold = Math.sin(q * 4.4 + sh.ph + (rm ? 0 : u * 1.1)) * Rb * 0.55 * q;             // broad asymmetric folds
          const xc = X + sh.off * Rb * 2.2 * q + sh.tilt * (y0 - y) * 0.3 + fold;
          // translucency: fades in at the base, almost disappears in places, dissolves at the top and at the head of the rise
          const head = rm ? 1 : clamp((rise - q) / 0.18);
          const holes = 0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin(q * 9 + sh.ph * 2 + (rm ? 0 : u * 0.7)), 2.2);
          const prof = Math.pow(Math.sin(Math.PI * Math.min(1, q * 0.95)), 1.3) * (0.35 + 0.65 * clamp(q / 0.3));
          const al = 0.58 * sh.a * env * settle * prof * head * holes;
          if (al < 0.004) continue;
          // pearl colour drifts along the height: ivory base with soft pink / mint / lavender accents
          const k1 = 0.5 + 0.5 * Math.sin(q * 6 + sh.ph), k2 = 0.5 + 0.5 * Math.sin(q * 6 + sh.ph + 2.1), k3 = 0.5 + 0.5 * Math.sin(q * 6 + sh.ph + 4.2), ks = k1 + k2 + k3;
          const col = [0, 1, 2].map(ch => Math.round(IVORY[ch] * 0.3 + 0.7 * (PINK[ch] * k1 + MINT[ch] * k2 + LAV[ch] * k3) / ks));
          const gr = c.createRadialGradient(0, 0, 0, 0, 0, wdt);
          gr.addColorStop(0, rgba(col, al)); gr.addColorStop(0.55, rgba(col, al * 0.45)); gr.addColorStop(1, rgba(col, 0));
          c.fillStyle = gr; c.save(); c.translate(xc, y); c.scale(1, 0.42); c.beginPath(); c.arc(0, 0, wdt, 0, 6.2832); c.fill(); c.restore();
        }
      }
      softEnd(5, 1);
      // small brighter reflections drifting up inside the veil (enter, peak, vanish)
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      for (const gl of V.glints) {
        const e = rm ? 0 : envP(u, gl.t0, gl.dur); if (e <= 0) continue;
        const q = gl.s + 0.12 * ((u - gl.t0) / gl.dur), y = y0 - q * H0, x = X + gl.side * gl.x * Rb * 0.9 * Math.sin(Math.PI * q);
        const gg = ctx.createRadialGradient(x, y, 0, x, y, 9); gg.addColorStop(0, rgba(PEARL, 0.55 * e * env)); gg.addColorStop(1, rgba(PEARL, 0)); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.2832); ctx.fill();
      }
      // single culminating glint at the top of the veil, then a contained pearl presence
      const tx = X + 0.08 * Rb, ty = yTop + H0 * 0.18;
      const fp = rm ? clamp((u - 1.1) / 0.6) * 0.45 * (1 - clamp((u - 2.4) / 0.8)) : envP(u, 1.15, 0.6);
      if (fp > 0) { const gg = ctx.createRadialGradient(tx, ty, 0, tx, ty, 60); gg.addColorStop(0, rgba(PEARL, 0.32 * fp)); gg.addColorStop(1, rgba(PEARL, 0)); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(tx, ty, 60, 0, 6.2832); ctx.fill(); accent(tx, ty, 9, fp * env, rm); }
      ctx.restore();
    }
    function drawFX3Front(u) {
      if (!cur || !cur.fx3 || !cur.fx3.ribbon || !cur.fx3.geo) return;
      drawRibbon(cur.fx3.ribbon, u, cur.fx3.geo.env, RM(), true);
    }
    // anticipation: legendary = warm flicker leaking through the seam; mythic = slow pearl pulse rising from inside
    function drawAnticipation3(t, g, rar) {
      if (rar !== 'legendary' && rar !== 'mythic') return;
      const rm = RM(), k = clamp((t - 0.28) / (T_POP - 0.28)); if (k <= 0) return;
      const myth = rar === 'mythic', fl = rm ? 1 : myth ? 0.8 + 0.2 * Math.sin(t * 9) : 0.86 + 0.14 * Math.sin(t * 31) * Math.sin(t * 17);
      const cA = myth ? PEARL : CARAMEL;
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      ctx.save(); ctx.translate(W / 2, g.seamY - 6); ctx.scale(1, myth ? 0.55 : 0.42);
      const gg = ctx.createRadialGradient(0, 0, g.bw * 0.15, 0, 0, g.bw * 0.85);
      gg.addColorStop(0, rgba(cA, 0.6 * k * fl)); gg.addColorStop(0.55, rgba(myth ? LAV : CARAMEL, 0.24 * k * fl)); gg.addColorStop(1, rgba(cA, 0));
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, g.bw * 0.85, 0, 6.2832); ctx.fill(); ctx.restore();
      const lg = ctx.createLinearGradient(W / 2 - g.bw * 0.55, 0, W / 2 + g.bw * 0.55, 0);
      lg.addColorStop(0, rgba(IVORY, 0)); lg.addColorStop(0.5, rgba(myth ? PEARL : IVORY, 0.75 * k * fl)); lg.addColorStop(1, rgba(IVORY, 0));
      ctx.strokeStyle = lg; ctx.lineWidth = 3 + 3 * k; ctx.beginPath(); ctx.moveTo(W / 2 - g.bw * 0.55, g.seamY + 18); ctx.lineTo(W / 2 + g.bw * 0.55, g.seamY + 18); ctx.stroke();
      if (!rm) for (let i = 0; i < 5; i++) { const ph = (t * (myth ? 0.55 : 0.9) + i * 0.21) % 1, x = W / 2 + (i - 2) * g.bw * 0.2 + Math.sin(i * 7) * 12, y = g.seamY + 10 - ph * 120; accent(x, y, 3 + i % 2, k * Math.sin(ph * Math.PI) * 0.8, rm); }
      ctx.restore();
    }
    // per-rarity opening: trajectory and rhythm, not just quantity
    function burstFor(rar, g, bx) {
      const sw = g.bw * bx.sealWidth, n = bx.pieces, shells = [], drops = [], puffs = [];
      const P = {
        common: { G: 1800, fade: 0.42, shrink: true, drops: 4, ds: [12, 20], puffs: 2, pz: 0.45, shake: 0.5, rise: 0.42, grow: 0.5 },
        rare: { G: 1550, fade: 0.6, drops: 8, ds: [16, 28], puffs: 3, pz: 0.7, shake: 0.8, rise: 0.52, grow: 0.62 },
        epic: { G: 1250, fade: 0.72, drops: 12, ds: [18, 30], puffs: 4, pz: 0.85, shake: 1, rise: 0.55, grow: 0.66 },
        legendary: { G: 1000, fade: 0.9, drops: 14, ds: [20, 34], puffs: 5, pz: 1.05, shake: 1.3, rise: 0.66, grow: 0.78 },
        mythic: { G: 650, fade: 0.95, drops: 10, ds: [14, 24], puffs: 3, pz: 0.75, shake: 1.15, rise: 0.66, grow: 0.78, curl: true },
      }[rar] || {};
      for (let i = 0; i < n; i++) {
        const x0 = W / 2 - sw / 2 + sw * (i + 0.5) / n, side = (i - (n - 1) / 2) / ((n - 1) / 2);
        let vx, vy;
        if (rar === 'common') { vx = side * rnd(40, 110); vy = -rnd(150, 240); }
        else if (rar === 'rare') { vx = side * rnd(110, 210); vy = -rnd(290, 400); }
        else if (rar === 'epic') { const a = Math.PI + (i + 0.5) / n * Math.PI; const sp = rnd(400, 480); vx = Math.cos(a) * sp; vy = Math.sin(a) * sp * 0.9; }
        else if (rar === 'legendary') { vx = side * rnd(160, 300); vy = -rnd(560, 700); }
        else { vx = side * rnd(60, 150); vy = -rnd(380, 500); }
        shells.push({ x0, vx, vy, vr: rnd(-8, 8) * (rar === 'mythic' ? 0.4 : 1), flip: i < n / 2, s: rnd(0.95, 1.2), ph: rnd(0, 6.28) });
      }
      for (let i = 0; i < P.drops; i++) {
        let a, sp;
        if (rar === 'epic') { a = i / P.drops * 6.2832 + rnd(-0.1, 0.1); sp = rnd(320, 360); }       // reads as a ring with the light
        else if (rar === 'common') { a = -1.5708 + rnd(-0.8, 0.8); sp = rnd(120, 220); }
        else if (rar === 'rare') { a = -1.5708 + rnd(-0.6, 0.6); sp = rnd(250, 420); }
        else if (rar === 'legendary') { a = -1.5708 + rnd(-0.9, 0.9); sp = rnd(450, 720); }
        else { a = -1.5708 + rnd(-1, 1); sp = rnd(90, 160); }
        drops.push({ x0: W / 2 + rnd(-sw / 2.4, sw / 2.4), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: rar === 'mythic' ? -60 : P.G, im: bx.puffs[i % bx.puffs.length], s: rnd(P.ds[0], P.ds[1]), vr: rnd(-6, 6), ph: rnd(0, 6.28) });
      }
      const pp = [[-0.42, 0], [-0.16, -16], [0.1, -8], [0.38, 4], [-0.02, 10]];
      for (let i = 0; i < P.puffs; i++) puffs.push({ dx: pp[i][0] * sw, dy: pp[i][1], im: bx.puffs[i % bx.puffs.length], s1: P.pz * rnd(0.9, 1.1), rot: rnd(-0.3, 0.3) });
      return { shells, drops, puffs, P };
    }
    // =====================================================================================

    function star(x, y, s, a) { ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.fillStyle = '#fffbe0'; ctx.beginPath(); for (let i = 0; i < 8; i++) { const ang = i * Math.PI / 4, r = i % 2 ? s * 0.3 : s; ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r); } ctx.closePath(); ctx.fill(); ctx.restore(); }

    function drawCard(a, r, entry) {
      const C = theme.colors, it = r.item; const y0 = 28 + (1 - a) * -30;
      ctx.save(); ctx.globalAlpha = a;
      const hasPlaque = plaque(120, y0 - 14, 760, 204);
      if (hasPlaque && (cfg.fx === 'v2' || cfg.fx === 'v3' || cfg.fx === 'v4')) drawPlaqueMark(y0, it.rarity, 1);
      if (!hasPlaque) { ctx.fillStyle = C.bg; ctx.strokeStyle = C.accent; ctx.lineWidth = 7; rr(150, y0, 700, 176, 30); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 4; ctx.strokeStyle = C.gold; rr(160, y0 + 10, 680, 156, 24); ctx.stroke(); }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = C.text; ctx.font = font(28, 600);
      const how = entry.src === 'craft' ? ' baked' : entry.src === 'rain' ? ' caught in the rain' : ' opened';
      ctx.fillStyle = hasPlaque ? '#5e2a14' : C.text; ctx.fillText(entry.name + how, W / 2, y0 + 36);
      ctx.font = font(52); const nm = (r.shiny ? '✦ ' : '') + it.name + (r.shiny ? ' ✦' : ''); if (hasPlaque) { ctx.lineJoin = 'round'; ctx.lineWidth = 9; ctx.strokeStyle = '#5e2a14'; ctx.strokeText(nm, W / 2, y0 + 82); ctx.fillStyle = r.shiny ? '#fff4c8' : '#fff8ea'; } else ctx.fillStyle = C.accent; ctx.fillText(nm, W / 2, y0 + 82);
      // pills row
      const tags = [[RLABEL[it.rarity], RCOL[it.rarity]]];
      if (r.shiny) tags.push(['SHINY', '#2fb8b0']);
      if (r.isNew) tags.push(['NEW!', '#e0404a']); else tags.push(['+' + r.crumbs + ' crumbs', '#a07850']);
      const setName = (theme.sets.find(s => s.id === it.set) || {}).name || '';
      tags.push([setName + ' ' + r.setCount + '/' + r.setTotal, '#6b5a8a']);
      ctx.font = font(24); const ws = tags.map(tg => ctx.measureText(tg[0]).width + 34); const tw = ws.reduce((s, w) => s + w, 0) + (tags.length - 1) * 10;
      let x = W / 2 - tw / 2; tags.forEach((tg, i) => { pill(x + ws[i] / 2, y0 + 134, tg[0], tg[1], '#fff', 24, 17, 6); x += ws[i] + 10; });
      ctx.restore();
    }

    function drawPanel(p, a) {
      const v = S.viewers[p.key]; if (!v) return; const C = theme.colors;
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(16,18,40,0.55)'; ctx.fillRect(0, 0, W, H);
      const x0 = 70, y0 = 120, w = 860, h = 860;
      ctx.fillStyle = C.bg; ctx.strokeStyle = C.accent; ctx.lineWidth = 8; rr(x0, y0, w, h, 34); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 4; ctx.strokeStyle = C.gold; rr(x0 + 12, y0 + 12, w - 24, h - 24, 26); ctx.stroke();
      const total = theme.items.filter(i => owned(v, i.id)).length, shinies = theme.items.filter(i => v.items[i.id] && v.items[i.id][1] > 0).length;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = C.accent; ctx.font = font(46);
      ctx.fillText(v.n + "'s collection", W / 2, y0 + 62);
      ctx.font = font(26, 600); ctx.fillStyle = C.text;
      const sub = total + '/' + theme.items.length + ' found · ' + shinies + ' shiny · ' + v.crumbs + ' crumbs (' + cfg.craftCmd + ' = ' + cfg.craftCost + ')'; ctx.fillText(sub, W / 2 + 18, y0 + 108); icon('crumbs', W / 2 + 18 - ctx.measureText(sub).width / 2 - 26, y0 + 106, 36);
      // grid by set
      let y = y0 + 150;
      theme.sets.forEach(set => {
        const items = theme.items.filter(i => i.set === set.id); if (!items.length) return;
        const done = items.every(i => owned(v, i.id));
        ctx.textAlign = 'left'; ctx.font = font(24); ctx.fillStyle = done ? '#2f8a5a' : C.text;
        const hasIc = icon(set.id, x0 + 60, y + 4, 40); ctx.fillText(set.name + '  ' + items.filter(i => owned(v, i.id)).length + '/' + items.length + (done ? '  ✓ COMPLETE' : ''), x0 + (hasIc ? 88 : 44), y + 4);
        const cell = 111; let cx = x0 + 44 + cell / 2;
        items.forEach(it => {
          const has = owned(v, it.id), sh = v.items[it.id] && v.items[it.id][1] > 0;
          ctx.fillStyle = has ? '#fff' : '#efe6d6'; ctx.strokeStyle = has ? RCOL[it.rarity] : '#d8ccb6'; ctx.lineWidth = 4; rr(cx - 51, y + 24, 102, 102, 16); ctx.fill(); ctx.stroke();
          itemArt(it, cx, y + 75, 86, false, !has);
          if (sh) star(cx + 36, y + 38, 13, 1);
          const n = v.items[it.id] ? v.items[it.id][0] + v.items[it.id][1] : 0;
          if (n > 1) { pill(cx + 30, y + 120, 'x' + n, '#8f1c22', '#fff', 18, 9, 3); }
          cx += cell;
        });
        y += 176;
      });
      ctx.restore();
    }


    // ---------- cinematic achievement presentation
    const SNAP = document.createElement('canvas'); SNAP.width = W; SNAP.height = H; const snx = SNAP.getContext('2d');
    const SHEEN = document.createElement('canvas'), shx = SHEEN.getContext('2d');
    function drawCinema(c) {
      const B = theme.banners[c.kind], im = imgs[B.img], rm = RM(), t = c.t, D = c.dur || 3.3;
      const tIn = 0.4, tOut = D - 0.55;
      const dimK = clamp(t / tIn) * (1 - clamp((t - tOut) / 0.5));
      // 1) the scene behind goes soft and dim (only this widget's own canvas)
      if (dimK > 0) {
        snx.clearRect(0, 0, W, H); snx.drawImage(canvas, 0, 0);
        ctx.save(); ctx.clearRect(0, 0, W, H);
        ctx.filter = `blur(${(rm ? 4 : 7) * dimK}px) brightness(${1 - 0.42 * dimK}) saturate(${1 - 0.25 * dimK})`;
        ctx.drawImage(SNAP, 0, 0); ctx.restore();
        const vg = ctx.createRadialGradient(W / 2, 520, 120, W / 2, 520, 720);
        vg.addColorStop(0, 'rgba(10,8,24,0)'); vg.addColorStop(1, `rgba(10,8,24,${0.45 * dimK})`); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      }
      // 2) banner choreography per achievement
      const big = { set: 820, master: 800, channel: 990 }[c.kind] || 800;
      const w0 = big, h0 = im.height * w0 / im.width;
      let cx = W / 2, cy = 520, sc = 1, rot = 0, al = 1;
      const outP = clamp((t - tOut) / 0.55), outE = eo(outP);
      if (c.kind === 'set') {
        const d = rm ? 1 : spring(clamp((t - 0.1) / 0.75), 1.4, 5);
        cy = rm ? 520 : -h0 + (520 + h0) * d; rot = rm ? 0 : Math.sin(t * 3.2) * 0.035 * Math.exp(-t * 1.4);
      } else if (c.kind === 'master') {
        const g = rm ? 1 : eo(clamp((t - 0.15) / 0.9)); sc = 0.25 + 0.75 * g; al = clamp((t - 0.1) / 0.3);
      } else {
        const d = rm ? 1 : spring(clamp((t - 0.05) / 0.8), 1.2, 6); cy = rm ? 470 : -h0 + (470 + h0) * d;
      }
      if (rm) al *= clamp(t / 0.3);
      if (c.kind === 'channel') { cy -= outE * (cy + h0); }                  // the curtain lifts away → box rain
      else { cx = cx; cy = cy + (832 - cy) * outE; sc *= 1 - 0.55 * outE; al *= 1 - outP; }
      // warm light behind
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      const gl = ctx.createRadialGradient(cx, cy, 0, cx, cy, w0 * 0.75 * sc);
      gl.addColorStop(0, rgba(IVORY, 0.38 * al * dimK)); gl.addColorStop(0.45, rgba(c.kind === 'master' ? [255, 214, 130] : CARAMEL, 0.16 * al * dimK)); gl.addColorStop(1, rgba(CARAMEL, 0));
      ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H); ctx.restore();
      ctx.save(); ctx.globalAlpha = al; ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(sc, sc);
      ctx.drawImage(im, -w0 / 2, -h0 / 2, w0, h0);
      // master: one golden sheen sweeps across the plaque
      if (c.kind === 'master' && !rm) {
        const p = clamp((t - 0.85) / 1.1);
        if (p > 0 && p < 1) {
          SHEEN.width = Math.ceil(w0); SHEEN.height = Math.ceil(h0); shx.clearRect(0, 0, w0, h0); shx.globalCompositeOperation = 'source-over'; shx.drawImage(im, 0, 0, w0, h0);
          shx.globalCompositeOperation = 'source-in'; const x = -0.3 * w0 + 1.6 * w0 * (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2); const fe = Math.sin(Math.PI * p);
          const lg = shx.createLinearGradient(x - 120, 0, x + 120, h0 * 0.4); lg.addColorStop(0, 'rgba(255,240,190,0)'); lg.addColorStop(0.5, `rgba(255,240,190,${0.6 * fe})`); lg.addColorStop(1, 'rgba(255,240,190,0)');
          shx.fillStyle = lg; shx.fillRect(0, 0, w0, h0); ctx.globalCompositeOperation = 'screen'; ctx.drawImage(SHEEN, -w0 / 2, -h0 / 2); ctx.globalCompositeOperation = 'source-over';
        }
      }
      // set: the icon pops into the medallion
      if (B.medal && c.set) { const k = rm ? 1 : spring(clamp((t - 0.55) / 0.5), 2, 5); if (k > 0.02) icon(c.set, (B.medal[0] - 0.5) * w0, (B.medal[1] - 0.5) * h0, B.medal[2] * w0 * 0.95 * k); }
      const tx = (B.text[0] - 0.5) * w0, ty = (B.text[1] - 0.5) * h0, tw = B.tw * w0;
      const ta = clamp((t - 0.45) / 0.3);
      ctx.globalAlpha = al * ta; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const s1 = fitText(c.top, tw, c.kind === 'channel' ? 34 : 40, 600); ctx.fillStyle = '#5e2a14'; ctx.fillText(c.top, tx, ty - s1 * 0.95);
      const s2 = fitText(c.big, tw, c.kind === 'channel' ? 52 : 70, 700); ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(8, s2 * 0.16); ctx.strokeStyle = '#5e2a14'; ctx.strokeText(c.big, tx, ty + s2 * 0.35);
      ctx.fillStyle = c.kind === 'master' ? '#ffe39a' : '#fff8ea'; ctx.fillText(c.big, tx, ty + s2 * 0.35);
      ctx.restore();
      // sugar glints around (each on its own clock)
      if (!rm) for (let i = 0; i < (c.kind === 'set' ? 8 : 12); i++) {
        const t0 = 0.4 + i * 0.19 + (i % 3) * 0.06, e = envP(t, t0, 0.85); if (e <= 0) continue;
        const ang = i * 2.39996 + 0.5, x = cx + Math.cos(ang) * w0 * 0.55 * sc, y = cy + Math.sin(ang) * h0 * 0.62 * sc - 12 * (t - t0);
        ctx.save(); ctx.globalCompositeOperation = 'screen'; accent(x, y, c.kind === 'master' ? 9 : 7, e * al, rm); ctx.restore();
      }
    }

    // ---------- cookie HUD: one gingerbread bar for the channel collection and the box rain
    function drawCookieHud(g) {
      const H_ = theme.hud, bar = imgs[H_.bar], fill = imgs[H_.fill], gift = imgs[H_.gift], rm = RM();
      const bw = 560, bh = bar.height * bw / bar.width, cx = W / 2, cy = 1050;
      const gx0 = cx - bw / 2 + H_.groove[0] * bw, gx1 = cx - bw / 2 + H_.groove[1] * bw, gy0 = cy - bh / 2 + H_.groove[2] * bh, gy1 = cy - bh / 2 + H_.groove[3] * bh;
      const raining = !!(rain && clock < rain.until);
      if (raining !== hudPrevRain) { hudFlip = clock; hudPrevRain = raining; }
      // flip transition between the two states (card turning over)
      // soft crossfade between the two states: the bar never jumps, only the label swaps and the candy glides to its new length
      const fp = hudFlip < 0 || rm ? 1 : clamp((clock - hudFlip) / 0.6), sy = 1;
      const showRain = raining;
      const n = theme.items.length, f = theme.items.filter(i => S.community.found[i.id]).length - pendingComm;
      const doneNow = S.community.done && !pendingComm;
      let target = showRain ? (rain ? clamp((rain.until - clock) / (rain.total || cfg.rainSecs)) : 0) : f / n;
      const hdt = clamp(clock - hudLast, 0, 0.1); hudLast = clock; if (hudDisp === null) hudDisp = target; else hudDisp += (target - hudDisp) * (1 - Math.exp(-hdt * 7));          // the candy cane grows smoothly
      if (doneNow && hudDoneT < 0) hudDoneT = clock; if (!doneNow) hudDoneT = -1;
      ctx.save();
      ctx.drawImage(bar, cx - bw / 2, cy - bh / 2, bw, bh);
      // candy cane fill, clipped to the groove; stripes slide while the rain is running
      const gw = gx1 - gx0, fw = gw * clamp(hudDisp);
      if (fw > 4) {
        ctx.save(); rr(gx0, gy0, gw, gy1 - gy0, (gy1 - gy0) / 2); ctx.clip(); rr(gx0, gy0, fw, gy1 - gy0, (gy1 - gy0) / 2); ctx.clip();
        // tile a whole number of stripe periods (95.5 px in the source) so the candy loops seamlessly while it slides
        const fh = (gy1 - gy0) * 1.08, Ld = fill.width * fh / fill.height;   // fill art is a seamless loop tile
        const slide = !rm ? (clock * 28) % Ld : 0;
        for (let x = gx0 - Ld + slide; x < gx0 + fw; x += Ld - 0.5) ctx.drawImage(fill, x, (gy0 + gy1) / 2 - fh / 2, Ld, fh);
        // glossy highlight along the top of the candy
        const hl = ctx.createLinearGradient(0, gy0, 0, gy1); hl.addColorStop(0, 'rgba(255,255,255,0.35)'); hl.addColorStop(0.45, 'rgba(255,255,255,0)'); ctx.fillStyle = hl; ctx.fillRect(gx0, gy0, fw, gy1 - gy0);
        ctx.restore();
        // a sugar glint rides the leading edge
        if (!rm && fw < gw - 6) { ctx.save(); ctx.globalCompositeOperation = 'screen'; accent(gx0 + fw - 4, (gy0 + gy1) / 2, 4.5, 0.6 + 0.3 * Math.sin(clock * 5), rm); ctx.restore(); }
      }
      // label over the groove
      const label = showRain ? 'BOX RAIN · type ' + cfg.openCmd + ' · ' + Math.max(0, Math.ceil(rain ? rain.until - clock : 0)) + 's'
        : (doneNow ? 'CHANNEL COLLECTION COMPLETE · ' : 'CHANNEL COLLECTION · ') + f + '/' + n;
      const oldLabel = showRain ? (doneNow ? 'CHANNEL COLLECTION COMPLETE · ' : 'CHANNEL COLLECTION · ') + f + '/' + n : 'BOX RAIN · type ' + cfg.openCmd + ' · 0s';
      const txt = (L, al, dy) => { if (al <= 0.01) return; ctx.save(); ctx.globalAlpha *= al; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; fitText(L, gw - 24, 20, 700);
        ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = '#4a200e'; ctx.strokeText(L, cx, (gy0 + gy1) / 2 + 1 + dy); ctx.fillStyle = '#fff8ea'; ctx.fillText(L, cx, (gy0 + gy1) / 2 + 1 + dy); ctx.restore(); };
      ctx.save(); ctx.beginPath(); ctx.rect(gx0, gy0 - 4, gw, gy1 - gy0 + 8); ctx.clip();
      const e2 = eo(fp); txt(oldLabel, 1 - clamp(fp * 2), -14 * e2); txt(label, clamp(fp * 1.6 - 0.3), 12 * (1 - e2)); ctx.restore();
      ctx.restore();
      // a light shower of gingerbread gifts along both sides of the widget while it rains (never over the prize)
      if (gift && raining && !rm) {
        const el = clock - (rain.t0 || clock), fadeIn = clamp(el / 0.6), fadeOut = clamp((rain.until - clock) / 0.8);
        for (let i = 0; i < 8; i++) {
          const side = i % 2 ? 1 : -1, per = 3.2 + (i % 3) * 0.7, ph = ((clock + i * 0.83) % per) / per;
          const x = W / 2 + side * (330 + ((i * 53) % 110)) + Math.sin(clock * 1.3 + i) * 14, y = -40 + ph * 1100, s2 = 40 + (i % 3) * 10;
          ctx.save(); ctx.globalAlpha = 0.85 * fadeIn * fadeOut * clamp((1 - ph) / 0.15); ctx.translate(x, y); ctx.rotate(Math.sin(clock * 2 + i) * 0.4); ctx.drawImage(gift, -s2 / 2, -s2 / 2, s2, s2 * gift.height / gift.width); ctx.restore();
        }
      }
      // the gift floats in the free space left of the bar (never over it): a warm pulsing glow says "claim me", and it jumps when someone claims
      if (gift && raining && sy > 0.6) {
        const gIn = rm ? 1 : spring(clamp((clock - (rain.t0 || clock) - 0.25) / 0.6), 1.4, 5), gOut = clamp((rain.until - clock) / 0.4), gs = 62 * Math.max(0.01, gIn * gOut), gh = gift.height * gs / gift.width, gx = cx - bw / 2 - 62 * 0.62 - 14, ping = clamp(1 - (clock - hudPing) / 0.5);
        const bob = rm ? 0 : Math.sin(clock * 2.4) * 6 - ping * 10, gy = cy + bob;
        const pulse = (rm ? 0.7 : 0.6 + 0.4 * Math.sin(clock * 3.2)) * clamp(gIn) * gOut;
        // halo
        ctx.save(); ctx.globalCompositeOperation = 'screen';
        // halo: a soft ellipse that always fades out before the bottom edge of the widget (never clipped)
        const hr = gs * (0.95 + 0.15 * pulse + 0.35 * ping), hcy = gy - 6, ky = Math.min(1, Math.max(0.35, (H - 4 - hcy) / hr));
        ctx.save(); ctx.translate(gx, hcy); ctx.scale(1, ky);
        const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, hr);
        hg.addColorStop(0, rgba(IVORY, 0.55 * pulse + 0.3 * ping)); hg.addColorStop(0.45, rgba(CARAMEL, 0.28 * pulse + 0.2 * ping)); hg.addColorStop(1, rgba(CARAMEL, 0));
        ctx.fillStyle = hg; ctx.fillRect(-hr, -hr, hr * 2, hr * 2); ctx.restore();
        // three sugar glints orbiting slowly
        if (!rm && gIn > 0.3) for (let i = 0; i < 3; i++) { const a = clock * 1.4 + i * 2.094, r = gs * 0.62; accent(gx + Math.cos(a) * r, gy + Math.sin(a) * r * 0.75, 3.2 + 1.5 * Math.max(0, Math.sin(clock * 4 + i * 2)), (0.5 + 0.5 * Math.sin(clock * 4 + i * 2)) * clamp(gIn) * gOut, rm); }
        ctx.restore();
        // gift: gentle float + tilt, little squash-pop on each claim
        const sc = 1 + 0.18 * ping * Math.sin(Math.PI * clamp((clock - hudPing) / 0.5));
        ctx.save(); ctx.translate(gx, gy); ctx.rotate(rm ? 0 : Math.sin(clock * 1.7) * 0.08); ctx.scale(sc, sc);
        ctx.drawImage(gift, -gs / 2, -gh / 2, gs, gh); ctx.restore();
      }
      // completion: a glint runs along the full candy cane once
      if (hudDoneT >= 0 && !showRain && !rm) { const p = (clock - hudDoneT - 0.3) / 1.2; if (p > 0 && p < 1) { ctx.save(); ctx.globalCompositeOperation = 'screen'; accent(gx0 + gw * eo(p), (gy0 + gy1) / 2, 8, Math.sin(Math.PI * p), rm); ctx.restore(); } }
      // each viewer who claims a rain box: a little gift pops out of the bar and flies into the house
      for (let i = hudFly.length - 1; i >= 0; i--) {
        const fl = hudFly[i], p = (clock - fl.t0) / 0.9; if (p >= 1 || !gift) { hudFly.splice(i, 1); continue; }
        const sx = cx - bw / 2 - 62 * 0.62 - 14, sy0 = cy - 10, ex = W / 2, ey = g.topY + 40;
        const x = sx + (ex - sx) * eo(p), y = sy0 + (ey - sy0) * p - Math.sin(Math.PI * p) * 140, s2 = 46 * (1 - 0.45 * p);
        ctx.save(); ctx.globalAlpha = 1 - clamp((p - 0.8) / 0.2); ctx.translate(x, y); ctx.rotate((rm ? 0 : 1) * p * 2.4); ctx.drawImage(gift, -s2 / 2, -s2 / 2, s2, s2 * gift.height / gift.width); ctx.restore();
        ctx.save(); ctx.globalAlpha = clamp(1 - p) ; ctx.font = font(18, 700); ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = '#4a200e'; ctx.strokeText(fl.name, x, y - 32); ctx.fillStyle = '#fff8ea'; ctx.fillText(fl.name, x, y - 32); ctx.restore();
      }
    }
    function fitText(txt, maxW, size, w8) { let sz = size; ctx.font = font(sz, w8); while (sz > 14 && ctx.measureText(txt).width > maxW) { sz -= 2; ctx.font = font(sz, w8); } return sz; }
    function drawCeleb(c, a) {
      const B = theme.banners && theme.banners[c.kind], im = B && imgs[B.img];
      if (im) {
        const rm = RM(), w = B.w, h = im.height * w / im.width, cx = W / 2, cy = 832;
        const k = rm ? 1 : spring(clamp(c.t / 0.7), 1.6, 5.5), drop = rm ? 0 : (1 - eo(clamp(c.t / 0.45))) * -140;
        const sway = rm ? 0 : Math.sin(c.t * 2.2) * 0.02 * Math.exp(-c.t * 0.6);
        ctx.save(); ctx.globalAlpha = a;
        // soft warm glow behind the banner
        ctx.save(); ctx.globalCompositeOperation = 'screen'; const gg = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.62);
        gg.addColorStop(0, rgba(IVORY, 0.32 * a)); gg.addColorStop(0.5, rgba(CARAMEL, 0.12 * a)); gg.addColorStop(1, rgba(CARAMEL, 0)); ctx.fillStyle = gg; ctx.fillRect(cx - w, cy - w, w * 2, w * 2); ctx.restore();
        ctx.translate(cx, cy + drop); ctx.rotate(sway); ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
        ctx.drawImage(im, -w / 2, -h / 2, w, h);
        if (B.medal && c.set) icon(c.set, (B.medal[0] - 0.5) * w, (B.medal[1] - 0.5) * h, B.medal[2] * w * 0.95);
        const tx = (B.text[0] - 0.5) * w, ty = (B.text[1] - 0.5) * h, tw = B.tw * w;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        let sz = fitText(c.top, tw, 28, 600); ctx.fillStyle = '#5e2a14'; ctx.fillText(c.top, tx, ty - 26);
        sz = fitText(c.big, tw, c.kind === 'channel' ? 40 : 48, 700); ctx.lineJoin = 'round'; ctx.lineWidth = 8; ctx.strokeStyle = '#5e2a14'; ctx.strokeText(c.big, tx, ty + 18);
        ctx.fillStyle = c.kind === 'master' ? '#ffe39a' : '#fff8ea'; ctx.fillText(c.big, tx, ty + 18);
        ctx.restore();
        // sugar glints around the banner: each enters, peaks and vanishes on its own clock
        if (!rm) for (let i = 0; i < (c.kind === 'set' ? 6 : 10); i++) {
          const t0 = 0.25 + i * 0.27 + (i % 3) * 0.07, e = envP(c.t, t0, 0.8); if (e <= 0) continue;
          const ang = i * 2.39996 + 0.6, x = cx + Math.cos(ang) * w * 0.55, y = cy + drop + Math.sin(ang) * h * 0.62 - 10 * (c.t - t0);
          ctx.save(); ctx.globalCompositeOperation = 'screen'; accent(x, y, c.kind === 'master' ? 7 : 5.5, e * a, rm); ctx.restore();
        }
        return;
      }
      const C = theme.colors; ctx.save(); ctx.globalAlpha = a;
      const y = 300 + (1 - spring(clamp(c.t / 0.6))) * -200;
      ctx.fillStyle = c.col; ctx.strokeStyle = '#fff8ea'; ctx.lineWidth = 8; rr(110, y - 80, 780, 160, 40); ctx.fill(); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff8ea';
      ctx.font = font(30, 600); ctx.fillText(c.top, W / 2, y - 34); ctx.font = font(54); ctx.fillText(c.big, W / 2, y + 22);
      for (let i = 0; i < 24; i++) { const ang = i / 24 * Math.PI * 2 + c.t, r = 420 * eo(clamp(c.t / 1.2)); star(W / 2 + Math.cos(ang) * r, y + Math.sin(ang) * r * 0.5, 14, 1 - clamp((c.t - 1.4) / 0.8)); }
      ctx.restore();
    }

    function drawHud(g) {
      const C = theme.colors;
      if (theme.hud && imgs[theme.hud.bar]) drawCookieHud(g);
      else
      // community bar
      if (cfg.community) {
        const f = theme.items.filter(i => S.community.found[i.id]).length - pendingComm, n = theme.items.length;
        const x0 = 240, y0 = 1052, w = 520;
        ctx.fillStyle = 'rgba(16,18,40,0.75)'; rr(x0, y0, w, 36, 18); ctx.fill();
        ctx.fillStyle = S.community.done ? '#2fb8b0' : C.gold; rr(x0 + 4, y0 + 4, Math.max(28, (w - 8) * f / n), 28, 14); ctx.fill();
        ctx.fillStyle = '#fff8ea'; ctx.font = font(20); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText((S.community.done && !pendingComm ? 'CHANNEL COLLECTION COMPLETE · ' : 'CHANNEL COLLECTION · ') + f + '/' + n, W / 2, y0 + 19);
      }
      // rain banner
      if (rain && clock < rain.until && !(theme.hud && imgs[theme.hud.bar])) {
        const left = Math.ceil(rain.until - clock);
        pill(W / 2, 1000 - g.bh - g.lh - 10 > 260 ? 260 : 250, 'BOX RAIN · type ' + cfg.openCmd + ' · ' + left + 's', '#3f8fe0', '#fff', 30, 22, 10);
      }
      // queue
      if (queue.length) pill(W - 120, 1070, '+' + queue.length + ' in line', 'rgba(16,18,40,0.8)', '#fff8ea', 20, 14, 6);
      // idle hint
      if (!cur && !panel && cfg.showHint && clock - lastIdle > cfg.hintDelay) {
        const a = clamp((clock - lastIdle - cfg.hintDelay) / 0.6);
        ctx.save(); ctx.globalAlpha = a * (0.85 + 0.15 * Math.sin(clock * 3));
        pill(W / 2, 330, cfg.hint || ('type ' + cfg.openCmd + ' to open a ' + theme.boxWord), '#fff8ea', '#8f1c22', 30, 24, 12);
        ctx.restore();
      }
      // toasts
      let ty = 990;
      for (let i = toasts.length - 1; i >= 0; i--) {
        const tt = toasts[i]; if (celeb) break; if (tt.t0 === null) tt.t0 = clock; const age = clock - tt.t0;
        if (age > 4) { toasts.splice(i, 1); continue; }
        ctx.save(); ctx.globalAlpha = clamp(age / 0.2) * (1 - clamp((age - 3.6) / 0.4)); pill(W / 2, ty - 300, tt.text, tt.col, '#fff', 24, 18, 8); ctx.restore(); ty -= 50;
      }
    }

    // ---------- main loop
    function update(dt) {
      clock += dt;
      if (!ready) return;
      if (cur) {
        const prev = cur.t; cur.t += dt; const t = cur.t;
        if (prev < 0.25 && t >= 0.25) { sfxWarm(); sfx('shake', SFX.shake); }
        if (prev < T_POP && t >= T_POP) sfx('pop', SFX.pop);
        if (prev < T_POP + 0.5 && t >= T_POP + 0.5) {
          const r = cur.entry.res; sfx('reveal_' + r.item.rarity, () => SFX.reveal(r.item.rarity));
          if (r.shiny) sfx('shiny', SFX.shiny, 0.15);
          if (!r.isNew) sfx('crumbs', null, 0.7);
          if (r.commNew && !r.commDone && theme.hud) sfx('bar_tick', null, 0.45);
        }
        const end = T_POP + 1.0 + cur.hold + 1.1;
        if (prev < T_POP + 1.2 && t >= T_POP + 1.2) {
          const r = cur.entry.res;
          if (r.setDone) celebs.push({ kind: 'set', set: r.setDone.id, top: cur.entry.name + ' completed', big: r.setDone.name.toUpperCase() + '!', col: '#2f8a5a', t: 0 });
          if (r.allDone) celebs.push({ kind: 'master', top: cur.entry.name + ' found them ALL', big: 'MASTER COLLECTOR!', col: '#c8323c', t: 0 });
          if (r.commDone) { celebs.push({ kind: 'channel', top: 'the whole chat completed', big: 'THE COLLECTION!', col: '#3f8fe0', t: 0 }); if (cfg.communityRain) startRain(cfg.rainSecs, ''); }
        }
        if (t >= end) { cur = null; lastIdle = clock; }
      } else if (!panel && !celeb && queue.length) { startOpen(queue.shift()); }
      if (!panel && panels.length && !cur) { panel = Object.assign(panels.shift(), { t: 0 }); sfx('collection'); }
      if (panel) { panel.t += dt; if (panel.t > cfg.panelSecs) { panel = null; lastIdle = clock; } }
      if (!celeb && celebs.length) { celeb = celebs.shift(); sfx(celeb.kind, SFX.fanfare); }
      if (celeb) { if (celeb.dur === undefined) celeb.dur = cfg.celebStyle === 'cinema' ? (queue.length ? 2.6 : 3.3) : 3.8; celeb.t += dt; if (celeb.t > celeb.dur) celeb = null; }
      if (rain && clock >= rain.until) { rain = null; sfx('rain_end'); }
    }
    function render() {
      ctx.clearRect(0, 0, W, H);
      if (!ready) return;
      const hidden = cfg.autoHide > 0 && !cur && !panel && !celeb && !queue.length && !rain && clock - lastIdle > cfg.autoHide;
      if (hidden) return;
      const g = boxGeo();
      ctx.save(); ctx.translate(W / 2, H); ctx.scale(cfg.scale, cfg.scale); ctx.translate(-W / 2, -H);
      if (cur && cur.t >= T_POP) {
        const u = cur.t - T_POP, closing = u > 1.0 + cur.hold + 0.4;
        if (!closing) drawBox(cur.t, g, 'lid');
        drawReveal(u, g);
        drawBox(cur.t, g, closing ? undefined : 'body');
        if ((cfg.fx === 'v2' || cfg.fx === 'v3' || cfg.fx === 'v4') && !closing) drawBoxFX(u, g, cfg.previewRarity || cur.entry.res.item.rarity);
        if (cfg.fx === 'v3' && !closing) drawFX3Front(u);
        drawBurst(u, g);
      } else { drawBox(cur ? cur.t : 0, g); if (cur && cfg.fx === 'v2') drawAnticipation(cur.t, g, cfg.previewRarity || cur.entry.res.item.rarity); if (cur && (cfg.fx === 'v3' || cfg.fx === 'v4')) drawAnticipation3(cur.t, g, cfg.previewRarity || cur.entry.res.item.rarity); }
      drawHud(g);
      ctx.restore();
      if (panel) drawPanel(panel, clamp(panel.t / 0.25) * (1 - clamp((panel.t - cfg.panelSecs + 0.3) / 0.3)));
      if (celeb && cfg.celebStyle === 'cinema' && theme.banners && imgs[(theme.banners[celeb.kind] || {}).img]) drawCinema(celeb);
      else if (celeb) drawCeleb(celeb, clamp(celeb.t / 0.15) * (1 - clamp((celeb.t - 3.35) / 0.45)));
    }
    let lastTs = null;
    function frame(ts) { if (lastTs === null) lastTs = ts; const dt = Math.min(0.1, (ts - lastTs) / 1000); lastTs = ts; update(dt); render(); requestAnimationFrame(frame); }
    if (!manual) requestAnimationFrame(frame);

    return {
      READY, onChat, onEvent, VERSION,
      tick(dt) { update(dt); render(); },
      state: () => S,
      setConfig(c) { Object.assign(cfg, c); },
      testOpen,
      debug: () => ({ ready, queue: queue.length, cur: cur ? { name: cur.entry.name, item: cur.entry.res.item.id, t: cur.t } : null, panel: panel && panel.key, rain: rain ? Math.ceil(rain.until - clock) : 0, celebs: celebs.length, celeb: celeb ? celeb.kind + '@' + celeb.t.toFixed(2) : null }),
      reset() { S = { v: 1, viewers: {}, community: { found: {}, done: false }, rewardId: S.rewardId }; persist(); },
    };
  }

  window.BlindBox = { create, DEFAULTS: DEF, VERSION, RARITIES: RAR };
})();
