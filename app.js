/* ============================================================
   CS HELPER — app.js
   Auth, routing, manifest loading, content rendering
   ============================================================ */

'use strict';

// ── CONFIG ───────────────────────────────────────────────
const AUTH = {
  admin: { password: '456755', role: 'admin' },
  user:  { password: '0455',   role: 'user'  }
};
const MANIFEST_URL = './app-manifest.yml';

// Base URL — directory where index.html lives
function getBaseUrl() {
  const path = window.location.pathname;
  // If path ends with a filename (e.g. /index.html), strip it
  const dir = path.substring(0, path.lastIndexOf('/') + 1);
  return window.location.origin + dir;
}
const BASE_URL = getBaseUrl();

function resolvePath(file) {
  const normalized = file.replace(/\\/g, '/');
  if (normalized.startsWith('http')) return normalized;
  // If it's already an absolute path relative to domain, return it
  if (normalized.startsWith('/')) return window.location.origin + normalized;
  
  // Resolve relative to BASE_URL
  return new URL(normalized, BASE_URL).href;
}

// ── STATE ────────────────────────────────────────────────
const State = {
  role: null,          // 'admin' | 'user'
  theme: 'dark',
  manifest: null,
  currentItem: null
};

// ── DOM REFS ─────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── THEME ────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('pmr-theme') || 'dark';
  setTheme(saved);
}
function setTheme(t) {
  State.theme = t;
  document.documentElement.setAttribute('data-theme', t);
  $('theme-toggle').textContent = t === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('pmr-theme', t);
}
function toggleTheme() {
  setTheme(State.theme === 'dark' ? 'light' : 'dark');
}

// ── AUTH ─────────────────────────────────────────────────
function initAuth() {
  const saved = sessionStorage.getItem('pmr-role');
  if (saved && AUTH[saved]) {
    State.role = saved;
    showApp();
  } else {
    $('login-screen').style.display = 'flex';
  }
}

function tryLogin() {
  const pw = $('login-pw').value.trim();
  let matched = null;
  for (const [role, cfg] of Object.entries(AUTH)) {
    if (cfg.password === pw) { matched = role; break; }
  }
  if (matched) {
    State.role = matched;
    sessionStorage.setItem('pmr-role', matched);
    $('login-screen').style.display = 'none';
    showApp();
  } else {
    $('login-error').textContent = 'Incorrect password';
    $('login-pw').value = '';
    $('login-pw').focus();
  }
}

function logout() {
  sessionStorage.removeItem('pmr-role');
  location.reload();
}

// ── APP INIT ─────────────────────────────────────────────
async function showApp() {
  // Update user indicator
  $('user-role-label').textContent = State.role === 'admin' ? 'Admin' : 'User';
  $('user-dot').style.background = State.role === 'admin' ? '#f5a623' : '#4caf50';

  // Admin-only elements
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = State.role === 'admin' ? '' : 'none';
  });

  // Load manifest
  try {
    const text = await fetch(MANIFEST_URL + '?v=' + Date.now()).then(r => r.text());
    
    // Check if js-yaml library is loaded
    const yamlLib = window.jsyaml || window.jsYaml;
    if (!yamlLib) {
      throw new Error('js-yaml library not found. Check if libs/js-yaml.min.js is loaded correctly.');
    }
    
    State.manifest = yamlLib.load(text);
    buildNav();
    showHome();
  } catch(e) {
    console.error('Manifest load failed', e);
    $('content-area').innerHTML = '<p class="empty-msg">Failed to load app manifest.</p>';
  }
}

// ── NAV BUILD ────────────────────────────────────────────
function buildNav(filter = '') {
  const nav = $('sidebar-nav');
  nav.innerHTML = '';
  const fl = filter.toLowerCase();

  for (const section of State.manifest.sections) {
    const items = section.items.filter(item => {
      if (State.role !== 'admin' && !item.visible) return false;
      if (!fl) return true;
      return item.title.toLowerCase().includes(fl) ||
             (item.tags || []).some(t => t.includes(fl));
    });
    if (!items.length) continue;

    const sec = document.createElement('div');
    sec.className = 'nav-section';
    sec.innerHTML = `
      <div class="nav-section-header" data-id="${section.id}">
        <span class="nav-section-icon">${section.icon}</span>
        <span>${section.title}</span>
        <span class="nav-section-chevron">▾</span>
      </div>
      <div class="nav-items"></div>
    `;
    const container = sec.querySelector('.nav-items');
    items.forEach(item => {
      const el = document.createElement('div');
      el.className = 'nav-item' + (!item.visible ? ' admin-only' : '');
      el.dataset.itemId = item.id;
      el.dataset.sectionId = section.id;
      el.innerHTML = `
        <span class="nav-item-type"></span>
        <span>${item.title}</span>
        ${!item.visible ? '<span style="margin-left:auto;font-size:10px;opacity:0.5">hidden</span>' : ''}
      `;
      el.addEventListener('click', () => openItem(section, item));
      container.appendChild(el);
    });

    sec.querySelector('.nav-section-header').addEventListener('click', () => {
      sec.classList.toggle('collapsed');
    });

    nav.appendChild(sec);
  }
}

