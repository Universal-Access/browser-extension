// Schema Aggregation — asks the service worker to probe Yoast Schema Aggregation
// The service worker has host_permissions and handles the actual fetch + XML parsing

(function () {
  'use strict';

  function detect() {
    if (!['http:', 'https:'].includes(window.location.protocol)) return;

    try {
      if (chrome.runtime?.id) {
        chrome.runtime.sendMessage({
          type: 'PROBE_SCHEMA_AGGREGATION',
          origin: window.location.origin
        }).catch(() => {});
      }
    } catch {
      // Extension context invalidated
    }
  }

  detect();
})();
