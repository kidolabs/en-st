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
let state = { level: 'all', q: '' };
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
  $('#levels').style.display = name === 'home' ? '' : 'none';
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
    if (q && !t.title.toLowerCase().includes(q)) return false;
    return true;
  });
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

// ---------- TOPIC: episode sub-cards ----------
function renderTopic(slug) {
  const t = BY_SLUG[slug];
  if (!t) { location.hash = '#/'; return; }
  $('#topic-title').textContent = `${t.title} · ${t.count} tập`;
  const grid = $('#ep-grid');
  grid.innerHTML = '';
  t.episodes.forEach((e, i) => {
    grid.appendChild(makeCard(
      mediaUrl(t.level, t.slug, e.id, 'jpg'), e.title || e.id,
      `<div class="name ep-name">${i + 1}. ${escapeHtml(e.title || e.id)}</div>`,
      () => { location.hash = `#/p/${t.slug}/${i}`; }));
  });
  setBase('topic');
}

// ---------- PLAYER ----------
function renderPlayer(slug, index) {
  const t = BY_SLUG[slug];
  if (!t || !t.episodes[index]) { location.hash = '#/'; return; }
  renderTopic(slug);              // keep the episode grid rendered underneath the modal
  playing = { slug, index };
  $('#back-topic-name').textContent = t.title;
  renderRelated(t, index);
  openModal();
  loadEpisode(t, index);
}

function renderRelated(t, currentIndex) {
  const grid = $('#related-grid');
  grid.innerHTML = '';
  t.episodes.forEach((e, i) => {
    grid.appendChild(makeCard(
      mediaUrl(t.level, t.slug, e.id, 'jpg'), e.title || e.id,
      `<div class="name ep-name">${i + 1}. ${escapeHtml(e.title || e.id)}</div>`,
      () => loadEpisode(t, i),
      i === currentIndex));
  });
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
  // highlight active related card
  [...$('#related-grid').children].forEach((c, idx) => {
    c.classList.toggle('active', idx === i);
    if (idx === i) c.scrollIntoView({ block: 'nearest', inline: 'center' });
  });
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
function stopVideo() { const v = $('#video'); v.pause(); v.removeAttribute('src'); v.load(); }

// ---------- router ----------
function route() {
  const h = location.hash || '#/';
  const m = h.match(/^#\/(t|p)\/([^/]+)(?:\/(\d+))?/);
  if (!m) { closeModal(); setBase('home'); renderHome(); window.scrollTo(0, 0); return; }
  const [, kind, slug, idx] = m;
  if (kind === 't') { closeModal(); renderTopic(decodeURIComponent(slug)); window.scrollTo(0, 0); }
  else renderPlayer(decodeURIComponent(slug), Number(idx || 0));
}

// ---------- init ----------
function init() {
  $('#search').addEventListener('input', (e) => { state.q = e.target.value; renderHome(); });
  $('#back-home').addEventListener('click', () => { location.hash = '#/'; });
  $('#cc').addEventListener('click', toggleCC);
  $('#capsize').addEventListener('click', cycleCapSize);
  $('#loop').addEventListener('click', toggleLoop);
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
