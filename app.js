// English Stories — kid video library. Vanilla JS, hash-routed 3-level navigation:
//   #/            → home (topic cards)
//   #/t/{slug}    → topic page (episode sub-cards, thumbnail per episode)
//   #/p/{slug}/{i}→ player (video + Trước/Sau + Lặp + related cards, autoplay-next)
// Media (mp4/vtt/jpg) live on Cloudflare R2; site on GitHub Pages.

const VIDEO_BASE = 'https://pub-0e0f52f13bb14693b0ce66f814b5e91c.r2.dev';

const $ = (s, r = document) => r.querySelector(s);
const mediaUrl = (level, slug, id, ext) => `${VIDEO_BASE}/media/L${level}/${slug}/${id}.${ext}`;
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let CATALOG = [];
let BY_SLUG = {};
let state = { level: '1', q: '' };   // default view = Level 1
let ccOn = false;            // subtitles OFF by default
let loopOn = false;
let capLevel = 0;            // caption size: 0=Vừa, 1=Lớn, 2=Rất lớn
const CAP_SIZES = [
  { cls: '', label: 'Vừa' },
  { cls: 'cap-lg', label: 'Lớn' },
  { cls: 'cap-xl', label: 'Rất lớn' },
];
let playing = { slug: null, index: 0 };

// Base view = 'home' or 'topic' (mutually exclusive). The player is a modal overlay on top.
function setBase(name) {
  $('#home-view').hidden = name !== 'home';
  $('#topic-view').hidden = name !== 'topic';
  $('#search').style.display = name === 'home' ? '' : 'none';
}
function openModal() {
  $('#player-view').hidden = false;
  document.body.classList.add('modal-open');
}
function closeModal() {
  $('#player-view').hidden = true;
  document.body.classList.remove('modal-open');
  stopVideo();
}

// ---------- HOME: topic cards ----------
function visibleTopics() {
  const q = state.q.trim().toLowerCase();
  return CATALOG.filter((t) => {
    if (state.level !== 'all' && t.level !== Number(state.level)) return false;
    return !q || t.title.toLowerCase().includes(q);
  });
}

function renderLevels() {
  const wrap = $('#levels');
  const levels = [...new Set(CATALOG.map((t) => t.level))].sort((a, b) => a - b);
  const buttons = [['all', 'Tất cả'], ...levels.map((l) => [String(l), `Level ${l}`])];
  wrap.innerHTML = '';
  for (const [val, label] of buttons) {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = state.level === val ? 'active' : '';
    b.addEventListener('click', () => { state.level = val; renderLevels(); renderHome(); });
    wrap.appendChild(b);
  }
}

function makeCard(imgUrl, alt, nameHtml, onClick, active) {
  const card = document.createElement('button');
  card.className = 'card' + (active ? ' active' : '');
  card.type = 'button';
  card.innerHTML = `
    <img class="thumb" loading="lazy" alt="${escapeHtml(alt)}" src="${imgUrl}" onerror="this.style.visibility='hidden'">
    <div class="meta">${nameHtml}</div>`;
  card.addEventListener('click', onClick);
  return card;
}

function renderHome() {
  const grid = $('#grid');
  const list = visibleTopics();
  grid.innerHTML = '';
  for (const t of list) {
    grid.appendChild(makeCard(
      mediaUrl(t.level, t.slug, t.thumb, 'jpg'), t.title,
      `<div class="name">${escapeHtml(t.title)}</div><div class="count">${t.count} tập · Level ${t.level}</div>`,
      () => { location.hash = `#/t/${t.slug}`; }));
  }
  $('#empty').hidden = list.length > 0;
}

