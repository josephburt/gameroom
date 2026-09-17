/* Home: TV + shelf. Console cards are real links to play.html. */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  async function renderRecents() {
    const wrap = $("recents-wrap");
    const root = $("recents");
    if (!wrap || !root || !window.GrokLibrary) return;
    const games = await GrokLibrary.list();
    if (!games.length) {
      wrap.hidden = true;
      root.innerHTML = "";
      return;
    }
    wrap.hidden = false;
    root.innerHTML = "";
    games.forEach(function (g) {
      const spec = GrokSystems.byId[g.kind];
      if (!spec) return;
      const card = document.createElement("div");
      card.className = "recent";
      const open = document.createElement("a");
      open.className = "recent-open";
      open.href = GrokSystems.playUrl(g.kind, g.tooLarge ? {} : { resume: g.id });
      open.setAttribute("aria-label", "Continue " + (g.title || g.name) + " on " + spec.label);
      const thumb = g.shot
        ? "<img alt=\"\" src=\"" + g.shot + "\" />"
        : "<div class=\"recent-ph\" aria-hidden=\"true\"></div>";
      open.innerHTML = thumb +
        "<div class=\"recent-meta\"><strong>" + escapeHtml(g.title || g.name) + "</strong><span>" +
        spec.label + (g.tooLarge ? " · load from library" : "") + "</span></div>";
      const x = document.createElement("button");
      x.type = "button";
      x.className = "recent-x";
      x.textContent = "×";
      x.title = "Remove";
      x.setAttribute("aria-label", "Remove " + (g.title || g.name) + " from Continue");
      x.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        GrokLibrary.remove(g.id).then(renderRecents);
      };
      card.appendChild(open);
      card.appendChild(x);
      root.appendChild(card);
    });
    if (!root.children.length) {
      wrap.hidden = true;
    }
  }

  function paintTv() {
    const screen = $("room-tv-screen");
    const sub = $("room-tv-sub");
    if (!screen || !window.GrokLibrary) return;
    GrokLibrary.list().then(function (games) {
      if (screen.hasAttribute("data-hover")) return;
      const last = games.filter(function (g) { return GrokSystems.byId[g.kind]; })[0];
      if (!last) return;
      screen.setAttribute("data-signal", "standby");
      if (sub) sub.textContent = (last.title || last.name) + " · " + (GrokSystems.byId[last.kind].short || last.kind);
      if (last.shot) {
        screen.style.backgroundImage = "url(\"" + last.shot + "\")";
        screen.style.backgroundSize = "cover";
        screen.style.backgroundPosition = "center";
      }
    }).catch(function () {});
  }

  function wireShelfTv() {
    const screen = $("room-tv-screen");
    const sub = $("room-tv-sub");
    if (!screen) return;
    const cards = document.querySelectorAll(".room .sys-card[data-sys]");
    function tint(card) {
      const id = card.getAttribute("data-sys");
      const spec = window.GrokSystems && GrokSystems.byId[id];
      const accent = getComputedStyle(card).getPropertyValue("--card-accent").trim() ||
        (spec && spec.color) || "#5dffc0";
      screen.style.setProperty("--tv-accent", accent);
      screen.setAttribute("data-hover", id);
      if (sub && spec) sub.textContent = spec.label + " · click to load";
    }
    function clear() {
      screen.removeAttribute("data-hover");
      screen.style.removeProperty("--tv-accent");
      if (sub && screen.getAttribute("data-signal") !== "standby") {
        sub.textContent = "AV-1 · pick a console";
      }
      paintTv();
    }
    cards.forEach(function (card) {
      card.addEventListener("mouseenter", function () { tint(card); });
      card.addEventListener("mouseleave", clear);
      card.addEventListener("focus", function () { tint(card); });
      card.addEventListener("blur", clear);
    });
  }

  function initDesktopBanner() {
    const banner = $("desktop-banner");
    if (!banner) return;
    let dismissed = false;
    try { dismissed = localStorage.getItem("gr-desktop-banner") === "off"; } catch (e) {}
    const small = window.matchMedia && (
      window.matchMedia("(max-width: 900px)").matches ||
      window.matchMedia("(pointer: coarse)").matches
    );
    if (small && !dismissed) banner.hidden = false;
    const x = $("desktop-banner-x");
    if (x) x.onclick = function () {
      banner.hidden = true;
      try { localStorage.setItem("gr-desktop-banner", "off"); } catch (e) {}
    };
  }

  let installEvt = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    installEvt = e;
    const btn = $("btn-install");
    if (btn) btn.hidden = false;
  });
  const installBtn = $("btn-install");
  if (installBtn) {
    installBtn.onclick = function () {
      if (!installEvt) return;
      installEvt.prompt();
      installEvt.userChoice.finally(function () {
        installEvt = null;
        installBtn.hidden = true;
      });
    };
  }

  const about = $("about-dlg");
  const aboutBtn = $("btn-about-top");
  const aboutClose = $("about-close");
  if (aboutBtn && about) aboutBtn.onclick = function () { about.showModal(); };
  if (aboutClose && about) aboutClose.onclick = function () { about.close(); };

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }

  initDesktopBanner();
  renderRecents().catch(function () {});
  paintTv();
  wireShelfTv();
})();
