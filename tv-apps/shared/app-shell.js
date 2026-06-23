/**
 * Shared TV wrapper shell — loaded by Tizen, webOS, and sideload test pages.
 * Loads the hosted Streamly web app in a fullscreen iframe.
 */
(function () {
  var DEFAULT_BASE = "https://iptvwebplayer.org";
  var DEFAULT_PATH = "/login";

  var params = new URLSearchParams(window.location.search);
  var base = (params.get("url") || DEFAULT_BASE).replace(/\/$/, "");
  var path = params.get("path") || DEFAULT_PATH;
  var src = base + (path.startsWith("/") ? path : "/" + path);

  var frame = document.getElementById("app");
  var loader = document.getElementById("loader");
  var err = document.getElementById("error");

  function showError(message) {
    if (loader) loader.hidden = true;
    if (err) {
      err.hidden = false;
      var msg = err.querySelector("[data-error-msg]");
      if (msg) msg.textContent = message;
    }
  }

  function hideLoader() {
    if (loader) loader.hidden = true;
  }

  if (!frame) return;

  frame.addEventListener("load", function () {
    hideLoader();
  });

  frame.addEventListener("error", function () {
    showError("Could not load Streamly. Check your internet connection.");
  });

  window.setTimeout(function () {
    if (loader && !loader.hidden) {
      showError("Streamly is taking longer than usual. Check your connection or try again.");
    }
  }, 25000);

  frame.src = src;

  /** Samsung Tizen — map Return key to history back inside the iframe when possible. */
  document.addEventListener("keydown", function (e) {
    if (e.keyCode !== 10009) return; /* RETURN */
    try {
      if (frame.contentWindow && frame.contentWindow.history.length > 1) {
        frame.contentWindow.history.back();
        e.preventDefault();
      }
    } catch {
      /* cross-origin — let the hosted app handle back */
    }
  });

  /** webOS — Back button */
  document.addEventListener(
    "webOSRelaunch",
    function () {
      frame.src = src;
    },
    false
  );
})();