// ── ROUTING ──────────────────────────────────────────────
function openItem(section, item) {
  State.currentItem = item;

  // Update active nav
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.itemId === item.id);
  });

  // Breadcrumb & title
  $('page-breadcrumb').innerHTML = `
    <span style="cursor:pointer" onclick="showHome()">Home</span>
    <span class="bc-sep">›</span>
    <span style="cursor:pointer" onclick="openSection('${section.id}')">${section.title}</span>
    <span class="bc-sep">›</span>
    <span>${item.title}</span>
  `;
  $('page-title-bar').textContent = item.title;

  // Close mobile sidebar
  $('sidebar').classList.remove('open');
  $('overlay').classList.remove('visible');

  // Render
  const area = $('content-area');
  if (item.type === 'calculator') {
    renderCalculator(item, area);
  } else if (item.type === 'icd') {
    renderICD(item, area);
  } else {
    renderMarkdown(item, area, section);
  }
}

function showHome() {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  $('page-breadcrumb').innerHTML = '';
  $('page-title-bar').textContent = 'CS Helper';
  State.currentItem = null;
  renderHome();
}

// ── RENDER: HOME ─────────────────────────────────────────
function renderHome() {
  if (!State.manifest) return;
  const area = $('content-area');
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  let cards = '';
  for (const section of State.manifest.sections) {
    const visibleItems = section.items.filter(i => State.role === 'admin' || i.visible);
    if (!visibleItems.length) continue;
    cards += `
      <div class="home-card" onclick="openSection('${section.id}')">
        <div class="home-card-icon">${section.icon}</div>
        <div class="home-card-title">${section.title}</div>
        <div class="home-card-count">${visibleItems.length} item${visibleItems.length !== 1 ? 's' : ''}</div>
      </div>
    `;
  }

  area.innerHTML = `
    <div id="home-screen">
      <div id="home-greeting">
        <h1>${greeting}</h1>
        <p>Cardiac Surgery Pocket Reference · ${now.toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long', year:'numeric'})}</p>
      </div>
      <div class="home-grid">${cards}</div>
    </div>
  `;
}

function openSection(sectionId) {
  const section = State.manifest.sections.find(s => s.id === sectionId);
  if (!section) return;
  renderSectionIndex(section);
}

