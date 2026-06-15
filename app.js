// English Stories — kid video library. Vanilla JS, no build step.
// Media (mp4/vtt/jpg) live on Cloudflare R2; the site is on GitHub Pages.

// ⬇️ After creating the R2 bucket, set this to its public base URL (no trailing slash).
//    e.g. 'https://pub-xxxxxxxx.r2.dev'  or a custom domain like 'https://video.example.com'
const VIDEO_BASE = 'https://pub-0e0f52f13bb14693b0ce66f814b5e91c.r2.dev';

const $ = (s, r = document) => r.querySelector(s);
const mediaUrl = (level, slug, id, ext) => `${VIDEO_BASE}/media/L${level}/${slug}/${id}.${ext}`;

let CATALOG = [];
let state = { level: 'all', q: '' };
let current = { topic: null, index: 0 };

// ---------- Grid ----------
function visibleTopics() {
  const q = state.q.trim().toLowerCase();
  return CATALOG.filter((t) => {
    if (state.level !== 'all' && t.level !== Number(state.level)) return false;
    if (q && !t.title.toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderGrid() {
  const grid = $('#grid');
  const list = visibleTopics();
  grid.innerHTML = '';
  for (const t of list) {
    const card = document.createElement('button');
    card.className = 'card';
    card.type = 'button';
    card.innerHTML = `
      <img class="thumb" loading="lazy" alt="${escapeHtml(t.title)}"
           src="${mediaUrl(t.level, t.slug, t.thumb, 'jpg')}"
           onerror="this.style.visibility='hidden'">
      <div class="meta">
        <div class="name">${escapeHtml(t.title)}</div>
        <div class="count">${t.count} tập · Level ${t.level}</div>
      </div>`;
    card.addEventListener('click', () => openPlayer(t, 0));
    grid.appendChild(card);
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
    b.addEventListener('click', () => {
      state.level = val;
      renderLevels();
      renderGrid();
    });
    wrap.appendChild(b);
  }
}

// ---------- Player ----------
function openPlayer(topic, index) {
  current = { topic, index };
  $('#ep-title').textContent = topic.title;
  const ol = $('#ep-list');
  ol.innerHTML = '';
  topic.episodes.forEach((e, i) => {
    const li = document.createElement('li');
    li.textContent = `${i + 1}. ${e.title || e.id}`;
    li.addEventListener('click', () => loadEpisode(i));
    ol.appendChild(li);
  });
  $('#player').hidden = false;
  document.body.style.overflow = 'hidden';
  loadEpisode(index);
}

function loadEpisode(i) {
  const { topic } = current;
  current.index = i;
  const ep = topic.episodes[i];
  const video = $('#video');
  video.innerHTML = '';
  video.src = mediaUrl(topic.level, topic.slug, ep.id, 'mp4');

  const track = document.createElement('track');
  track.kind = 'captions';
  track.label = 'English';
  track.srclang = 'en';
  track.src = mediaUrl(topic.level, topic.slug, ep.id, 'vtt'); // VTT on R2 too (self-contained media)
  track.default = true;
  video.appendChild(track);

  video.load();
  video.play().catch(() => {});
  // apply current CC preference once the track is ready
  video.addEventListener('loadeddata', applyCC, { once: true });

  // highlight + nav state
  [...$('#ep-list').children].forEach((li, idx) => li.classList.toggle('active', idx === i));
  $('#prev').disabled = i === 0;
  $('#next').disabled = i === topic.episodes.length - 1;
  const active = $('#ep-list').children[i];
  if (active) active.scrollIntoView({ block: 'nearest' });
}

let ccOn = true;
function applyCC() {
  const tracks = $('#video').textTracks;
  if (tracks && tracks[0]) tracks[0].mode = ccOn ? 'showing' : 'hidden';
}
function toggleCC() {
  ccOn = !ccOn;
  const btn = $('#cc');
  btn.setAttribute('aria-pressed', String(ccOn));
  btn.textContent = ccOn ? 'CC phụ đề: BẬT' : 'CC phụ đề: TẮT';
  applyCC();
}

function closePlayer() {
  const v = $('#video');
  v.pause();
  v.removeAttribute('src');
  v.load();
  $('#player').hidden = true;
  document.body.style.overflow = '';
}

// ---------- helpers ----------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- wire up ----------
function init() {
  $('#search').addEventListener('input', (e) => { state.q = e.target.value; renderGrid(); });
  $('#close').addEventListener('click', closePlayer);
  $('#cc').addEventListener('click', toggleCC);
  $('#prev').addEventListener('click', () => loadEpisode(Math.max(0, current.index - 1)));
  $('#next').addEventListener('click', () => loadEpisode(Math.min(current.topic.episodes.length - 1, current.index + 1)));
  document.addEventListener('keydown', (e) => {
    if ($('#player').hidden) return;
    if (e.key === 'Escape') closePlayer();
    if (e.key === 'ArrowRight') $('#next').click();
    if (e.key === 'ArrowLeft') $('#prev').click();
  });
  $('#player').addEventListener('click', (e) => { if (e.target.id === 'player') closePlayer(); });

  fetch('data/catalog.json')
    .then((r) => r.json())
    .then((c) => {
      CATALOG = c.topics;
      renderLevels();
      renderGrid();
    })
    .catch((err) => { $('#grid').innerHTML = `<p class="empty">Lỗi tải danh sách 😢<br>${escapeHtml(err.message)}</p>`; });
}

document.addEventListener('DOMContentLoaded', init);