// ---------- TOPIC: episode sub-cards (with in-topic search) ----------
let curTopic = null;
function renderTopic(slug) {
  const t = BY_SLUG[slug];
  if (!t) { location.hash = '#/'; return; }
  curTopic = t;
  $('#topic-title').textContent = `${t.title} · ${t.count} tập`;
  $('#ep-search').value = '';
  renderEpisodes('');
  setBase('topic');
}
function renderEpisodes(q) {
  const t = curTopic;
  if (!t) return;
  const ql = (q || '').trim().toLowerCase();
  const grid = $('#ep-grid');
  grid.innerHTML = '';
  t.episodes.forEach((e, i) => {
    const title = e.title || e.id;               // keep ORIGINAL index i for the player link
    if (ql && !title.toLowerCase().includes(ql)) return;
    grid.appendChild(makeCard(
      mediaUrl(t.level, t.slug, e.id, 'jpg'), title,
      `<div class="name ep-name">${i + 1}. ${escapeHtml(title)}</div>`,
      () => { location.hash = `#/p/${t.slug}/${i}`; }));
  });
}

// ---------- PLAYER ----------
function renderPlayer(slug, index) {
  const t = BY_SLUG[slug];
  if (!t || !t.episodes[index]) { location.hash = '#/'; return; }
  renderTopic(slug);              // keep the episode grid rendered underneath the modal
  playing = { slug, index };
  $('#back-topic-name').textContent = t.title;
  openModal();
  loadEpisode(t, index);
}

function loadEpisode(t, i) {
  playing = { slug: t.slug, index: i };
  const ep = t.episodes[i];
  const video = $('#video');
  video.innerHTML = '';
  video.src = mediaUrl(t.level, t.slug, ep.id, 'mp4');

  const track = document.createElement('track');
  track.kind = 'captions'; track.label = 'English'; track.srclang = 'en';
  track.src = mediaUrl(t.level, t.slug, ep.id, 'vtt'); track.default = true;
  video.appendChild(track);

  video.load();
  video.play().catch(() => {});
  video.addEventListener('loadeddata', applyCC, { once: true });

  $('#now-playing').textContent = `${i + 1}. ${ep.title || ep.id}`;
  $('#prev').disabled = i === 0;
  $('#next').disabled = i === t.episodes.length - 1;
  const want = `#/p/${t.slug}/${i}`;
  if (location.hash !== want) history.replaceState(null, '', want);
}

function applyCC() {
  const tt = $('#video').textTracks;
  if (tt && tt[0]) tt[0].mode = ccOn ? 'showing' : 'hidden';
}
function toggleCC() {
  ccOn = !ccOn;
  const b = $('#cc');
  b.setAttribute('aria-pressed', String(ccOn));
  b.textContent = ccOn ? 'CC phụ đề: BẬT' : 'CC phụ đề: TẮT';
  $('#capsize').hidden = !ccOn;     // size button only relevant when captions on
  applyCC();
}
function applyCapSize() {
  const v = $('#video');
  v.classList.remove('cap-lg', 'cap-xl');
  if (CAP_SIZES[capLevel].cls) v.classList.add(CAP_SIZES[capLevel].cls);
  $('#capsize').textContent = `🔠 Cỡ chữ: ${CAP_SIZES[capLevel].label}`;
}
function cycleCapSize() {
  capLevel = (capLevel + 1) % CAP_SIZES.length;
  applyCapSize();
}
function toggleLoop() {
  loopOn = !loopOn;
  const b = $('#loop');
  b.setAttribute('aria-pressed', String(loopOn));
  b.textContent = loopOn ? '🔁 Lặp: BẬT' : '🔁 Lặp: TẮT';
}
function step(delta) {
  const t = BY_SLUG[playing.slug];
  const ni = Math.min(t.episodes.length - 1, Math.max(0, playing.index + delta));
  if (ni !== playing.index) loadEpisode(t, ni);
}
// On end: loop same episode, else auto-play next within the SAME topic.
function onEnded() {
  if ($('#player-view').hidden) return;
  const t = BY_SLUG[playing.slug];
  if (!t) return;
  if (loopOn) { const v = $('#video'); v.currentTime = 0; v.play().catch(() => {}); return; }
  if (playing.index < t.episodes.length - 1) loadEpisode(t, playing.index + 1);
}
function goFullscreen() {
  const v = $('#video');
  if (v.requestFullscreen) v.requestFullscreen();
  else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();   // iOS Safari (video-only fullscreen)
  else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
}
function stopVideo() { const v = $('#video'); v.pause(); v.removeAttribute('src'); v.load(); }

