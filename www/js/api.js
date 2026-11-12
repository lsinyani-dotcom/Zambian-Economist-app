/* The Zambian Economist app: data layer.
 * Reads live content from the WordPress REST API on zambianeconomist.com.
 * Nothing in the app needs changing when articles are published: every
 * screen asks the site for its latest posts.
 */
(function () {
  'use strict';

  const SITE = 'https://zambianeconomist.com';
  const API = SITE + '/wp-json/wp/v2';
  const LIST_FIELDS = 'id,date,date_gmt,modified,slug,link,title,excerpt,categories,featured_media,_links,_embedded';
  const POST_FIELDS = LIST_FIELDS + ',content';
  const EMBED = 'wp:featuredmedia';

  // ---------- small offline cache (localStorage) ----------
  const CACHE_PREFIX = 'ze.cache.';
  function cacheGet(key) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function cacheSet(key, data) {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), d: data }));
    } catch (e) {
      // Storage full: drop old cached lists and try once more.
      try {
        Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX)).forEach(k => localStorage.removeItem(k));
        localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), d: data }));
      } catch (e2) { /* give up quietly */ }
    }
  }

  async function getJSON(path, params) {
    const qs = new URLSearchParams(params || {}).toString();
    const url = API + path + (qs ? '?' + qs : '');
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), 20000) : null;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl ? ctrl.signal : undefined });
      if (!res.ok) {
        // WordPress returns 400 when asking for a page past the end.
        if (res.status === 400 && params && params.page > 1) return { data: [], totalPages: params.page - 1 };
        throw new Error('HTTP ' + res.status);
      }
      const data = await res.json();
      const tp = parseInt(res.headers.get('X-WP-TotalPages') || res.headers.get('x-wp-totalpages') || '0', 10);
      return { data, totalPages: tp };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // ---------- normalising WordPress objects ----------
  function decode(html) {
    const t = document.createElement('textarea');
    t.innerHTML = html || '';
    return t.value;
  }
  function stripTags(html) {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function pickImage(post, preferLarge) {
    const m = post._embedded && post._embedded['wp:featuredmedia'] && post._embedded['wp:featuredmedia'][0];
    if (!m || m.code) return null;
    const sizes = (m.media_details && m.media_details.sizes) || {};
    const order = preferLarge
      ? ['large', 'medium_large', '1536x1536', 'full']
      : ['medium_large', 'medium', 'large', 'full'];
    let src = null;
    for (const k of order) { if (sizes[k] && sizes[k].source_url) { src = sizes[k].source_url; break; } }
    if (!src) src = m.source_url || null;
    return src ? { src, alt: decode(m.alt_text || '') } : null;
  }
  function normalise(post) {
    return {
      id: post.id,
      slug: post.slug,
      link: post.link,
      date: post.date_gmt ? post.date_gmt + 'Z' : post.date,
      title: decode(post.title && post.title.rendered),
      excerpt: stripTags(decode(post.excerpt && post.excerpt.rendered)).replace(/\s*\[(…|&hellip;|\.\.\.)\]\s*$/, '…'),
      categories: post.categories || [],
      image: pickImage(post, false),
      imageLarge: pickImage(post, true),
      content: post.content ? post.content.rendered : null,
    };
  }

  // ---------- public API ----------
  const ZE = {
    SITE,

    cacheGet, cacheSet,

    async posts({ page = 1, perPage = 20, category = null, search = null } = {}) {
      const params = { per_page: perPage, page, _embed: EMBED, _fields: LIST_FIELDS };
      if (category) params.categories = category;
      if (search) { params.search = search; }
      const key = `posts.${category || 'all'}.${page}`;
      const { data, totalPages } = await getJSON('/posts', params);
      const items = data.map(normalise);
      if (!search) cacheSet(key, { items, totalPages });
      return { items, totalPages };
    },

    cachedPosts(category, page = 1) {
      const c = cacheGet(`posts.${category || 'all'}.${page}`);
      return c ? c.d : null;
    },

    async latestId() {
      const { data } = await getJSON('/posts', { per_page: 1, _fields: 'id,date' });
      return data[0] ? data[0].id : null;
    },

    async post(id) {
      const { data } = await getJSON('/posts/' + id, { _embed: EMBED, _fields: POST_FIELDS });
      const p = normalise(data);
      cacheSet('post.' + id, p);
      return p;
    },

    async postBySlug(slug) {
      const { data } = await getJSON('/posts', { slug, _embed: EMBED, _fields: POST_FIELDS });
      if (!data.length) return null;
      const p = normalise(data[0]);
      cacheSet('post.' + p.id, p);
      return p;
    },

    cachedPost(id) {
      const c = cacheGet('post.' + id);
      return c ? c.d : null;
    },

    async categories() {
      const { data } = await getJSON('/categories', {
        per_page: 100, hide_empty: true, orderby: 'count', order: 'desc',
        _fields: 'id,name,slug,count,parent',
      });
      const cats = data.map(c => ({ id: c.id, name: decode(c.name), slug: c.slug, count: c.count, parent: c.parent }));
      cacheSet('categories', cats);
      return cats;
    },

    cachedCategories() {
      const c = cacheGet('categories');
      return c ? c.d : null;
    },

    // Weekly and Monthly Edition PDFs from the media library.
    async editions() {
      const { data } = await getJSON('/media', {
        per_page: 50, search: 'Edition', mime_type: 'application/pdf', orderby: 'date', order: 'desc',
        _fields: 'id,date,title,source_url,media_details',
      });
      const eds = data
        .filter(m => /edition/i.test((m.title && m.title.rendered) || m.source_url || ''))
        .map(m => {
          const sizes = (m.media_details && m.media_details.sizes) || {};
          const thumb = (sizes.medium && sizes.medium.source_url) || (sizes.full && sizes.full.source_url) || null;
          let title = decode((m.title && m.title.rendered) || '');
          title = title.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
          return { id: m.id, date: m.date, title, url: m.source_url, thumb, size: m.media_details && m.media_details.filesize };
        });
      // The same edition is sometimes uploaded more than once: keep the newest copy of each title.
      const seen = new Set();
      const unique = eds.filter(e => {
        const k = e.title.toLowerCase().replace(/[^a-z0-9]+/g, '');
        if (seen.has(k)) return false;
        seen.add(k); return true;
      });
      cacheSet('editions', unique);
      return unique;
    },

    cachedEditions() {
      const c = cacheGet('editions');
      return c ? c.d : null;
    },
  };

  window.ZE = ZE;
})();
