/* x-feed.js — loader for X/Twitter widgets and helper ensureTwttrLoad */
(function(window, document){
  'use strict';

  // Minimal CSS reset to prevent site blockquote rules from interfering with widget replacement
  if (!document.getElementById('xEmbedResetStyle')) {
    try {
      var sstyle = document.createElement('style');
      sstyle.id = 'xEmbedResetStyle';
      sstyle.textContent = '.markdown-body blockquote.twitter-tweet, #xMediaFeed blockquote.twitter-tweet, .home-x-feed blockquote.twitter-tweet { margin: 0 !important; padding: 0 !important; border: none !important; background: transparent !important; color: inherit !important; font-style: normal !important; } .markdown-body blockquote.twitter-tweet > p, #xMediaFeed blockquote.twitter-tweet > p { margin: 0 !important; padding: 0 !important; color: inherit !important; font-style: normal !important; }';
      (document.head || document.documentElement).appendChild(sstyle);
    } catch (e) {
      // ignore
      console.error('x-feed: failed to inject reset style', e);
    }
  }

  function hasPlatformScript() {
    return !!document.querySelector('script[src*="platform.twitter.com/widgets.js"], script[src*="platform.x.com/widgets.js"], script[src*="platform.twitter.com/js/widgets.js"]');
  }

  function loadScript(src, cb) {
    try {
      if (document.querySelector('script[src="' + src + '"]') || document.querySelector('script[src*="' + src + '"]')) {
        if (cb) cb();
        return;
      }
    } catch (e) {
      // ignore
    }
    var s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.charset = 'utf-8';
    s.onload = function() { if (cb) cb(); };
    s.onerror = function() { if (cb) cb(new Error('Failed to load ' + src)); };
    (document.head || document.documentElement).appendChild(s);
  }

  function tryLoadWidgets(cb) {
    // prefer platform.twitter.com, fallback to platform.x.com
    loadScript('https://platform.twitter.com/widgets.js', function(err){
      if (!err && window.twttr && window.twttr.widgets) {
        if (cb) cb(null);
        return;
      }
      loadScript('https://platform.x.com/widgets.js', function(err2){
        if (cb) cb(err2 || null);
      });
    });
  }

  if (hasPlatformScript()) {
    if (window.twttr && window.twttr.widgets && typeof window.twttr.widgets.load === 'function') {
      try { window.twttr.widgets.load(); } catch (e) { console.error(e); }
    } else {
      var _i = setInterval(function(){
        if (window.twttr && window.twttr.widgets && typeof window.twttr.widgets.load === 'function') {
          clearInterval(_i);
          try { window.twttr.widgets.load(); } catch (e) { console.error(e); }
        }
      }, 200);
      setTimeout(function(){ clearInterval(_i); }, 5000);
    }
  } else {
    tryLoadWidgets(function(err){
      if (err) {
        console.error('x-feed: widgets.js load failed', err);
        return;
      }
      try {
        if (window.twttr && window.twttr.widgets && typeof window.twttr.widgets.load === 'function') {
          window.twttr.widgets.load();
        }
      } catch (e) {
        console.error('x-feed: widgets load call failed', e);
      }
    });
  }

  // Expose helper for other inline scripts
  window.ensureTwttrLoad = function(container) {
    if (window.twttr && window.twttr.widgets && typeof window.twttr.widgets.load === 'function') {
      try { window.twttr.widgets.load(container); } catch (e) { console.error(e); }
      return;
    }
    var _j = setInterval(function(){
      if (window.twttr && window.twttr.widgets && typeof window.twttr.widgets.load === 'function') {
        clearInterval(_j);
        try { window.twttr.widgets.load(container); } catch (e) { console.error(e); }
      }
    }, 200);
    setTimeout(function(){ clearInterval(_j); }, 5000);
  };

  // Observe DOM for blockquote.twitter-tweet insertions and trigger load
  try {
    var observer = new MutationObserver(function(mutations){
      var needLoad = false;
      for (var mi = 0; mi < mutations.length; mi++) {
        var m = mutations[mi];
        if (m.addedNodes && m.addedNodes.length) {
          for (var ni = 0; ni < m.addedNodes.length; ni++) {
            var n = m.addedNodes[ni];
            try {
              if (n && n.nodeType === 1 && (n.matches && n.matches('blockquote.twitter-tweet'))) {
                needLoad = true; break;
              }
              if (n && n.querySelector && n.querySelector('blockquote.twitter-tweet')) { needLoad = true; break; }
            } catch (err) {
              // ignore match errors
            }
          }
        }
        if (needLoad) break;
      }
      if (needLoad) {
        try {
          if (window.ensureTwttrLoad) window.ensureTwttrLoad();
        } catch (e) { console.error(e); }
      }
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  } catch (e) {
    // MutationObserver not supported or failed - ignore
  }

})(window, document);