function renderSectionIndex(section) {
  State.currentItem = null;
  const area = $('content-area');
  const visibleItems = section.items.filter(i => State.role === 'admin' || i.visible);

  // Update active nav (clear)
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

  $('page-breadcrumb').innerHTML = `
    <span style="cursor:pointer" onclick="showHome()">Home</span>
    <span class="bc-sep">›</span>
    <span>${section.title}</span>
  `;
  $('page-title-bar').textContent = section.title;

  let listHtml = '';
  visibleItems.forEach(item => {
    listHtml += `
      <div class="index-card" onclick="openItemById('${section.id}', '${item.id}')">
        <div class="index-card-title">${item.title}</div>
        <div class="index-card-tags">
          <span class="page-type-badge type-${item.type}">${item.type}</span>
          ${(item.tags || []).map(t => `<span class="tag">#${t}</span>`).join(' ')}
        </div>
      </div>
    `;
  });

  area.innerHTML = `
    <div id="section-index">
      <div class="index-grid">${listHtml}</div>
    </div>
  `;
}

function openItemById(sectionId, itemId) {
  const section = State.manifest.sections.find(s => s.id === sectionId);
  const item = section.items.find(i => i.id === itemId);
  if (section && item) openItem(section, item);
}

// ── RENDER: MARKDOWN ─────────────────────────────────────
async function renderMarkdown(item, area, section) {
  area.innerHTML = '<p class="loading-msg">Loading…</p>';
  try {
    const text = await fetch(resolvePath(item.file) + '?v=' + Date.now()).then(r => {
      if (!r.ok) throw new Error(r.status);
      return r.text();
    });
    const html = marked.parse(text);
    area.innerHTML = `
      <div id="page-view">
        <div class="page-header">
          <div>
            <span class="page-type-badge type-${item.type}">${item.type}</span>
          </div>
          <div style="flex:1"></div>
          ${State.role === 'admin' ? `<a href="redact.html?file=${encodeURIComponent(item.file)}" target="_blank" id="redact-link">✏️ Edit</a>` : ''}
        </div>
        <div class="md-body">${html}</div>
      </div>
    `;
  } catch(e) {
    console.error('Error loading markdown:', e, 'Path:', resolvePath(item.file));
    area.innerHTML = `<p class="empty-msg">Content not yet available.<br><small style="opacity:0.5">${item.file}</small><br><small style="opacity:0.3; font-size: 10px">${e.message || e}</small></p>`;
  }
}

// ── RENDER: CALCULATOR ───────────────────────────────────
function renderCalculator(item, area) {
  area.innerHTML = `
    <div id="page-view">
      <div class="page-header">
        <span class="page-type-badge type-calculator">calculator</span>
        ${State.role === 'admin' ? `<a href="redact.html?file=${encodeURIComponent(item.file)}" target="_blank" id="redact-link" style="margin-left:auto">✏️ Edit</a>` : ''}
      </div>
      <iframe id="calc-frame" src="${resolvePath(item.file)}" title="${item.title}"></iframe>
    </div>
  `;
}

// ── RENDER: ICD ──────────────────────────────────────────
async function renderICD(item, area) {
  area.innerHTML = '<p class="loading-msg">Loading codes…</p>';
  let data;
  try {
    data = await fetch(resolvePath(item.file) + '?v=' + Date.now()).then(r => r.json());
  } catch(e) {
    area.innerHTML = '<p class="empty-msg">ICD database not yet available.</p>';
    return;
  }

  area.innerHTML = `
    <div id="icd-view">
      <div class="page-header">
        <span class="page-type-badge type-icd">ICD-9</span>
        <h2 style="font-size:18px;font-weight:600;margin:0">${item.title}</h2>
        ${State.role === 'admin' ? `<a href="redact.html?file=${encodeURIComponent(item.file)}" target="_blank" id="redact-link" style="margin-left:auto">✏️ Edit</a>` : ''}
      </div>
      <div id="icd-search-bar">
        <input id="icd-search-input" type="text" placeholder="Search code or description…" autocomplete="off">
      </div>
      <div class="icd-results" id="icd-results"></div>
    </div>
  `;

  const input = $('icd-search-input');
  renderICDResults(data, '');
  input.addEventListener('input', () => renderICDResults(data, input.value));
  input.focus();
}

function renderICDResults(data, query) {
  const container = $('icd-results');
  const q = query.toLowerCase().trim();
  let html = '';

  for (const category of data.categories) {
    const items = category.items.filter(item =>
      !q || item.code.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)
    );
    if (!items.length) continue;
    html += `<div class="icd-category-header">${category.name}</div>`;
    for (const item of items) {
      const code = q ? highlight(item.code, q) : item.code;
      const desc = q ? highlight(item.description, q) : item.description;
      html += `<div class="icd-item"><span class="icd-code">${code}</span><span class="icd-desc">${desc}</span></div>`;
    }
  }

  if (!html) {
    html = `<div class="icd-no-results">No codes found for "${query}"</div>`;
  }
  container.innerHTML = html;
}

function highlight(text, q) {
  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return text.replace(re, '<mark>$1</mark>');
}

// ── SIDEBAR SEARCH ───────────────────────────────────────
$('sidebar-search').addEventListener('input', e => {
  buildNav(e.target.value.trim());
});

// ── MOBILE SIDEBAR ───────────────────────────────────────
$('menu-toggle').addEventListener('click', () => {
  $('sidebar').classList.add('open');
  $('overlay').classList.add('visible');
});
$('overlay').addEventListener('click', () => {
  $('sidebar').classList.remove('open');
  $('overlay').classList.remove('visible');
});

// ── LOGIN ────────────────────────────────────────────────
$('login-btn').addEventListener('click', tryLogin);
$('login-pw').addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });

// ── THEME ────────────────────────────────────────────────
$('theme-toggle').addEventListener('click', toggleTheme);

// ── BOOT ─────────────────────────────────────────────────
initTheme();
initAuth();

// PWA service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.onupdatefound = () => {
        const installingWorker = reg.installing;
        installingWorker.onstatechange = () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New content is available, but wait for user to refresh
            console.log('New content is available; please refresh.');
            if (confirm('New version available! Refresh now?')) {
              location.reload();
            }
          }
        };
      };
    }).catch(() => {});
  });
}