// ---------- AUDIO: passive-listening player (MP3), scoped to ONE story ----------
let audioSource = [];      // episodes of the story currently opened for listening
let aQueue = [];           // current playlist
let aIndex = 0;
let aLoop = true;          // loop whole queue (all-day immersion)
let audioCurrentList = []; // currently filtered list in the picker

function topicQueue(t) {
  return t.episodes.map((e) => ({ level: t.level, slug: t.slug, id: e.id, title: e.title || e.id, story: t.title }));
}
function audioFiltered(q) {
  const ql = (q || '').trim().toLowerCase();
  if (!ql) return audioSource;
  return audioSource.filter((e) => e.title.toLowerCase().includes(ql));
}
function renderAudioList(q) {
  const list = audioFiltered(q);
  audioCurrentList = list;
  $('#audio-count').textContent = `${list.length} tập`;
  const ol = $('#audio-list');
  const frag = document.createDocumentFragment();
  list.forEach((e, i) => {
    const li = document.createElement('li');
    li.className = 'audio-item';
    li.innerHTML = `<span class="ai-num">${i + 1}</span><span class="ai-text">${escapeHtml(e.title)}</span><span class="ai-play">▶</span>`;
    li.addEventListener('click', () => playQueue(list, i));
    frag.appendChild(li);
  });
  ol.innerHTML = '';
  ol.appendChild(frag);
}
function openAudioModal(t) {
  if (!t) return;
  audioSource = topicQueue(t);
  $('#audio-modal-title').textContent = `🎧 Nghe: ${t.title}`;
  $('#audio-search').value = '';
  renderAudioList('');
  $('#audio-modal').hidden = false;
  document.body.classList.add('modal-open');
}
function closeAudioModal() {
  $('#audio-modal').hidden = true;
  if ($('#player-view').hidden) document.body.classList.remove('modal-open');
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function playQueue(list, startIdx) {
  if (!list || !list.length) return;
  aQueue = list.slice();
  aIndex = Math.max(0, startIdx | 0);
  $('#audio-bar').hidden = false;
  closeAudioModal();
  audioPlayAt(aIndex);
}
function audioPlayAt(i) {
  if (!aQueue.length) return;
  if (i < 0) i = aLoop ? aQueue.length - 1 : 0;
  if (i >= aQueue.length) { if (aLoop) i = 0; else { $('#ab-play').textContent = '▶️'; return; } }
  aIndex = i;
  const ep = aQueue[i];
  const audio = $('#audio');
  audio.src = mediaUrl(ep.level, ep.slug, ep.id, 'mp3');
  audio.play().catch(() => {});
  $('#ab-title').textContent = `${ep.story} — ${ep.title}`;
  $('#ab-play').textContent = '⏸';
  setMediaSession(ep);
}
function audioNext() { audioPlayAt(aIndex + 1); }
function audioPrev() { audioPlayAt(aIndex - 1); }
function audioTogglePlay() {
  const audio = $('#audio');
  if (!audio.src) return;
  if (audio.paused) audio.play().catch(() => {}); else audio.pause();
}
function audioStop() {
  const audio = $('#audio');
  audio.pause(); audio.removeAttribute('src'); audio.load();
  $('#audio-bar').hidden = true;
}
function toggleAudioLoop() {
  aLoop = !aLoop;
  const b = $('#ab-loop');
  b.setAttribute('aria-pressed', String(aLoop));
  b.classList.toggle('ab-on', aLoop);
}
function setMediaSession(ep) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: ep.title, artist: ep.story, album: 'English Stories',
      artwork: [{ src: mediaUrl(ep.level, ep.slug, ep.id, 'jpg'), sizes: '512x512', type: 'image/jpeg' }],
    });
    navigator.mediaSession.setActionHandler('previoustrack', audioPrev);
    navigator.mediaSession.setActionHandler('nexttrack', audioNext);
    navigator.mediaSession.setActionHandler('play', audioTogglePlay);
    navigator.mediaSession.setActionHandler('pause', audioTogglePlay);
  } catch {}
}

