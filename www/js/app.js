/* The Zambian Economist app: screens and behaviour. */
(function () {
  'use strict';

  const ZE = window.ZE;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // ---------- native bridge helpers ----------
  const Cap = window.Capacitor;
  const isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  const pluginCache = {};
  function plugin(name) {
    if (!isNative) return null;
    if (pluginCache[name]) return pluginCache[name];
    let p = null;
    if (window.capacitorExports && window.capacitorExports.registerPlugin) {
      try { p = window.capacitorExports.registerPlugin(name); } catch (e) { p = null; }
    }
    if (!p && Cap.Plugins) p = Cap.Plugins[name] || null;
    pluginCache[name] = p;
    return p;
  }

  function openExternal(url) {
    if (!url) return;
    const Browser = plugin('Browser');
    if (Browser) {
      Browser.open({ url, toolbarColor: '#181F63' }).catch(() => { window.location.href = url; });
    } else {
      window.open(url, '_blank', 'noopener');
    }
  }

  // ---------- preferences ----------
  const PREF_KEY = 'ze.prefs';
  const prefs = Object.assign({ size: 1, theme: 'auto' }, readJSON(PREF_KEY, {}));
  function savePrefs() { writeJSON(PREF_KEY, prefs); }
  function readJSON(k, fallback) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage full */ } }

  const SIZES = [16, 18, 20, 23];
  function applyPrefs() {
    document.documentElement.style.setProperty('--reader-size', SIZES[prefs.size] + 'px');
    if (prefs.theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', prefs.theme);
    $$('#seg-size button').forEach(b => b.classList.toggle('on', +b.dataset.size === prefs.size));
    $$('#seg-theme button').forEach(b => b.classList.toggle('on', b.dataset.theme === prefs.theme));
    const dark = prefs.theme === 'dark' || (prefs.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#121212' : '#ffffff');
    if (isNative && window.capacitorExports && window.capacitorExports.SystemBars) {
      window.capacitorExports.SystemBars.setStyle({ style: dark ? 'DARK' : 'LIGHT' }).catch(() => {});
    }
  }

  // ---------- formatting ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function longDate(d) {
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  function shortDate(d) {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function timeAgo(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + ' min ago';
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs + (hrs === 1 ? ' hr ago' : ' hrs ago');
    return shortDate(d);
  }
  function readTime(html) {
    const words = (html || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 220)) + ' min read';
  }

  // ---------- categories ----------
  // Main sections, in the order of the website's navigation.
  const PREFERRED = [
    'business-economy', 'banking-finance', 'leadership-governance', 'agriculture-mining',
    'auditor-general-explained', 'opinion', 'politics', 'feature', 'entrepreneurship-startups', 'technology-innovation',
    'zambia-economy-2026', 'macroeconomy-policy', 'economic-diplomacy', 'zambia-tax-2026',
    'election-2026-economics', 'health-lifestyle', 'youth-women-empowerment', 'labour-employment',
  ];
  let categories = ZE.cachedCategories() || [];
  const catById = () => Object.fromEntries(categories.map(c => [c.id, c]));
  function kicker(ids) {
    const map = catById();
    // Prefer a named sub-section, then any section other than "Uncategorized".
    const named = (ids || []).map(id => map[id]).filter(c => c && c.slug !== 'uncategorized');
    if (!named.length) return '';
    const child = named.find(c => c.parent);
    return (child || named[0]).name;
  }
  function chipSections() {
    const bySlug = Object.fromEntries(categories.map(c => [c.slug, c]));
    return PREFERRED.map(s => bySlug[s]).filter(Boolean);
  }

  // ---------- state ----------
  const state = {
    tab: 'today',
    section: null,            // category id shown on Today, null = Top stories
    feeds: {},                // key -> { items, page, totalPages, loading }
    topId: null,
    readerStack: [],
    readerPost: null,
    scroll: {},
    lastRefresh: 0,
  };
  const feedKey = cat => 'f' + (cat || 'all');

  // ---------- story cards ----------
  function storyCard(p, variant) {
    const k = kicker(p.categories);
    const img = variant === 'lead' ? (p.imageLarge || p.image) : p.image;
    const imgHtml = img ? `<div class="thumb"><img src="${esc(img.src)}" alt="${esc(img.alt)}" loading="lazy" decoding="async"></div>` : '';
    const meta = `<div class="meta">${esc(timeAgo(p.date))}</div>`;
    if (variant === 'lead') {
      return `<a class="story lead" data-id="${p.id}">
        ${imgHtml}
        ${k ? `<div class="kicker">${esc(k)}</div>` : ''}
        <h2 class="headline">${esc(p.title)}</h2>
        ${p.excerpt ? `<p class="summary">${esc(p.excerpt)}</p>` : ''}
        ${meta}
      </a>`;
    }
    return `<a class="story row" data-id="${p.id}">
      <div class="row-text">
        ${k ? `<div class="kicker">${esc(k)}</div>` : ''}
        <h3 class="headline">${esc(p.title)}</h3>
        ${variant === 'secondary' && p.excerpt ? `<p class="summary">${esc(p.excerpt)}</p>` : ''}
        ${meta}
      </div>
      ${imgHtml}
    </a>`;
  }

  function renderFeedInto(el, feed, opts) {
    const items = feed.items || [];
    if (!items.length) {
      el.innerHTML = (opts && opts.title ? `<div class="section-head"><h1>${esc(opts.title)}</h1></div>` : '') + (feed.error
        ? errorBlock('We could not load the latest stories.', 'retry-feed')
        : `<div class="empty">No stories yet in this section.</div>`);
      return;
    }
    let html = '';
    if (opts && opts.title) html += `<div class="section-head"><h1>${esc(opts.title)}</h1></div>`;
    html += storyCard(items[0], 'lead');
    html += '<div class="rule"></div>';
    items.slice(1, 3).forEach(p => { html += storyCard(p, 'secondary'); });
    if (items.length > 3) html += `<div class="band"><span>Latest</span></div>`;
    items.slice(3).forEach(p => { html += storyCard(p, 'row'); });
    const more = feed.page < feed.totalPages;
    html += more
      ? `<div class="sentinel" data-more="1"><span class="spinner"></span></div>`
      : `<div class="end-mark"><span>◆</span></div>`;
    el.innerHTML = html;
    observeSentinel(el);
  }

  function errorBlock(msg, action) {
    return `<div class="error-block"><p>${esc(msg)}</p><p class="small">Check your connection and try again.</p>
      <button class="btn" data-action="${action}">Try again</button></div>`;
  }

  function skeleton() {
    let h = '<div class="sk sk-img"></div><div class="sk sk-line w60"></div><div class="sk sk-title"></div><div class="sk sk-title w80"></div><div class="rule"></div>';
    for (let i = 0; i < 4; i++) h += '<div class="sk-row"><div><div class="sk sk-line w40"></div><div class="sk sk-line"></div><div class="sk sk-line w70"></div></div><div class="sk sk-thumb"></div></div>';
    return h;
  }

  // ---------- Today / section feeds ----------
  const todayEl = $('#view-today');

  async function loadFeed(cat, { force = false } = {}) {
    const key = feedKey(cat);
    let feed = state.feeds[key];
    if (!feed || force) {
      const cached = ZE.cachedPosts(cat, 1);
      feed = state.feeds[key] = { items: cached ? cached.items : [], page: 1, totalPages: cached ? cached.totalPages : 1, loading: true };
      if (feed.items.length) renderToday(); else if (isCurrent(cat)) todayEl.innerHTML = skeleton();
    }
    try {
      const { items, totalPages } = await ZE.posts({ page: 1, category: cat });
      feed.items = items; feed.page = 1; feed.totalPages = totalPages || 1; feed.error = false;
      if (!cat && items[0]) { state.topId = items[0].id; hidePill(); }
      setOffline(false);
    } catch (e) {
      feed.error = !feed.items.length;
      setOffline(true);
    } finally {
      feed.loading = false;
      if (isCurrent(cat)) renderToday();
    }
  }

  async function loadMore(cat) {
    const feed = state.feeds[feedKey(cat)];
    if (!feed || feed.loading || feed.page >= feed.totalPages) return;
    feed.loading = true;
    try {
      const { items, totalPages } = await ZE.posts({ page: feed.page + 1, category: cat });
      const seen = new Set(feed.items.map(p => p.id));
      feed.items = feed.items.concat(items.filter(p => !seen.has(p.id)));
      feed.page += 1;
      if (totalPages) feed.totalPages = totalPages;
      if (!items.length) feed.totalPages = feed.page;
    } catch (e) {
      toast('Could not load more stories');
    } finally {
      feed.loading = false;
      if (isCurrent(cat)) {
        const main = $('#main'); const top = main.scrollTop;
        renderToday();
        main.scrollTop = top;
      }
    }
  }

  const isCurrent = cat => (state.section || null) === (cat || null);

  function renderToday() {
    const feed = state.feeds[feedKey(state.section)];
    if (!feed) return;
    const c = state.section ? catById()[state.section] : null;
    renderFeedInto(todayEl, feed, { title: c ? c.name : null });
  }

  let observer = null;
  function observeSentinel(root) {
    if (observer) observer.disconnect();
    const s = $('.sentinel', root);
    if (!s || !('IntersectionObserver' in window)) return;
    observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {
        const view = root.id;
        if (view === 'view-today') loadMore(state.section);
      }
    }, { root: $('#main'), rootMargin: '600px 0px' });
    observer.observe(s);
  }

  // ---------- section chips ----------
  function renderChips() {
    const chips = $('#chips');
    const list = chipSections();
    chips.innerHTML = `<button class="chip ${state.section ? '' : 'on'}" data-cat="">Top Stories</button>` +
      list.map(c => `<button class="chip ${state.section === c.id ? 'on' : ''}" data-cat="${c.id}">${esc(c.name)}</button>`).join('');
  }

  function selectSection(catId) {
    state.section = catId || null;
    renderChips();
    const on = $('#chips .chip.on');
    if (on) on.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    $('#main').scrollTop = 0;
    const feed = state.feeds[feedKey(state.section)];
    if (feed && feed.items.length) renderToday();
    loadFeed(state.section, { force: !feed });
  }

  // ---------- Sections tab ----------
  function renderSections() {
    const el = $('#view-sections');
    if (!categories.length) {
      el.innerHTML = '<div class="pad"><span class="spinner"></span></div>';
      return;
    }
    const main = chipSections();
    const mainIds = new Set(main.map(c => c.id));
    const others = categories.filter(c => !mainIds.has(c.id) && c.slug !== 'uncategorized' && c.count > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    const row = c => `<button class="sec-row" data-cat="${c.id}"><span>${esc(c.name)}</span><span class="count">${c.count}</span><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>`;
    el.innerHTML = `<div class="section-head"><h1>Sections</h1></div>
      <div class="sec-group">${main.map(row).join('')}</div>
      ${others.length ? `<div class="band"><span>More topics</span></div><div class="sec-group">${others.map(row).join('')}</div>` : ''}
      <div class="band"><span>From the website</span></div>
      <div class="sec-group">
        <button class="sec-row" data-ext="https://zambianeconomist.com/public-money-tracker/"><span>Public Money Tracker</span><svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg></button>
        <button class="sec-row" data-ext="https://zambianeconomist.com/directory/"><span>Business Directory</span><svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg></button>
        <button class="sec-row" data-ext="https://zambianeconomist.com/events/"><span>Events</span><svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg></button>
        <button class="sec-row" data-ext="https://zambianeconomist.com/podcast-fund/"><span>Podcast</span><svg viewBox="0 0 24 24"><path d="M7 17 17 7M9 7h8v8"/></svg></button>
      </div>`;
  }

  async function loadCategories() {
    try {
      categories = await ZE.categories();
      renderChips();
      if (state.tab === 'sections') renderSections();
      if (state.tab === 'today') renderToday();
    } catch (e) { /* keep cached list */ }
  }

  // ---------- Editions tab ----------
  async function renderEditions() {
    const el = $('#view-editions');
    const draw = eds => {
      if (!eds) { el.innerHTML = '<div class="pad"><span class="spinner"></span></div>'; return; }
      const card = e => {
        const d = new Date(e.date);
        const kind = /monthly/i.test(e.title) ? 'Monthly Edition' : /special/i.test(e.title) ? 'Special Edition'
          : /weekend/i.test(e.title) ? 'Weekend Edition' : 'Weekly Edition';
        const heading = e.title.replace(/^The Zambian Economist[\s|:,.]*/i, '').replace(/\(([^)]*)\)/, '$1').trim() || e.title;
        const cover = e.thumb
          ? `<img src="${esc(e.thumb)}" alt="" loading="lazy">`
          : `<div class="cover-ph"><span class="ph-the">The</span><span class="ph-name">Zambian Economist</span><span class="ph-type">${esc(kind)}</span></div>`;
        const size = e.size ? ' · ' + (e.size / 1048576).toFixed(1) + ' MB' : '';
        return `<button class="edition" data-ext="${esc(e.url)}">
          <div class="cover">${cover}</div>
          <div class="ed-text">
            <div class="kicker">${esc(kind)}</div>
            <h3>${esc(heading)}</h3>
            <div class="meta">Published ${esc(shortDate(d))} · PDF${esc(size)}</div>
          </div>
        </button>`;
      };
      el.innerHTML = `<div class="section-head"><h1>Editions</h1><p class="dek">The week and the month in Zambia's economy, as a newspaper you can read and share.</p></div>
        ${eds.length ? eds.map(card).join('') : '<div class="empty">No editions found yet.</div>'}
        <div class="pad"><button class="btn ghost" data-ext="https://zambianeconomist.com/weekly-edition/">Browse the full archive</button></div>`;
    };
    const cached = ZE.cachedEditions();
    draw(cached);
    try { draw(await ZE.editions()); } catch (e) { if (!cached) el.innerHTML = errorBlock('We could not load the editions.', 'retry-editions'); }
  }

  // ---------- Saved tab ----------
  const SAVED_KEY = 'ze.saved';
  const getSaved = () => readJSON(SAVED_KEY, []);
  const isSaved = id => getSaved().some(p => p.id === id);
  function toggleSaved(post) {
    let list = getSaved();
    if (list.some(p => p.id === post.id)) {
      list = list.filter(p => p.id !== post.id);
      toast('Removed from Saved');
    } else {
      list.unshift(Object.assign({}, post, { savedAt: Date.now() }));
      list = list.slice(0, 100);
      toast('Saved for offline reading');
    }
    writeJSON(SAVED_KEY, list);
    updateSaveBtn();
    if (state.tab === 'saved') renderSaved();
  }
  function renderSaved() {
    const el = $('#view-saved');
    const list = getSaved();
    el.innerHTML = `<div class="section-head"><h1>Saved</h1><p class="dek">Articles you save are kept on this phone, so you can read them offline.</p></div>` +
      (list.length ? list.map(p => storyCard(p, 'row')).join('')
        : `<div class="empty"><svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg><p>Tap the bookmark on any article to save it here.</p></div>`);
  }

  // ---------- Search tab ----------
  let searchTimer = null; let searchSeq = 0;
  async function runSearch(q) {
    const el = $('#search-results');
    q = q.trim();
    if (q.length < 2) { el.innerHTML = '<div class="empty small">Search across every article on The Zambian Economist.</div>'; return; }
    const seq = ++searchSeq;
    el.innerHTML = '<div class="pad"><span class="spinner"></span></div>';
    try {
      const { items } = await ZE.posts({ search: q, perPage: 30 });
      if (seq !== searchSeq) return;
      el.innerHTML = items.length
        ? `<div class="result-count">${items.length === 30 ? '30+' : items.length} result${items.length === 1 ? '' : 's'}</div>` + items.map(p => storyCard(p, 'row')).join('')
        : `<div class="empty">No articles match “${esc(q)}”.</div>`;
      items.forEach(p => { postIndex[p.id] = p; });
    } catch (e) {
      if (seq === searchSeq) el.innerHTML = errorBlock('Search needs an internet connection.', 'retry-search');
    }
  }

  // ---------- Article reader ----------
  const postIndex = {};   // id -> lightweight post from any list, for instant opening
  function indexFeeds() {
    Object.values(state.feeds).forEach(f => (f.items || []).forEach(p => { postIndex[p.id] = p; }));
    getSaved().forEach(p => { postIndex[p.id] = postIndex[p.id] || p; });
  }

  const reader = $('#reader');
  const readerInner = $('#reader-inner');

  function cleanContent(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html || '';
    const root = tpl.content;
    root.querySelectorAll('script, style, link, meta, form, .sharedaddy, .jp-relatedposts, .addtoany_share_save_container').forEach(n => n.remove());
    root.querySelectorAll('noscript').forEach(n => n.remove());
    root.querySelectorAll('img').forEach(img => {
      const lazy = img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
      if (lazy) img.setAttribute('src', lazy);
      const lazySet = img.getAttribute('data-srcset') || img.getAttribute('data-lazy-srcset');
      if (lazySet) img.setAttribute('srcset', lazySet);
      img.removeAttribute('width'); img.removeAttribute('height');
      img.setAttribute('loading', 'lazy'); img.setAttribute('decoding', 'async');
      img.setAttribute('sizes', '100vw');
    });
    root.querySelectorAll('iframe').forEach(f => {
      const src = f.getAttribute('src') || f.getAttribute('data-src') || '';
      if (!/^https:\/\//.test(src)) { f.remove(); return; }
      f.setAttribute('src', src); f.setAttribute('loading', 'lazy');
      f.removeAttribute('width'); f.removeAttribute('height');
      const wrap = document.createElement('div'); wrap.className = 'embed';
      f.parentNode.insertBefore(wrap, f); wrap.appendChild(f);
    });
    root.querySelectorAll('table').forEach(t => {
      const wrap = document.createElement('div'); wrap.className = 'table-wrap';
      t.parentNode.insertBefore(wrap, t); wrap.appendChild(t);
    });
    root.querySelectorAll('[style]').forEach(n => {
      // Keep author colours and callout styling, but never fixed widths that break a phone screen.
      n.style.removeProperty('width'); n.style.removeProperty('min-width');
      n.style.removeProperty('max-width'); n.style.removeProperty('float');
    });
    const div = document.createElement('div');
    div.appendChild(root);
    return div.innerHTML;
  }

  function readerHTML(p, bodyHtml) {
    const k = kicker(p.categories);
    const img = p.imageLarge || p.image;
    const d = new Date(p.date);
    return `
      ${k ? `<div class="kicker">${esc(k)}</div>` : ''}
      <h1 class="r-headline">${esc(p.title)}</h1>
      ${p.excerpt ? `<p class="r-dek">${esc(p.excerpt)}</p>` : ''}
      <div class="r-meta">
        <span class="r-org">The Zambian Economist</span>
        <span>${isNaN(d) ? '' : esc(d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))}${bodyHtml ? ' · ' + esc(readTime(bodyHtml)) : ''}</span>
      </div>
      ${img ? `<figure class="r-hero"><img src="${esc(img.src)}" alt="${esc(img.alt)}">${img.alt ? `<figcaption>${esc(img.alt)}</figcaption>` : ''}</figure>` : ''}
      <div class="r-body">${bodyHtml != null ? bodyHtml : '<div class="pad"><span class="spinner"></span></div>'}</div>
      ${bodyHtml != null ? `<div class="r-foot">
        <button class="btn ghost" data-ext="${esc(p.link)}">Open on zambianeconomist.com</button>
      </div>` : ''}`;
  }

  async function openArticle(id, { push = true, preset = null } = {}) {
    indexFeeds();
    const lite = preset || postIndex[id] || ZE.cachedPost(id) || getSaved().find(p => p.id === id);
    if (push && state.readerPost) state.readerStack.push(state.readerPost.id);
    showReader();
    const saved = getSaved().find(p => p.id === id);
    const cached = ZE.cachedPost(id);
    const full = (saved && saved.content) ? saved : (cached && cached.content ? cached : null);
    if (full) {
      setReader(full);
    } else if (lite) {
      setReader(lite, true);
    } else {
      readerInner.innerHTML = '<div class="pad"><span class="spinner"></span></div>';
    }
    try {
      const fresh = await ZE.post(id);
      if (state.readerPost && state.readerPost.id !== id && full) return;
      setReader(fresh, false, !!full);
    } catch (e) {
      if (!full) {
        readerInner.innerHTML = (lite ? readerHTML(lite, '') : '') +
          errorBlock('This article needs an internet connection to open.', 'retry-article');
        readerInner.dataset.retryId = id;
      }
    }
  }

  function setReader(p, loading, keepScroll) {
    const sc = $('#reader-scroll');
    const top = sc.scrollTop;
    state.readerPost = p;
    readerInner.innerHTML = readerHTML(p, loading ? null : cleanContent(p.content || ''));
    if (keepScroll) sc.scrollTop = top; else sc.scrollTop = 0;
    updateSaveBtn();
  }

  function showReader() {
    reader.classList.add('open');
    reader.setAttribute('aria-hidden', 'false');
  }
  function closeReader() {
    if (state.readerStack.length) {
      const prev = state.readerStack.pop();
      openArticle(prev, { push: false });
      return;
    }
    reader.classList.remove('open');
    reader.setAttribute('aria-hidden', 'true');
    state.readerPost = null;
  }
  function updateSaveBtn() {
    const btn = $('#reader-save');
    btn.classList.toggle('on', !!(state.readerPost && isSaved(state.readerPost.id)));
  }

  async function sharePost(p) {
    if (!p) return;
    const Share = plugin('Share');
    const data = { title: p.title, text: p.title + ' | The Zambian Economist', url: p.link, dialogTitle: 'Share article' };
    try {
      if (Share) await Share.share(data);
      else if (navigator.share) await navigator.share({ title: data.title, text: data.text, url: data.url });
      else { await navigator.clipboard.writeText(p.link); toast('Link copied'); }
    } catch (e) { /* user cancelled */ }
  }

  // Links inside articles: stories open in the app, everything else outside.
  async function handleLink(href) {
    let u;
    try { u = new URL(href, ZE.SITE); } catch (e) { return; }
    if (u.protocol === 'mailto:' || u.protocol === 'tel:') { window.location.href = href; return; }
    const ours = /(^|\.)zambianeconomist\.com$/i.test(u.hostname);
    if (ours && !/^\/wp-(content|admin|json)\//.test(u.pathname)) {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts[0] === 'category' && parts.length > 1) {
        const slug = parts[parts.length - 1];
        const c = categories.find(x => x.slug === slug);
        if (c) {
          reader.classList.remove('open'); state.readerStack = []; state.readerPost = null;
          switchTab('today'); selectSection(c.id); return;
        }
      }
      if (parts.length === 1) {
        const slug = parts[0];
        const known = Object.values(postIndex).find(p => p.slug === slug);
        if (known) { openArticle(known.id); return; }
        toast('Opening…');
        try {
          const p = await ZE.postBySlug(slug);
          if (p) { postIndex[p.id] = p; openArticle(p.id, { preset: p }); return; }
        } catch (e) { /* fall through to the browser */ }
      }
    }
    openExternal(u.href);
  }

  // ---------- tabs ----------
  function switchTab(tab) {
    if (tab === state.tab) {
      // Second tap on the current tab scrolls back to the top.
      $('#main').scrollTo({ top: 0, behavior: 'smooth' });
      if (tab === 'search') $('#search-input').focus();
      return;
    }
    state.scroll[state.tab] = $('#main').scrollTop;
    state.tab = tab;
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + tab));
    document.body.dataset.tab = tab;
    if (tab === 'sections') renderSections();
    if (tab === 'editions') renderEditions();
    if (tab === 'saved') renderSaved();
    if (tab === 'search') {
      if (!$('#search-results').innerHTML) runSearch('');
      setTimeout(() => $('#search-input').focus(), 250);
    }
    $('#main').scrollTop = state.scroll[tab] || 0;
  }

  // ---------- refresh, polling, new-stories pill ----------
  async function refreshAll() {
    state.lastRefresh = Date.now();
    hidePill();
    loadCategories();
    await loadFeed(state.section, { force: false });
    if (state.section) state.feeds[feedKey(null)] = undefined; // Top stories reloads next time
  }

  async function checkForNew() {
    if (document.hidden) return;
    try {
      const id = await ZE.latestId();
      if (id && state.topId && id !== state.topId) showPill();
    } catch (e) { /* offline */ }
  }
  function showPill() { $('#new-pill').hidden = false; }
  function hidePill() { $('#new-pill').hidden = true; }

  function setOffline(off) {
    const bar = $('#offline-bar');
    if (off) { bar.hidden = false; clearTimeout(setOffline.t); setOffline.t = setTimeout(() => { bar.hidden = true; }, 5000); }
    else bar.hidden = true;
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false; t.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { t.classList.remove('show'); setTimeout(() => { t.hidden = true; }, 250); }, 1800);
  }

  // ---------- pull to refresh ----------
  function setupPullToRefresh() {
    const main = $('#main'); const ptr = $('#ptr');
    let startY = null; let dist = 0;
    main.addEventListener('touchstart', e => {
      if (main.scrollTop <= 0 && state.tab === 'today') { startY = e.touches[0].clientY; dist = 0; }
      else startY = null;
    }, { passive: true });
    main.addEventListener('touchmove', e => {
      if (startY == null) return;
      dist = Math.max(0, e.touches[0].clientY - startY);
      if (dist > 0) {
        const d = Math.min(dist * 0.5, 80);
        ptr.style.transform = `translateY(${d - 50}px)`;
        ptr.style.opacity = Math.min(1, d / 60);
        ptr.classList.toggle('ready', d >= 60);
      }
    }, { passive: true });
    main.addEventListener('touchend', async () => {
      if (startY == null) return;
      const go = ptr.classList.contains('ready');
      startY = null;
      if (go) {
        ptr.classList.add('spin');
        ptr.style.transform = 'translateY(14px)';
        await refreshAll();
      }
      ptr.classList.remove('spin', 'ready');
      ptr.style.transform = ''; ptr.style.opacity = '';
    });
  }

  // ---------- settings sheet ----------
  function openSheet() {
    $('#sheet-backdrop').hidden = false;
    requestAnimationFrame(() => { $('#sheet').classList.add('open'); $('#sheet-backdrop').classList.add('show'); });
    $('#sheet').setAttribute('aria-hidden', 'false');
  }
  function closeSheet() {
    $('#sheet').classList.remove('open'); $('#sheet-backdrop').classList.remove('show');
    $('#sheet').setAttribute('aria-hidden', 'true');
    setTimeout(() => { $('#sheet-backdrop').hidden = true; }, 250);
  }
  const sheetOpen = () => $('#sheet').classList.contains('open');

  // ---------- events ----------
  function bind() {
    document.addEventListener('click', e => {
      const ext = e.target.closest('[data-ext]');
      if (ext) { e.preventDefault(); openExternal(ext.dataset.ext); return; }

      const story = e.target.closest('.story[data-id]');
      if (story) { e.preventDefault(); openArticle(+story.dataset.id); return; }

      const chip = e.target.closest('.chip');
      if (chip) { selectSection(chip.dataset.cat ? +chip.dataset.cat : null); return; }

      const sec = e.target.closest('.sec-row[data-cat]');
      if (sec) { switchTab('today'); selectSection(+sec.dataset.cat); return; }

      const tab = e.target.closest('.tab');
      if (tab) { switchTab(tab.dataset.tab); return; }

      const act = e.target.closest('[data-action]');
      if (act) {
        const a = act.dataset.action;
        if (a === 'retry-feed') loadFeed(state.section, { force: true });
        if (a === 'retry-editions') renderEditions();
        if (a === 'retry-search') runSearch($('#search-input').value);
        if (a === 'retry-article' && readerInner.dataset.retryId) openArticle(+readerInner.dataset.retryId, { push: false });
        return;
      }

      const link = e.target.closest('.r-body a[href]');
      if (link) { e.preventDefault(); handleLink(link.getAttribute('href')); return; }
    });

    $('#reader-back').addEventListener('click', closeReader);
    $('#reader-save').addEventListener('click', () => {
      const p = state.readerPost; if (!p || !p.content) { toast('Wait for the article to load'); return; }
      toggleSaved(p);
    });
    $('#reader-share').addEventListener('click', () => sharePost(state.readerPost));
    $('#reader-text').addEventListener('click', () => {
      prefs.size = (prefs.size + 1) % SIZES.length; savePrefs(); applyPrefs();
      toast(['Small', 'Medium', 'Large', 'Extra large'][prefs.size] + ' text');
    });

    $('#btn-refresh').addEventListener('click', async () => {
      const b = $('#btn-refresh'); b.classList.add('spinning');
      if (state.tab !== 'today') switchTab('today');
      $('#main').scrollTop = 0;
      await refreshAll();
      b.classList.remove('spinning');
    });
    $('#btn-settings').addEventListener('click', openSheet);
    $('#sheet-backdrop').addEventListener('click', closeSheet);
    $('#wordmark').addEventListener('click', () => { switchTab('today'); selectSection(null); });
    $('#seg-size').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; prefs.size = +b.dataset.size; savePrefs(); applyPrefs(); });
    $('#seg-theme').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; prefs.theme = b.dataset.theme; savePrefs(); applyPrefs(); });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyPrefs);

    $('#new-pill').addEventListener('click', async () => {
      hidePill(); switchTab('today'); selectSection(null); $('#main').scrollTop = 0;
      await loadFeed(null, { force: false });
    });

    const input = $('#search-input');
    input.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => runSearch(input.value), 450); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(searchTimer); runSearch(input.value); input.blur(); } });

    // Android back button
    const App = plugin('App');
    if (App) {
      App.addListener('backButton', () => {
        if (sheetOpen()) closeSheet();
        else if (reader.classList.contains('open')) closeReader();
        else if (state.tab !== 'today') switchTab('today');
        else if (state.section) selectSection(null);
        else App.exitApp();
      });
      App.addListener('resume', () => {
        // Back in the app after a while: fetch the latest stories automatically.
        if (Date.now() - state.lastRefresh > 15 * 60 * 1000) refreshAll(); else checkForNew();
      });
      App.getInfo().then(i => { $('#app-version').textContent = `The Zambian Economist · version ${i.version}`; }).catch(() => {});
    } else {
      document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (sheetOpen()) closeSheet(); else closeReader(); } });
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkForNew(); });
    window.addEventListener('online', () => refreshAll());

    // Hide masthead chips when scrolling down the feed, show when scrolling up.
    let lastY = 0;
    $('#main').addEventListener('scroll', () => {
      const y = $('#main').scrollTop;
      document.body.classList.toggle('scrolled', y > 8);
      lastY = y;
    }, { passive: true });
  }

  // ---------- start ----------
  function start() {
    applyPrefs();
    $('#dateline').textContent = longDate(new Date());
    document.body.dataset.tab = 'today';
    renderChips();
    bind();
    setupPullToRefresh();
    loadCategories();
    loadFeed(null).then(() => {
      state.lastRefresh = Date.now();
      const Splash = plugin('SplashScreen');
      if (Splash) Splash.hide().catch(() => {});
    });
    setInterval(checkForNew, 3 * 60 * 1000);
    setInterval(() => { $('#dateline').textContent = longDate(new Date()); }, 60 * 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
