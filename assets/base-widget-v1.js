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
    // PRODUCTION MODE: skip debug entirely if URL has ?prod=1
    // Use this when widget is live for real users — no debug overlay possible.
    if (window.location.search.indexOf('prod=1') !== -1) {
      AWW.debugBar.style.display = 'none';
      AWW.debugBar.parentNode.removeChild(AWW.debugBar);
      AWW.debugBar = null;
      console.log('[AWW] Production mode — debug overlay disabled.');
      return;
    }

    // DEBUG MODE: create a dedicated invisible 44x44 tap zone in top-left corner
    // (not bottom — bottom can be obscured by Zoho's mobile chrome)
    // This is more reliable than tapping the tiny version marker.
    var tapZone = document.createElement('div');
    tapZone.id = 'aww-debug-tap-zone';
    tapZone.style.cssText =
      'position: absolute;' +
      'top: 0;' +
      'left: 0;' +
      'width: 44px;' +
      'height: 44px;' +
      'z-index: 9998;' +
      'background: transparent;' +  // invisible
      'cursor: pointer;' +
      '-webkit-tap-highlight-color: transparent;' +
      'touch-action: manipulation;';
    document.body.appendChild(tapZone);

    var lastTap = 0;
    function handleTap(e) {
      e.stopPropagation();
      e.preventDefault();
      var now = Date.now();
      if (now - lastTap < 500) {
        AWW.debugBar.classList.toggle('is-open');
        AWW.debug('Debug overlay toggled (double-tap top-left corner)', 'info');
      }
      lastTap = now;
    }
    tapZone.addEventListener('pointerup', handleTap);
    tapZone.addEventListener('click', handleTap);

    // Also force-show via URL flag for laptop testing
    if (window.location.search.indexOf('debug=1') !== -1) {
      AWW.debugBar.classList.add('is-open');
    }
  };

  AWW.debug = function(msg, type) {
    type = type || 'info';
    console.log('[AWW] ' + msg);
    // In production mode, debugBar is removed — only console.log
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
     NAVIGATION — open Zoho native views from inside widget
     =========================================================================== */

  /**
   * Navigate the parent window to a Zoho Creator URL.
   * Per Zoho docs: action='open' requires both 'url' AND 'window' params.
   * 'window: same' is essential — 'new' opens a separate browser window (silently
   * fails on mobile native apps).
   *
   * @param {string} url - Absolute URL or relative hash like '#Report:name'
   * @param {object} opts - {window: 'same'|'new'} — defaults to 'same'
   */
  AWW.navigate = function(url, opts) {
    opts = opts || {};
    var windowMode = opts.window || 'same';

    if (typeof ZOHO === 'undefined' || !ZOHO.CREATOR || !ZOHO.CREATOR.UTIL) {
      AWW.debug('navigate: SDK unavailable (standalone mode) — would have opened ' + url, 'warn');
      return false;
    }
    try {
      var config = {
        action: 'open',
        url: url,
        window: windowMode
      };
      AWW.debug('navigate config: ' + JSON.stringify(config), 'info');
      ZOHO.CREATOR.UTIL.navigateParentURL(config);
      AWW.debug('navigate: ' + url + ' (' + windowMode + ')', 'success');
      return true;
    } catch (err) {
      AWW.debug('navigate ERROR: ' + (err.message || JSON.stringify(err)), 'error');
      return false;
    }
  };

  /**
   * Convenience helper: navigate to a report by link name.
   * Builds absolute URL using current Zoho host (not relative hash).
   */
  AWW.navigateToReport = function(reportLinkName) {
    // Build absolute URL — relative hashes don't work reliably in widget context
    // Per Zoho docs example: https://creatorapp.zoho.com/owner/app/#Report:name
    var ownerName = 'artwtrbeverages';
    var appName = AWW.appName || 'aw-operations';
    // Use .in TLD for India edition
    var url = 'https://creatorapp.zoho.in/' + ownerName + '/' + appName + '/#Report:' + reportLinkName;
    return AWW.navigate(url, { window: 'same' });
  };

  /* ===========================================================================
     PULL-TO-REFRESH — basic touch gesture
     =========================================================================== */

  AWW.enablePullToRefresh = function(callback) {
    var startY = 0;
    var pulling = false;
    var threshold = 60;

    document.body.addEventListener('touchstart', function(e) {
      if (window.scrollY > 0) return;
      startY = e.touches[0].clientY;
      pulling = true;
    });

    document.body.addEventListener('touchmove', function(e) {
      if (!pulling) return;
      var delta = e.touches[0].clientY - startY;
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