// ---------- ROADMAP view (curated learning path) ----------
const ROADMAP = [
  { title: '1. Khởi động & tắm ngôn ngữ', desc: 'Nghe nhiều + truyện ngắn dễ nhất, xem lại nhiều lần. Phụ đề TẮT.',
    slugs: ['hello-cupcake', 'my-first-readers-1', 'who-am-i', 'where-am-i', 'the-blobs', 'dino-buddies'] },
  { title: '2. Nền chữ & vần', desc: 'Nhận mặt chữ cái và nhóm vần (tiền phonics).',
    slugs: ['abc-book', 'word-families', 'letter-teams'] },
  { title: '3. Phonics — tập đánh vần', desc: 'Đánh vần để bắt đầu tự đọc. Lúc này BẬT phụ đề cỡ lớn.',
    slugs: ['phonics-i', 'phonics-ii'] },
  { title: '4. Đọc trôi chảy — Readers', desc: 'Bộ readers tăng dần độ khó.',
    slugs: ['my-first-readers-1', 'my-first-readers-2', 'my-first-readers-3', 'bird-and-kip', 'sam-and-lucky', 'south-street-school'] },
  { title: '5. Truyện cổ tích', desc: 'Cổ tích kinh điển — vừa học vừa mê.',
    slugs: ['cinderella', 'snow-white-and-the-seven-dwarfs', 'rapunzel', 'beauty-and-the-beast', 'jack-and-the-beanstalk', 'puss-in-boots', 'the-velveteen-rabbit'] },
];

function renderRoadmap() {
  const road = $('#road');
  road.innerHTML = '';
  for (const stage of ROADMAP) {
    const sec = document.createElement('div');
    sec.className = 'road-stage';
    sec.innerHTML = `<h2 class="road-title">${escapeHtml(stage.title)}</h2><p class="road-desc">${escapeHtml(stage.desc)}</p>`;
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const slug of stage.slugs) {
      const t = BY_SLUG[slug];
      if (!t) continue;
      grid.appendChild(makeCard(
        mediaUrl(t.level, t.slug, t.thumb, 'jpg'), t.title,
        `<div class="name">${escapeHtml(t.title)}</div><div class="count">${t.count} tập · Level ${t.level}</div>`,
        () => { location.hash = `#/t/${t.slug}`; }));
    }
    sec.appendChild(grid);
    road.appendChild(sec);
  }
}

let homeMode = 'level';
function setHomeMode(mode) {
  homeMode = mode;
  const lvl = mode === 'level';
  $('#tab-level').classList.toggle('active', lvl);
  $('#tab-road').classList.toggle('active', !lvl);
  $('#levels').hidden = !lvl;
  $('#grid').hidden = !lvl;
  $('#road').hidden = lvl;
  if (lvl) renderHome(); else { $('#empty').hidden = true; renderRoadmap(); }
}

function openAdvice() { $('#advice-modal').hidden = false; document.body.classList.add('modal-open'); }
function closeAdvice() {
  $('#advice-modal').hidden = true;
  if ($('#player-view').hidden && $('#audio-modal').hidden) document.body.classList.remove('modal-open');
}

// ---------- router ----------
function route() {
  const h = location.hash || '#/';
  const m = h.match(/^#\/(t|p)\/([^/]+)(?:\/(\d+))?/);
  if (!m) { closeModal(); setBase('home'); setHomeMode(homeMode); window.scrollTo(0, 0); return; }
  const [, kind, slug, idx] = m;
  if (kind === 't') { closeModal(); renderTopic(decodeURIComponent(slug)); window.scrollTo(0, 0); }
  else renderPlayer(decodeURIComponent(slug), Number(idx || 0));
}

// ---------- access gate (casual privacy) ----------
const GATE_CODE = '160925';
function setupGate() {
  const gate = $('#gate');
  if (localStorage.getItem('es_gate') === 'ok') { gate.hidden = true; return; }
  $('#gate-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if ($('#gate-input').value.trim() === GATE_CODE) {
      localStorage.setItem('es_gate', 'ok');
      gate.hidden = true;
    } else {
      $('#gate-err').hidden = false;
      $('#gate-input').value = '';
      $('#gate-input').focus();
    }
  });
  setTimeout(() => $('#gate-input').focus(), 50);
}

