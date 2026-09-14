(() => {
  "use strict";

  // Shared chrome for every page: theme switcher, reveal/decode animations,
  // clock, and the runtime-injected lab panel.
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  // Virtual links: <span data-url> inside .repo-row (can't nest <a> in <a>).
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  $$(".cf-link").forEach(el => {
    el.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      window.open(el.dataset.url, "_blank", "noopener");
    });
  });

  // Live UTC clock in the hero strip.
  const clocks = $$("[data-clock]");
  if (clocks.length) {
    const pad = n => String(n).padStart(2, "0");
    const tick = () => {
      const d = new Date();
      const t = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
      clocks.forEach(el => { el.textContent = t; });
    };
    tick();
    setInterval(tick, 1000);
  }

  // UTC offset from Europe/Berlin via Intl (DST-aware, locale-independent).
  const tzEls = $$("[data-tz]");
  if (tzEls.length) {
    const tzLabel = () => {
      try {
        const dtf = new Intl.DateTimeFormat("en-US", {
          timeZone: "Europe/Berlin",
          hour12: false,
          year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit", second: "2-digit"
        });
        const parts = {};
        dtf.formatToParts(new Date()).forEach(x => { parts[x.type] = x.value; });
        const asUtc = Date.UTC(
          Number(parts.year), Number(parts.month) - 1, Number(parts.day),
          Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)
        );
        let off = Math.round((asUtc - Date.now()) / 36e5);
        while (off > 13) off -= 24;
        while (off < -11) off += 24;
        return off >= 0 ? "UTC+" + off : "UTC-" + Math.abs(off);
      } catch (_) {
        return "UTC+1";
      }
    };
    const label = tzLabel();
    tzEls.forEach(el => { el.textContent = label; });
  }

  // Live release info from GitHub. Elements opt in with data-release="owner/repo";
  // add data-release-date to also render the published date (dossier meta rows).
  // Hand-written values stay in the markup as a no-network fallback.
  const releaseEls = $$("[data-release]");
  if (releaseEls.length) {
    const isoDate = str => (str || "").slice(0, 10);
    releaseEls.forEach(el => {
      const repo = el.dataset.release;
      fetch("https://api.github.com/repos/" + repo + "/releases/latest")
        .then(res => { if (!res.ok) throw new Error(res.status); return res.json(); })
        .then(json => {
          const tag = json.tag_name || "";
          el.textContent = el.hasAttribute("data-release-date")
            ? tag + " — " + isoDate(json.published_at)
            : tag;
        })
        .catch(() => {});
    });
  }

  // Live commit count from GitHub. Elements opt in with data-commits="owner/repo"
  // and keep a hand-written count in the markup as a no-network fallback.
  // The count comes from the Link header on a per_page=1 commits request:
  // its rel="last" page number equals the total number of commits.
  const commitEls = $$("[data-commits]");
  if (commitEls.length) {
    commitEls.forEach(el => {
      const repo = el.dataset.commits;
      fetch("https://api.github.com/repos/" + repo + "/commits?per_page=1")
        .then(res => { if (!res.ok) throw new Error(res.status); return res.headers.get("Link") || ""; })
        .then(link => {
          const m = link.match(/<([^>]+?)(\?|&)page=(\d+)>\s*;\s*rel="last"/);
          if (!m) return;
          el.textContent = Number(m[3]).toLocaleString("en-US");
        })
        .catch(() => {});
    });
  }

  const GLYPHS = "#/\\<>|=+*%@$&?!;:^~01";
  // "Hacker" text reveal: scramble chars, resolve left-to-right.
  function decode(el) {
    const finalText = el.textContent;
    if (!finalText.trim() || el.classList.contains("decoding")) return;
    if (reduceMotion) { el.classList.add("decoded"); return; }
    el.classList.add("decoding");
    const chars = Array.from(finalText);
    const jitter = chars.map(() => Math.random());
    const span = Math.min(1400, Math.max(520, chars.length * 42));
    const start = performance.now();
    const step = now => {
      const t = Math.min(1, (now - start) / span);
      let out = "";
      chars.forEach((c, i) => {
        if (c === " " || c === "—" || c === "/" || c === "·") { out += c; return; }
        const threshold = (i / chars.length) * 0.72 + jitter[i] * 0.18;
        out += t >= threshold ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      });
      el.textContent = out;
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = finalText;
        el.classList.add("decoded");
      }
    };
    requestAnimationFrame(step);
  }
  $$("[data-decode]").forEach(decode);

  // Scroll-in reveal; falls back to all-visible without IntersectionObserver.
  const revealables = $$("[data-reveal], .sec-head");
  if ("IntersectionObserver" in window && !reduceMotion) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px 0px 0px" });
    revealables.forEach(el => io.observe(el));
  } else {
    revealables.forEach(el => el.classList.add("revealed"));
  }

  // Solid header on scroll + reading-progress bar. rAF-throttled.
  const head = $(".site-head");
  const progress = $("[data-progress]");
  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (head) head.classList.toggle("scrolled", scrollY > 8);
      if (progress) {
        const max = document.documentElement.scrollHeight - innerHeight;
        progress.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
      }
    });
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Theme cycling. Persisted to localStorage; "" = default (Graphite).
  const THEMES = [
    ["", "Graphite"],
    ["ivory", "Ivory"],
    ["midnight", "Midnight"],
    ["mist", "Mist"],
    ["phosphor", "Phosphor"]
  ];
  const themeBtn = $("[data-theme-btn]");
  const themeName = $("[data-theme-name]");

  function currentThemeId() {
    const t = document.documentElement.dataset.theme;
    return THEMES.some(entry => entry[0] === t) ? t : "";
  }

  function renderThemeName() {
    if (!themeName) return;
    const match = THEMES.find(entry => entry[0] === currentThemeId()) || THEMES[0];
    themeName.textContent = match[1];
  }

  renderThemeName();

  // Tab icon: regenerate the SVG favicon from the active theme's --bg and
  // --accent colors so it tracks the palette when the theme is switched.
  const favLink = $('link[rel="icon"]');
  const toHex = c => {
    const m = c.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) {
      return m.slice(1).map(v =>
        (v = parseInt(v, 10).toString(16)).length === 1 ? "0" + v : v
      ).join("");
    }
    return c.replace(/#/, "");
  };
  const applyFav = () => {
    if (!favLink) return;
    const cs = getComputedStyle(document.documentElement);
    const bg = toHex(cs.getPropertyValue("--bg").trim());
    const accent = toHex(cs.getPropertyValue("--accent").trim());
    if (!bg || !accent) return;
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>"
      + "<rect width='64' height='64' fill='#" + bg + "'/>"
      + "<rect x='10' y='10' width='44' height='44' fill='none' stroke='#" + accent + "' stroke-width='5'/>"
      + "<circle cx='43' cy='43' r='7' fill='#" + accent + "'/>"
      + "</svg>";
    favLink.setAttribute("href", "data:image/svg+xml," + encodeURIComponent(svg));
  };
  if (favLink) {
    applyFav();
    addEventListener("silenz:theme", applyFav);
    addEventListener("load", applyFav);
  }

  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      const idx = THEMES.findIndex(entry => entry[0] === currentThemeId());
      const next = THEMES[(idx + 1) % THEMES.length];
    if (next[0]) {
      document.documentElement.dataset.theme = next[0];
    } else {
      delete document.documentElement.dataset.theme;
    }
    try { localStorage.setItem("silenz:theme", next[0]); } catch (_) {}
    renderThemeName();
    // Notify canvases so they can re-read their CSS colors.
    dispatchEvent(new CustomEvent("silenz:theme"));
  });
  }

  const menuBtn = $("[data-menu-btn]");

  // Open/close the lab side-panel; lock page scroll while it's up.
  function setLab(open) {
    document.body.classList.toggle("lab-open", open);
    if (menuBtn) menuBtn.setAttribute("aria-expanded", String(open));
    const panel = $("#lab-panel");
    if (panel) panel.setAttribute("aria-hidden", String(!open));
    document.body.style.overflow = open ? "hidden" : "";
  }

  if (menuBtn) {
    menuBtn.addEventListener("click", () => setLab(!document.body.classList.contains("lab-open")));
  }
  addEventListener("keydown", event => {
    if (event.key === "Escape") setLab(false);
  });

  // Lab nav lives in _lab-panel.html (shared across pages), so fetch and
  // inject it beside the header. {{P}} → resolved relative base path.
  (function loadPanel() {
    const jsEl = document.querySelector('script[src$="main.js"]');
    const base = jsEl ? jsEl.src.replace(/main\.js.*$/, "") : "";
    fetch(base + "_lab-panel.html")
      .then(response => { if (!response.ok) throw new Error(response.status); return response.text(); })
      .then(html => {
        html = html.split("{{P}}").join(base);
        const headEl = $(".site-head");
        if (!headEl) return;
        headEl.insertAdjacentHTML("afterend", html);
        const scrim = $("[data-scrim]");
        if (scrim) scrim.addEventListener("click", () => setLab(false));
        const closeBtn = $("[data-lab-close]");
        if (closeBtn) closeBtn.addEventListener("click", () => setLab(false));
        $$(".lab a[href]").forEach(a => a.addEventListener("click", () => setLab(false)));
        const currentFile = location.pathname.split("/").pop();
        $$(".lab a[href]").forEach(a => {
          if (a.getAttribute("href").split("/").pop() === currentFile) a.setAttribute("aria-current", "page");
        });
        autoNumber(base);
      })
      .catch(() => {});
  })();

  // Inject the real totals into the data-lab-total / data-dossier-total
  // placeholders. Lab total comes from the injected panel entries, dossier
  // total from the index .files list (fetched on dossier pages).
  function autoNumber(base) {
    const pad = n => String(n).padStart(2, "0");
    const labCount = $$(".lab-link").length;
    if (labCount) {
      $$("[data-lab-total]").forEach(el => { el.textContent = pad(labCount); });
    }
    const dossierCount = $$(".files li").length;
    if (dossierCount) {
      $$("[data-dossier-total]").forEach(el => { el.textContent = pad(dossierCount); });
    } else if (/\/dossiers\//.test(location.pathname)) {
      fetch(base + "index.html")
        .then(r => r.ok ? r.text() : "")
        .then(html => {
          const tmp = document.createElement("div");
          tmp.innerHTML = html;
          const n = tmp.querySelectorAll(".files li").length;
          if (n) $$("[data-dossier-total]").forEach(el => { el.textContent = pad(n); });
        })
        .catch(() => {});
    }
  }
})();
