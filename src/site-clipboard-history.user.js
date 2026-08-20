// ==UserScript==
// @name         Site Clipboard History
// @namespace    https://github.com/suganplay039/site-clipboard-history
// @version      0.1.0
// @description  Maintains a separate clipboard history per website. Recall it with a keyboard shortcut and insert directly into the focused field.
// @author       Sugan Krishna K K
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/suganplay039/site-clipboard-history/main/src/site-clipboard-history.user.js
// @downloadURL  https://raw.githubusercontent.com/suganplay039/site-clipboard-history/main/src/site-clipboard-history.user.js
// ==/UserScript==

(function () {
  'use strict';

  /* ----------------------------------------------------------------
   * Config
   * ------------------------------------------------------------- */
  const STORAGE_KEY = 'sch_history_v1';
  const SETTINGS_KEY = 'sch_settings_v1';
  const SHORTCUT = { key: 'C', alt: true, shift: true, ctrl: false }; // Alt+Shift+C
  const DEFAULT_SETTINGS = {
    retentionMode: 'count', // 'count' | 'time' | 'unlimited'
    maxCount: 30,
    maxAgeMs: 24 * 60 * 60 * 1000 // 24h
  };

  /* ----------------------------------------------------------------
   * Storage helpers
   * ------------------------------------------------------------- */
  function getDomain() {
    return location.hostname; // full domain, e.g. "www.example.com"
  }

  function loadAll() {
    return GM_getValue(STORAGE_KEY, {});
  }

  function saveAll(all) {
    GM_setValue(STORAGE_KEY, all);
  }

  function loadSettings() {
    return Object.assign({}, DEFAULT_SETTINGS, GM_getValue(SETTINGS_KEY, {}));
  }

  function saveSettings(settings) {
    GM_setValue(SETTINGS_KEY, settings);
  }

  function getDomainHistory(domain) {
    const all = loadAll();
    return all[domain] || [];
  }

  function pushToHistory(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return;

    const domain = getDomain();
    const all = loadAll();
    const list = all[domain] || [];

    // Dedupe: skip if identical to the most recent entry
    if (list.length && list[list.length - 1].text === trimmed) return;

    list.push({
      id: cryptoRandomId(),
      text: trimmed,
      timestamp: Date.now()
    });

    all[domain] = applyRetention(list);
    saveAll(all);
  }

  function applyRetention(list) {
    const settings = loadSettings();
    let result = list;

    if (settings.retentionMode === 'count') {
      if (result.length > settings.maxCount) {
        result = result.slice(result.length - settings.maxCount);
      }
    } else if (settings.retentionMode === 'time') {
      const cutoff = Date.now() - settings.maxAgeMs;
      result = result.filter((item) => item.timestamp >= cutoff);
    }
    // 'unlimited' -> no trimming

    return result;
  }

  function cryptoRandomId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ----------------------------------------------------------------
   * Capture copy events (FR-01 / FR-02)
   * ------------------------------------------------------------- */
  document.addEventListener('copy', () => {
    // Small delay lets the browser finish the copy; selection is still valid immediately though
    const selected = window.getSelection ? window.getSelection().toString() : '';
    if (selected) {
      pushToHistory(selected);
    }
  });

  /* ----------------------------------------------------------------
   * Paste-into-field logic (FR-04) — does NOT remove from history
   * ------------------------------------------------------------- */
  function insertIntoElement(el, text) {
    if (!el) return false;

    const tag = el.tagName ? el.tagName.toLowerCase() : '';

    if (tag === 'input' || tag === 'textarea') {
      const proto = tag === 'input' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;

      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? el.value.length;
      const newValue = el.value.slice(0, start) + text + el.value.slice(end);

      nativeSetter.call(el, newValue);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));

      const caretPos = start + text.length;
      el.setSelectionRange(caretPos, caretPos);
      return true;
    }

    if (el.isContentEditable) {
      el.focus();
      const success = document.execCommand('insertText', false, text);
      if (!success) {
        // Fallback: manual range insert
        const sel = window.getSelection();
        if (sel.rangeCount) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode(text));
          range.collapse(false);
        }
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }

    return false;
  }

  /* ----------------------------------------------------------------
   * Floating panel UI (Shadow DOM to avoid host-page CSS collisions)
   * ------------------------------------------------------------- */
  let panelHost = null;
  let lastFocusedEl = null;

  document.addEventListener(
    'focusin',
    (e) => {
      if (isEditable(e.target)) lastFocusedEl = e.target;
    },
    true
  );

  function isEditable(el) {
    if (!el) return false;
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    return tag === 'input' || tag === 'textarea' || el.isContentEditable;
  }

  function closePanel() {
    if (panelHost) {
      panelHost.remove();
      panelHost = null;
    }
  }

  function openPanel() {
    closePanel();

    const domain = getDomain();
    const history = getDomainHistory(domain).slice().reverse(); // newest first

    panelHost = document.createElement('div');
    panelHost.style.position = 'fixed';
    panelHost.style.zIndex = '2147483647';
    positionNearTarget(panelHost);
    document.documentElement.appendChild(panelHost);

    const shadow = panelHost.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        .panel {
          font-family: -apple-system, Segoe UI, Roboto, sans-serif;
          width: 320px;
          max-height: 360px;
          overflow-y: auto;
          background: #1e1e1e;
          color: #eee;
          border: 1px solid #444;
          border-radius: 8px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
          font-size: 13px;
        }
        .header {
          padding: 8px 10px;
          font-weight: 600;
          border-bottom: 1px solid #333;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .domain { color: #9ecbff; }
        ul { list-style: none; margin: 0; padding: 4px; }
        li {
          padding: 6px 8px;
          border-radius: 4px;
          cursor: pointer;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        li:hover { background: #333; }
        .empty { padding: 12px; color: #888; text-align: center; }
      </style>
      <div class="panel">
        <div class="header">
          <span>Clipboard History &mdash; <span class="domain">${escapeHtml(domain)}</span></span>
        </div>
        <ul>
          ${
            history.length
              ? history
                  .map(
                    (item, i) =>
                      `<li data-idx="${i}" title="${escapeHtml(item.text)}">${escapeHtml(truncate(item.text, 60))}</li>`
                  )
                  .join('')
              : '<li class="empty">No history for this site yet</li>'
          }
        </ul>
      </div>
    `;

    shadow.querySelectorAll('li[data-idx]').forEach((li) => {
      li.addEventListener('click', () => {
        const idx = Number(li.getAttribute('data-idx'));
        const item = history[idx];
        if (item && lastFocusedEl) {
          insertIntoElement(lastFocusedEl, item.text);
        }
        closePanel();
      });
    });

    // Close on outside click / Escape
    setTimeout(() => {
      document.addEventListener('mousedown', outsideClickHandler);
      document.addEventListener('keydown', escHandler);
    }, 0);
  }

  function outsideClickHandler(e) {
    if (panelHost && !panelHost.contains(e.target)) {
      closePanel();
      document.removeEventListener('mousedown', outsideClickHandler);
    }
  }

  function escHandler(e) {
    if (e.key === 'Escape') {
      closePanel();
      document.removeEventListener('keydown', escHandler);
    }
  }

  function positionNearTarget(host) {
    const target = lastFocusedEl;
    if (target && target.getBoundingClientRect) {
      const rect = target.getBoundingClientRect();
      const top = Math.min(rect.bottom + 6, window.innerHeight - 380);
      const left = Math.min(rect.left, window.innerWidth - 340);
      host.style.top = `${Math.max(top, 8)}px`;
      host.style.left = `${Math.max(left, 8)}px`;
    } else {
      host.style.top = '80px';
      host.style.right = '20px';
    }
  }

  function truncate(str, n) {
    return str.length > n ? str.slice(0, n) + '…' : str;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  /* ----------------------------------------------------------------
   * Keyboard shortcut (FR-03)
   * ------------------------------------------------------------- */
  document.addEventListener('keydown', (e) => {
    const matches =
      e.key.toUpperCase() === SHORTCUT.key &&
      e.altKey === SHORTCUT.alt &&
      e.shiftKey === SHORTCUT.shift &&
      e.ctrlKey === SHORTCUT.ctrl;

    if (matches) {
      e.preventDefault();
      if (panelHost) {
        closePanel();
      } else {
        openPanel();
      }
    }
  });

  /* ----------------------------------------------------------------
   * Settings menu (Tampermonkey menu commands)
   * ------------------------------------------------------------- */
  GM_registerMenuCommand('Clipboard History: Set retention → Last 30 items', () => {
    const s = loadSettings();
    s.retentionMode = 'count';
    s.maxCount = 30;
    saveSettings(s);
    alert('Retention set to: last 30 items per site.');
  });

  GM_registerMenuCommand('Clipboard History: Set retention → 24 hours', () => {
    const s = loadSettings();
    s.retentionMode = 'time';
    s.maxAgeMs = 24 * 60 * 60 * 1000;
    saveSettings(s);
    alert('Retention set to: 24 hours per site.');
  });

  GM_registerMenuCommand('Clipboard History: Set retention → Unlimited', () => {
    const s = loadSettings();
    s.retentionMode = 'unlimited';
    saveSettings(s);
    alert('Retention set to: unlimited (clear manually).');
  });

  GM_registerMenuCommand('Clipboard History: Clear history for this site', () => {
    const all = loadAll();
    delete all[getDomain()];
    saveAll(all);
    alert('Cleared clipboard history for ' + getDomain());
  });
})();
