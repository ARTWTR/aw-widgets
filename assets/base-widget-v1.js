/* =============================================================================
   ART WTR Base Widget — v1.0
   Last updated: 29 April 2026
   Depends on: Zoho Widget JS SDK v2 (loaded separately in widget HTML)
   Companion CSS: design-tokens-v1.css, components-v1.css
   =============================================================================
   Shared utilities for every widget. Exposes a global AWW namespace.

   Usage in widget HTML:
     <script src="https://js.zohostatic.com/creator/widgets/version/2.0/widgetsdk-min.js"></script>
     <script src="./assets/base-widget-v1.js"></script>
     <link rel="stylesheet" href="./assets/design-tokens-v1.css">
     <link rel="stylesheet" href="./assets/components-v1.css">

   Then in widget script:
     AWW.init({ appName: 'aw-operations' });
     AWW.fetchCount('to_review').then(count => ...);
     AWW.Drawer.open({ title: 'Pending', content: '<div>...</div>' });
   ============================================================================= */

(function(global) {
  'use strict';

  var AWW = {
    version: '1.0',
    appName: null,
    timeoutMs: 8000,
    debugBar: null
  };

  /* ===========================================================================
     INIT — call once at start of every widget
     =========================================================================== */
  AWW.init = function(config) {
    AWW.appName = config.appName || 'aw-operations';
    AWW.timeoutMs = config.timeoutMs || 8000;

    // Wire up debug overlay if present in DOM
    AWW.debugBar = document.querySelector('.debug-overlay');
    if (AWW.debugBar) {
      AWW._wireDebugToggle();
    }

    AWW.debug('AWW init v' + AWW.version + ' — app: ' + AWW.appName, 'info');
    AWW.debug('SDK present: ' + (typeof ZOHO !== 'undefined'), 'info');
  };

  /* ===========================================================================
     DEBUG OVERLAY
     =========================================================================== */
  AWW._wireDebugToggle = function() {
    // Listen for double-tap on the version marker (small bottom-right corner)
    // Previously listened on body, but that could conflict with widget tap handlers
    var versionMarker = document.querySelector('.version-marker');
    if (!versionMarker) {
      // Fallback: bottom-right corner double-tap zone if no version marker
      console.warn('[AWW] No .version-marker found — debug toggle disabled. Add ?debug to URL to force-show.');
      return;
    }
    // Make version marker tappable
    versionMarker.style.pointerEvents = 'auto';
    versionMarker.style.cursor = 'pointer';
    versionMarker.style.padding = '8px';
    versionMarker.style.minWidth = '32px';
    versionMarker.style.minHeight = '32px';

    var lastTap = 0;
    versionMarker.addEventListener('click', function(e) {
      e.stopPropagation();
      var now = Date.now();
      if (now - lastTap < 400) {
        AWW.debugBar.classList.toggle('is-open');
      }
      lastTap = now;
    });
    if (window.location.search.indexOf('debug') !== -1) {
      AWW.debugBar.classList.add('is-open');
    }
  };

  AWW.debug = function(msg, type) {
    type = type || 'info';
    console.log('[AWW] ' + msg);
    if (!AWW.debugBar) return;
    var line = document.createElement('div');
    line.className = 'debug-line debug-line--' + type;
    line.textContent = '[' + new Date().toTimeString().substring(0, 8) + '] ' + msg;
    AWW.debugBar.appendChild(line);
    AWW.debugBar.scrollTop = AWW.debugBar.scrollHeight;
  };

  /* ===========================================================================
     SDK CALLS — wrapped with timeout, error handling, sequential chaining
     =========================================================================== */

  AWW._withTimeout = function(promise, ms, label) {
    return new Promise(function(resolve, reject) {
      var timedOut = false;
      var timer = setTimeout(function() {
        timedOut = true;
        reject(new Error('TIMEOUT after ' + ms + 'ms: ' + label));
      }, ms);
      promise.then(
        function(r) { if (!timedOut) { clearTimeout(timer); resolve(r); } },
        function(e) { if (!timedOut) { clearTimeout(timer); reject(e); } }
      );
    });
  };

  AWW._isEmptyReportError = function(err) {
    if (!err) return false;
    var s = '';
    try { s = JSON.stringify(err); } catch(e) { s = String(err); }
    return s.indexOf('9220') !== -1 || s.toLowerCase().indexOf('no records') !== -1;
  };

  AWW._isTimeoutError = function(err) {
    return err && err.message && err.message.indexOf('TIMEOUT') === 0;
  };

  AWW._sdkAvailable = function() {
    return typeof ZOHO !== 'undefined' && ZOHO.CREATOR && ZOHO.CREATOR.DATA;
  };

  /**
   * Fetch the count of records in a report.
   * Returns a Promise that resolves to a number, or null on error.
   * Empty reports (Zoho 9220) resolve to 0, not error.
   */
  AWW.fetchCount = function(reportName) {
    if (!AWW._sdkAvailable()) {
      AWW.debug(reportName + ' (count): SDK unavailable', 'warn');
      return Promise.resolve(null);
    }

    var config = { app_name: AWW.appName, report_name: reportName };
    AWW.debug('Counting ' + reportName + '...', 'info');

    var apiPromise;
    try {
      apiPromise = ZOHO.CREATOR.DATA.getRecordCount(config);
    } catch (syncErr) {
      if (AWW._isEmptyReportError(syncErr)) {
        AWW.debug(reportName + ' EMPTY (=0)', 'info');
        return Promise.resolve(0);
      }
      AWW.debug(reportName + ' SYNC THROW', 'error');
      return Promise.resolve(null);
    }

    if (!apiPromise || typeof apiPromise.then !== 'function') {
      AWW.debug(reportName + ' did not return a promise', 'error');
      return Promise.resolve(null);
    }

    return AWW._withTimeout(apiPromise, AWW.timeoutMs, reportName)
      .then(function(r) {
        var count = (r && r.result && r.result.records_count !== undefined) ? r.result.records_count : null;
        if (count === null) {
          AWW.debug(reportName + ' UNEXPECTED SHAPE', 'warn');
          return null;
        }
        AWW.debug(reportName + ' = ' + count, 'success');
        return count;
      })
      .catch(function(err) {
        if (AWW._isEmptyReportError(err)) {
          AWW.debug(reportName + ' EMPTY (=0)', 'info');
          return 0;
        }
        if (AWW._isTimeoutError(err)) {
          AWW.debug(reportName + ' TIMEOUT', 'error');
          return null;
        }
        AWW.debug(reportName + ' ERROR', 'error');
        return null;
      });
  };

  /**
   * Fetch records from a report (full data, not just count).
   * Returns a Promise that resolves to an array of records, or [] on error.
   */
  AWW.fetchRecords = function(reportName, criteria) {
    if (!AWW._sdkAvailable()) {
      AWW.debug(reportName + ' (records): SDK unavailable', 'warn');
      return Promise.resolve([]);
    }

    var config = { app_name: AWW.appName, report_name: reportName };
    if (criteria) config.criteria = criteria;

    AWW.debug('Fetching records: ' + reportName, 'info');

    var apiPromise;
    try {
      apiPromise = ZOHO.CREATOR.DATA.getRecords(config);
    } catch (syncErr) {
      if (AWW._isEmptyReportError(syncErr)) return Promise.resolve([]);
      AWW.debug(reportName + ' records SYNC THROW', 'error');
      return Promise.resolve([]);
    }

    if (!apiPromise || typeof apiPromise.then !== 'function') {
      return Promise.resolve([]);
    }

    return AWW._withTimeout(apiPromise, AWW.timeoutMs, reportName + ' records')
      .then(function(r) {
        var records = (r && r.data) ? r.data : [];
        AWW.debug(reportName + ' returned ' + records.length + ' records', 'success');
        return records;
      })
      .catch(function(err) {
        if (AWW._isEmptyReportError(err)) {
          AWW.debug(reportName + ' empty', 'info');
          return [];
        }
        AWW.debug(reportName + ' records ERROR', 'error');
        return [];
      });
  };

  /**
   * Run multiple fetches sequentially (NEVER parallel — Zoho SDK Quirk 2).
   * Pass an array of {name, fn} objects where fn returns a promise.
   * Returns a Promise that resolves when all are done.
   */
  AWW.runSequential = function(tasks) {
    var chain = Promise.resolve();
    tasks.forEach(function(task) {
      chain = chain.then(function() { return task(); });
    });
    return chain;
  };

  /* ===========================================================================
     DRAWER — slide-up bottom sheet, summoned by any widget
     =========================================================================== */

  AWW.Drawer = (function() {
    var scrim = null;
    var drawer = null;
    var titleEl = null;
    var contentEl = null;
    var isOpen = false;

    function ensureDOM() {
      if (drawer) return;

      // Build scrim
      scrim = document.createElement('div');
      scrim.className = 'drawer-scrim';
      scrim.addEventListener('click', close);

      // Build drawer
      drawer = document.createElement('div');
      drawer.className = 'drawer';
      drawer.innerHTML =
        '<div class="drawer__handle"></div>' +
        '<div class="drawer__header">' +
          '<div class="drawer__title"></div>' +
          '<button class="drawer__close" aria-label="Close">×</button>' +
        '</div>' +
        '<div class="drawer-content"></div>';

      titleEl = drawer.querySelector('.drawer__title');
      contentEl = drawer.querySelector('.drawer-content');
      drawer.querySelector('.drawer__close').addEventListener('click', close);

      // Swipe-down to close (basic implementation)
      var startY = 0;
      var currentY = 0;
      var dragging = false;
      drawer.querySelector('.drawer__handle').addEventListener('touchstart', function(e) {
        startY = e.touches[0].clientY;
        dragging = true;
      });
      drawer.addEventListener('touchmove', function(e) {
        if (!dragging) return;
        currentY = e.touches[0].clientY;
        var delta = Math.max(0, currentY - startY);
        drawer.style.transform = 'translateY(' + delta + 'px)';
      });
      drawer.addEventListener('touchend', function() {
        if (!dragging) return;
        dragging = false;
        var delta = currentY - startY;
        if (delta > 100) {
          close();
        } else {
          drawer.style.transform = '';
        }
      });

      document.body.appendChild(scrim);
      document.body.appendChild(drawer);
    }

    function open(opts) {
      ensureDOM();
      titleEl.textContent = opts.title || '';
      if (typeof opts.content === 'string') {
        contentEl.innerHTML = opts.content;
      } else if (opts.content instanceof Node) {
        contentEl.innerHTML = '';
        contentEl.appendChild(opts.content);
      }
      // Force reflow before adding is-open class so transition runs
      drawer.offsetHeight;
      scrim.classList.add('is-open');
      drawer.classList.add('is-open');
      isOpen = true;
      AWW.debug('Drawer opened: ' + (opts.title || 'untitled'), 'info');
    }

    function close() {
      if (!isOpen) return;
      scrim.classList.remove('is-open');
      drawer.classList.remove('is-open');
      drawer.style.transform = '';
      isOpen = false;
      AWW.debug('Drawer closed', 'info');
    }

    function setLoading(label) {
      if (!contentEl) return;
      contentEl.innerHTML = '<div class="drawer-content__loading">' + (label || 'Loading...') + '</div>';
    }

    function setEmpty(label) {
      if (!contentEl) return;
      contentEl.innerHTML = '<div class="drawer-content__empty">' + (label || 'No items.') + '</div>';
    }

    function setContent(html) {
      if (!contentEl) return;
      contentEl.innerHTML = html;
    }

    return {
      open: open,
      close: close,
      setLoading: setLoading,
      setEmpty: setEmpty,
      setContent: setContent,
      isOpen: function() { return isOpen; }
    };
  })();

  /* ===========================================================================
     PULL-TO-REFRESH — basic touch gesture
     =========================================================================== */

  AWW.enablePullToRefresh = function(callback) {
    var startY = 0;
    var pulling = false;
    var threshold = 60;

    document.body.addEventListener('touchstart', function(e) {
      // Only trigger if at top of scroll AND drawer is closed
      if (window.scrollY > 0 || AWW.Drawer.isOpen()) return;
      startY = e.touches[0].clientY;
      pulling = true;
    });

    document.body.addEventListener('touchmove', function(e) {
      if (!pulling) return;
      var delta = e.touches[0].clientY - startY;
      // No visual indicator yet — keeping it simple
      if (delta > threshold) {
        pulling = false;
        AWW.debug('Pull-to-refresh triggered', 'info');
        callback();
      }
    });

    document.body.addEventListener('touchend', function() {
      pulling = false;
    });
  };

  /* ===========================================================================
     EXPOSE
     =========================================================================== */
  global.AWW = AWW;

})(window);
