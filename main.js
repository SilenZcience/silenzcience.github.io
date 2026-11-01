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

  // One-line header at any browser text scale. Media queries can't see
  // accessibility font scaling (it changes px text, not the viewport), so
  // check the real widths instead: whenever the brand plus "Close file"
  // plus the theme switch wouldn't share one row, flag .head-tight in CSS
  // and let the brand step aside. The row never overflows on the right and
  // the theme button stays visible; default layouts are unaffected.
  (function fitHeaderRow() {
    const headIn = $(".head-in");
    const brand = $(".brand");
    if (!head || !headIn || !brand) return;
    const left = headIn.querySelector(".head-left");
    const right = headIn.querySelector(".head-right");
    if (!left || !right) return;
    const sync = () => {
      const gapL = parseFloat(getComputedStyle(left).columnGap);
      const need =
        ($("[data-menu-btn]") || { offsetWidth: 0 }).offsetWidth
        + (Number.isFinite(gapL) ? gapL : 18)
        + brand.offsetWidth   // width survives even while stepped aside
        + right.offsetWidth;  // unchanged by the brand's visibility
      head.classList.toggle("head-tight", need > headIn.clientWidth);
    };
    sync();
    addEventListener("resize", sync);
    addEventListener("load", sync);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(sync);
    if ("ResizeObserver" in window) new ResizeObserver(sync).observe(headIn);
  })();

  // Mirror the effective text scale (browser + OS font-size accessibility
  // settings, applied to the root font-size via the text-scale meta opt-in)
  // in --ts: rem-based control chrome divides by this factor so fixed-size
  // panels (the lab drawer) keep their designed layout while prose and
  // reading text scale freely.
  /* constant-geometry text probe: a fixed 10px/1 nowrap span laid out on
     every page — its computed line-height (10px) is scale-free while its
     rendered line box scales with ANY used-value text inflation (text
     autosizing heuristics, OS text scale applied post-layout, ...), so
     rects[0].height / 10px IS the effective text scale. It lives as the
     LAST body child. If a page ever hides body children (fullscreen focus
     mode) a detached/hidden probe reads zero rects and the ratio falls
     back to 1 (blind, but never oscillating). No ÷ts anywhere in its
     chain → no measurement feedback loop */
  const tsProbe = document.createElement("span");
  tsProbe.className = "ts-probe";
  tsProbe.setAttribute("aria-hidden", "true");
  tsProbe.textContent = "probe";
  document.body.appendChild(tsProbe);
  const probeRatio = () => {
    if (!tsProbe.isConnected) return 1;
    const expected = parseFloat(getComputedStyle(tsProbe).lineHeight) || 10;
    /* Chromium (where this whole mechanism was authored and validated)
       reports exact line-height line boxes via Range rects; Firefox instead
       reports the font's ink box (~1.3x for a 10px/1 span) which invents a
       phantom text scale at DEFAULT zoom. Read the span's own bounding box
       there: it is exactly the specified line-height, and it still grows
       whenever the used font-size is inflated by the browser. */
    const used = /firefox/i.test(navigator.userAgent)
      ? tsProbe.getBoundingClientRect().height
      : (() => {
          const rng = document.createRange();
          rng.selectNodeContents(tsProbe);
          const rects = rng.getClientRects();
          return rects.length ? rects[0].height : 0;
        })();
    return expected > 0 && used > expected * 1.05 ? Math.min(used / expected, 15) : 1;
  };
  const syncTS = () => {
    /* signal 1: root font-size scaling (desktop font-size prefs, and mobile
       browsers honoring the text-scale meta) */
    const fs = parseFloat(getComputedStyle(document.documentElement).fontSize) || 0;
    let ts = fs > 0 ? fs / 16 : 1;
    /* signal 2: the laid-out probe (see above) */
    ts = Math.max(ts, probeRatio());
    /* signal 3: prose measurement for browsers that inflate real page text
       — .doc-title/.lede have no ÷ts sizes (a ÷ts probe would shrink as
       --ts rises and oscillate the value); its relative line-height
       recomputes from the inflated used font, and the first client rect of
       the first text node is single-line (wrap-proof). Blind inside focus
       mode — which is fine, the probe (signal 2) covers that. Skipped on
       Firefox: same ink-box phantom as the probe, no inflation mechanism
       exists on desktop Firefox, and the fluid prose there is rem-based
       (root-font scaling already covers Firefox's accessibility scaling). */
    const isFF = /firefox/i.test(navigator.userAgent);
    const el = !isFF && (document.querySelector(".doc-title") ||
               document.querySelector(".lede") ||
               document.querySelector(".prose-p"));
    if (el && !el.closest(".ffs-box") && el.firstChild && el.firstChild.nodeType === 3) {
      const rng = document.createRange();
      rng.selectNodeContents(el.firstChild);
      const rects = rng.getClientRects();
      if (rects.length) {
        const expected = parseFloat(getComputedStyle(el).lineHeight);
        const used = rects[0].height;
        if (expected > 0 && used > expected * 1.05) ts = Math.max(ts, Math.min(used / expected, 15));
      }
    }
    document.documentElement.style.setProperty("--ts", (ts > 0 ? ts : 1).toFixed(4));
    /* zoom-pitch signal: some browsers (Android font scaling in Chromium
       shells) realize "150% text" as a larger device scale — the CSS layout
       viewport shrinks and every fixed CSS length renders bigger on screen.
       screen.width keeps the nominal CSS width, so screen.width/layoutWidth
       reveals the pitch factor. Fixed game chrome (paddings, board caps)
       divides by --zu so it keeps its share of the *screen*. It stays 1 on
       desktops (fine pointers can have half-size windows, where the ratio
       is meaningless) and whenever the ratio is ~1 or absurd. */
    try {
      let zu = 1;
      if (matchMedia("(pointer:coarse)").matches) {
        const lo = document.documentElement.clientWidth;
        const r = lo > 0 && screen.width > 0 ? screen.width / lo : 1;
        zu = r > 1.04 && r <= 3 ? Math.min(r, 3) : 1;
      }
      document.documentElement.style.setProperty("--zu", zu.toFixed(4));
    } catch (e) {}
    /* elevation flag for CSS: adjustments that must never touch default
       rendering (hiding keyboard-hint lines in short game overlays, etc.)
       key off this class */
    document.documentElement.classList.toggle("ts-big", ts >= 1.2);
  };
  /* On-screen keyboard in focus mode (the typing test: tapping the stage
     focuses the hidden capture input and the virtual keyboard opens). The
     browser OVERLAYS the sheet on the page: layout viewport height (lo)
     unchanged, visual viewport (vv) shrunk and possibly panned. The sheet's
     top line is vv.height + vv.offsetTop, so --kbh = lo minus that line is
     the layout height the keyboard covers; html.fig-fs-kb lets the CSS
     resize the figure to end exactly there (the control rail under it is
     left beneath the sheet on purpose). Engines that shrink the LAYOUT
     viewport instead see the box's own 100dvh shorten above the keyboard
     while kb computes 0 and adds nothing. A threshold keeps collapsing
     toolbars and other transient UI (≪ keyboard height) from faking a
     sheet, and the cap rejects absurd transient values. */
  function kbSync() {
    const root = document.documentElement;
    const vv = window.visualViewport;
    if (!vv) return;
    let kb = 0;
    if (root.classList.contains("fig-fs")) {
      const lo = root.clientHeight;
      kb = Math.round(lo - (vv.height + vv.offsetTop));
      kb = kb < 96 ? 0 : Math.min(kb, Math.floor(lo * .7));
    }
    root.style.setProperty("--kbh", kb + "px");
    root.classList.toggle("fig-fs-kb", kb > 0);
  }
  if (window.visualViewport) {
    visualViewport.addEventListener("resize", kbSync);
    visualViewport.addEventListener("scroll", kbSync);
  }
  addEventListener("resize", syncTS);
  syncTS();
  /* Accessibility font scaling (browser font-size preference / OS scale)
     doesn't dispatch a resize event: also sync --ts whenever the root box
     changes, plus a light poll fallback, so the /var(--ts,1) divided sizes
     can never go stale. */
  if ("ResizeObserver" in window) new ResizeObserver(syncTS).observe(document.documentElement);
  setInterval(syncTS, 500);

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

  // Fullscreen focus mode for lab games: a corner button on each game
  // .fig collapses the page to the board + its control rows so phones
  // fit everything at once, away from the header/footer scroll fight.
  (function stageFocus() {
    const KEEP = ".ctrl-row, .stat-row, .sdk-np, .sdk-ctrl, .sdk-diff";
    const ICON =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>';
    let box = null, anchor = null, moved = null, origParent = null, backScroll = null;

    function exit() {
      if (!box) return;
      document.documentElement.classList.remove("fig-fs");
      /* the figure lives directly under the box (only the rows moved into
         the rail): put it back before the anchor FIRST, then the rows in
         order, so the original sibling order fig, row... is restored */
      const fig = box.querySelector(":scope > .fig");
      const rail = box.querySelector(".ffs-ctl");
      if (fig) {
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(fig, anchor);
        else if (origParent) origParent.appendChild(fig);
      }
      for (const el of rail ? [...rail.children] : []) {
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor);
        else if (origParent) origParent.appendChild(el);
      }
      if (rail) rail.remove();
      /* the exit button was docked into the box during focus — give it back
         to its figure only after the fig is reinserted */
      const btn = box.querySelector(".fig-fs-btn");
      if (btn) {
        if (fig) fig.appendChild(btn);
        else if (origParent) origParent.appendChild(btn);
      }
      box.remove();
      dispatchEvent(new Event("stage-refit"));
      /* keyboard state must die with focus: no stale class or variable.
         If a sheet is open at this moment, the CSS immediately reverts to
         the certified pre-keyboard layout and any later vv event is a
         no-op because fig-fs is gone. */
      document.documentElement.classList.remove("fig-fs-kb");
      document.documentElement.style.removeProperty("--kbh");
      if (backScroll) jumpScroll(backScroll[0], backScroll[1]);
      box = null; moved = null; anchor = null; origParent = null; backScroll = null;
    }

    function enter(fig) {
      const kept = [];
      let el = fig.nextElementSibling;
      while (el && el.matches(KEEP)) { kept.push(el); el = el.nextElementSibling; }
      moved = [fig, ...kept];
      anchor = moved[moved.length - 1].nextElementSibling;
      origParent = fig.parentNode;
      backScroll = [scrollX, scrollY];
      box = document.createElement("div");
      box.className = "ffs-box";
      box.appendChild(fig);
      // The control rows share one scrollable rail (.ffs-ctl) so they cap
      // themselves at <48% of the screen and never squeeze the game.
      const rail = document.createElement("div");
      rail.className = "ffs-ctl";
      for (const n of kept) rail.appendChild(n);
      box.appendChild(rail);
      /* The exit button docks to the viewport's bottom-right while in focus
         mode; move it out of the figure here, because elements inside the
         fig carry container-type/contain (sudoku, type) — any of them
         hijacks position:fixed as a containing block and would pin the
         button back onto the board corner. As a direct child of .ffs-box it
         resolves against the real viewport. */
      const btn = fig.querySelector(".fig-fs-btn");
      if (btn) box.appendChild(btn);
      document.body.appendChild(box);
      document.documentElement.classList.add("fig-fs");
      jumpScroll(0, 0);
      /* games that size their board in JS (minesweeper's svg grid) fit by
         stage dimensions measured in a resize handler — but their resize
         listeners throttle themselves away (setTimeout). stage-refit lets
         them size synchronously inside this same task */
      dispatchEvent(new Event("stage-refit"));
      /* immediate keyboard sync on entering focus: if a sheet is already
         up (or the vv reports one), the figure resizes in this same task */
      kbSync();
    }

    /* while focused, the page must never move for a scroll or pan: browsers
       pan to reveal a focused input, and a stray gesture would otherwise
       slide the whole website (rows included) out from behind the keyboard */
    addEventListener("scroll", () => {
      if (!document.documentElement.classList.contains("fig-fs")) return;
      if (scrollY || scrollX) jumpScroll(0, 0);
    }, { passive: true });

    /* jump without the page's smooth-scroll animation: entering focus should
       snap, and restoring the scroll on exit should return instantly */
    function jumpScroll(x, y) {
      const doc = document.documentElement;
      const prev = doc.style.scrollBehavior;
      doc.style.scrollBehavior = "auto";
      scrollTo(x, y);
      doc.style.scrollBehavior = prev;
    }

    $$(".fig").forEach(fig => {
      if (!fig.querySelector(".stage")) return;
      const btn = document.createElement("button");
      btn.className = "fig-fs-btn";
      btn.type = "button";
      btn.title = "Focus mode";
      btn.setAttribute("aria-label", "Focus mode: show only the game and its controls");
      btn.innerHTML = ICON;
      btn.addEventListener("click", e => {
        e.stopPropagation();
        if (box) exit(); else enter(fig);
        btn.setAttribute("aria-label", box ? "Exit focus mode" : "Focus mode: show only the game and its controls");
      });
      fig.appendChild(btn);
    });

    addEventListener("keydown", e => {
      if (e.key === "Escape" && box) exit();
    });
  })();

  // Inject the real totals into the data-lab-total / data-dossier-total /
  // data-blog-post-total placeholders. Lab total comes from the injected
  // panel entries, dossier and blog-post totals from their .files lists
  // on the index (fetched on dossier/blog-post pages).
  function autoNumber(base) {
    const pad = n => String(n).padStart(2, "0");
    const labCount = $$(".lab-link").length;
    if (labCount) {
      $$("[data-lab-total]").forEach(el => { el.textContent = pad(labCount); });
    }
    const inBlogPosts = /\/blog-posts\//.test(location.pathname);
    const inDossiers = /\/dossiers\//.test(location.pathname);
    const countRows = (sectionSel, attr) => {
      const list = $(sectionSel + " .files");
      if (!list) return;
      const n = list.querySelectorAll("li").length;
      if (n) $$(attr).forEach(el => { el.textContent = pad(n); });
    };
    countRows("#work", "[data-dossier-total]");
    countRows("#blog-posts", "[data-blog-post-total]");
    if (inDossiers || inBlogPosts) {
      const sectionSel = inBlogPosts ? "#blog-posts" : "#work";
      const attr = inBlogPosts ? "[data-blog-post-total]" : "[data-dossier-total]";
      fetch(base + "index.html")
        .then(r => r.ok ? r.text() : "")
        .then(html => {
          const tmp = document.createElement("div");
          tmp.innerHTML = html;
          const list = tmp.querySelector(sectionSel + " .files");
          const n = list ? list.querySelectorAll("li").length : 0;
          if (n) $$(attr).forEach(el => { el.textContent = pad(n); });
        })
        .catch(() => {});
    }
  }
})();