// ---------- init ----------
function init() {
  setupGate();
  $('#search').addEventListener('input', (e) => { state.q = e.target.value; if (homeMode !== 'level') setHomeMode('level'); else renderHome(); });
  $('#ep-search').addEventListener('input', (e) => renderEpisodes(e.target.value));
  $('#tab-level').addEventListener('click', () => setHomeMode('level'));
  $('#tab-road').addEventListener('click', () => setHomeMode('road'));
  $('#open-advice').addEventListener('click', openAdvice);
  $('#close-advice').addEventListener('click', closeAdvice);
  $('#advice-modal').addEventListener('click', (e) => { if (e.target.id === 'advice-modal') closeAdvice(); });
  $('#back-home').addEventListener('click', () => { location.hash = '#/'; });
  $('#cc').addEventListener('click', toggleCC);
  $('#capsize').addEventListener('click', cycleCapSize);
  $('#loop').addEventListener('click', toggleLoop);
  $('#fs').addEventListener('click', goFullscreen);
  $('#prev').addEventListener('click', () => step(-1));
  $('#next').addEventListener('click', () => step(1));
  $('#video').addEventListener('ended', onEnded);
  const dismiss = () => { location.hash = playing.slug ? `#/t/${playing.slug}` : '#/'; };
  $('#close-modal').addEventListener('click', dismiss);
  $('#player-view').addEventListener('click', (e) => { if (e.target.id === 'player-view') dismiss(); });
  document.addEventListener('keydown', (e) => {
    if ($('#player-view').hidden) return;
    if (e.key === 'Escape') dismiss();
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
  });
  window.addEventListener('hashchange', route);

  // audio (listening) controls — opened from inside a story
  $('#listen-topic').addEventListener('click', () => openAudioModal(curTopic));
  $('#listen-from-player').addEventListener('click', () => {   // quick: pause video, play THIS episode's audio now
    $('#video').pause();
    const t = BY_SLUG[playing.slug];
    if (t) playQueue(topicQueue(t), playing.index);
  });
  $('#close-audio').addEventListener('click', closeAudioModal);
  $('#audio-modal').addEventListener('click', (e) => { if (e.target.id === 'audio-modal') closeAudioModal(); });
  $('#audio-search').addEventListener('input', (e) => renderAudioList(e.target.value));
  $('#play-all').addEventListener('click', () => playQueue(audioCurrentList, 0));
  $('#shuffle-all').addEventListener('click', () => playQueue(shuffle(audioCurrentList), 0));
  $('#ab-prev').addEventListener('click', audioPrev);
  $('#ab-next').addEventListener('click', audioNext);
  $('#ab-play').addEventListener('click', audioTogglePlay);
  $('#ab-loop').addEventListener('click', toggleAudioLoop);
  $('#ab-stop').addEventListener('click', audioStop);
  $('#audio').addEventListener('ended', audioNext);
  $('#audio').addEventListener('play', () => { $('#ab-play').textContent = '⏸'; });
  $('#audio').addEventListener('pause', () => { $('#ab-play').textContent = '▶️'; });

  fetch('data/catalog.json')
    .then((r) => r.json())
    .then((c) => {
      CATALOG = c.topics;
      BY_SLUG = Object.fromEntries(CATALOG.map((t) => [t.slug, t]));
      renderLevels();
      route();
    })
    .catch((err) => { $('#grid').innerHTML = `<p class="empty">Lỗi tải danh sách 😢<br>${escapeHtml(err.message)}</p>`; });
}

document.addEventListener('DOMContentLoaded', init);
