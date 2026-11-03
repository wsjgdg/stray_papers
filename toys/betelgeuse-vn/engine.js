/*
 * engine.js — vanilla JS visual novel runtime. No dependencies, no frameworks.
 *
 * Exposes a single entry point:
 *
 *   VN.start(scenario)   // falls back to window.SCENARIO when omitted;
 *                        // scenario.js is expected to be loaded before engine.js
 *
 * The engine builds its entire DOM inside document.body:
 *
 *   #vn-app
 *     .vn-bg > .vn-bg-fx           background layer (.vn-fade / .vn-fading
 *                                  toggled around swaps) + animated-fx child +
 *                                  optional .vn-bg-canvas (window.VN_SCENES)
 *     .vn-vignette, .vn-grain      always-present cinematic layers (created
 *                                  empty here; styling lives in style.css)
 *     .vn-sprites > .vn-sprite     one element per on-screen character (max 2);
 *                                  slot 0 = .vn-pos-left, slot 1 = .vn-pos-right
 *                                  (data-slot, stable per character; .vn-solo on
 *                                  a lone sprite); entrance/exit/feel-swap via
 *                                  .vn-enter / .vn-leave / .vn-swap;
 *                                  window.CHAR_ART[id] inline SVG when available,
 *                                  otherwise the initial-letter fallback
 *     .vn-dialog > .vn-name / .vn-text
 *     .vn-choices > button.vn-choice
 *     .vn-topbar > button.vn-btn[data-act=backlog|save|load|auto|speed|
 *                                  title|settings|audio]
 *     .vn-backlog > .vn-backlog-list > .vn-backlog-line > b.vn-backlog-name + span.vn-backlog-text
 *     .vn-menu > .vn-menu-title + button.vn-slot > .vn-slot-info + button.vn-close
 *     .vn-settings > .vn-settings-title + .vn-setting-row (label + input.vn-range
 *                                  + span.vn-range-val) x2 + button.vn-close
 *     .vn-title > .vn-title-name + .vn-title-sub + .vn-endings +
 *                                  button#vn-start
 *       (.vn-endings = .vn-endings-count + .vn-endings-marks >
 *        span.vn-ending-mark[data-ending="ending_*"], the 结局收集 readout)
 *     .vn-toast
 *
 * Overlay visibility is toggled exclusively via the .vn-hidden utility class
 * (style.css defines it as display:none !important). All story text is written
 * through textContent — story data never touches innerHTML. The only innerHTML
 * uses are trusted engine-authored data: backgrounds[id].html fx markup and
 * window.CHAR_ART portrait SVG.
 *
 * Optional, backward-compatible scenario extensions:
 *   backgrounds[id].html — fx layer synced into .vn-bg-fx on every bg change
 *   line.fx              — "glitch" (.vn-glitch on .vn-text while the line
 *                          displays) or "shake" (.vn-shake on #vn-app for
 *                          SHAKE_MS); unknown values warn once and are ignored
 *
 * Optional parallel module (loaded before engine.js):
 *   window.VN_SCENES     — background id -> { init(ctx, w, h),
 *                          draw(ctx, w, h, t, dt) }. When the active bg has an
 *                          entry, a <canvas class="vn-bg-canvas"> is appended
 *                          as the last child of .vn-bg-fx (above the fx html
 *                          layer) and driven by a rAF loop; t = seconds since
 *                          activation, dt = seconds since the previous frame.
 *                          .vn-bg-fx also gets .vn-has-canvas while a scene is
 *                          active. Fully guarded: a missing global, missing
 *                          callbacks, a null 2d context or a throwing scene
 *                          falls back silently to the html/css layer, and
 *                          prefers-reduced-motion renders exactly one static
 *                          frame at t = 1.5 instead of looping.
 *
 * Optional parallel module (loaded before engine.js):
   *   window.VN_AUDIO      — feedback audio: scene(bgId) switches the ambient
   *                          loop when a background becomes active (null on the
   *                          title screen silences it), type() is one
   *                          typewriter tick, ui(kind) is a ui blip for
   *                          "start" | "select" | "save" | "load", swell()
   *                          is the cinematic swell fired with the dolly line
   *                          fx, and enabled() / setEnabled(bool) read +
   *                          write the on/off state shown on the topbar 音效
   *                          button.
 *                          Every engine-side call goes through audioHook(),
 *                          which is fully guarded: a missing module, a
 *                          missing method or a throwing callback is silently
 *                          ignored — audio can never break the engine.
 *
 * Saves live in localStorage under "vn-save-1" .. "vn-save-3" as JSON:
 *   { scene, line, flags: [...], ts: ISO string, title, bg }
 *
 * Settings (设置面板) live in localStorage under "vn-settings" as JSON:
 *   { volume: 0..1, autoDelay: ms }. Loaded once per buildDom (volume is
 *   also pushed into window.VN_AUDIO when present; autoDelay becomes the
 *   mutable state.autoDelayMs used by auto mode), saved on slider input.
 *   All storage access is guarded the same way as vn-endings: an unavailable
 *   store or a corrupt payload reads as the defaults {volume:1, autoDelay:1600}
 *   and failed writes are skipped silently.
 *
 * Ending collection (结局收集) lives in localStorage under "vn-endings" as a
 * JSON array of collected ending ids ("ending_bad" | "ending_good" |
 * "ending_true"), written once per first-time collect when an ending_* scene
 * is entered. All storage access is guarded: an unavailable store or a
 * corrupt payload reads as empty and failed writes are skipped silently.
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ config */

  var SPEEDS = [
    { name: "慢", ms: 60 },
    { name: "正常", ms: 30 },
    { name: "快", ms: 10 },
  ];
  var AUTO_DELAY_MS = 1600; // auto mode: wait this long after a line finishes typing
  var SKIP_DELAY_MS = 80; // skip mode: per-line step interval (~12 lines/s)
  var CREDITS_DELAY_MS = 2500; // THE END -> credits roll
  var CREDITS_MS = 18000; // credits roll duration (click/space skips)
  var BG_FADE_MS = 300; // keep in sync with the .vn-bg opacity transition in style.css
  var BG_FADING_MS = 650; // .vn-fading (fade through black) window on bg change
  var SHAKE_MS = 500; // duration of .vn-shake on #vn-app for fx:"shake" lines
  var TOAST_MS = 1500;
  var BACKLOG_LIMIT = 100; // keep only the last N displayed lines
  var SLOT_COUNT = 3; // vn-save-1 .. vn-save-3
  var SAVE_PREFIX = "vn-save-";
  var ENDINGS_KEY = "vn-endings"; // 结局收集 persistence key
  var SETTINGS_KEY = "vn-settings"; // settings persistence key (volume + autoDelay)
  var SETTINGS_VOLUME_MIN = 0; // volume clamp, matches VN_AUDIO.setVolume
  var SETTINGS_VOLUME_MAX = 1;
  var SETTINGS_DELAY_MIN = 800; // auto-delay slider range, matches the input
  var SETTINGS_DELAY_MAX = 3000;
  var ENDING_IDS = ["ending_bad", "ending_good", "ending_true"];
  var ENDING_LABELS = {
    ending_bad: "熄灭",
    ending_good: "迟到三年的早安",
    ending_true: "还亮着",
  };
  var ENDING_UNSEEN = "？"; // spoiler-safe label while an ending is uncollected
  var ENDING_TEXT = "「THE END」";
  var MAX_SCENE_CHAIN = 100; // guards against branch/next loops in malformed scenarios
  var SPRITE_ENTER_MS = 500; // .vn-enter self-removal (CSS rise animation .45s)
  var SPRITE_LEAVE_MS = 400; // .vn-leave DOM removal (CSS drop animation .35s)
  var SPRITE_SWAP_MS = 180; // .vn-swap pulse around a feel-art content swap
  var SPRITE_POS = ["vn-pos-left", "vn-pos-right"]; // slot 0 = left, 1 = right

  /* ----------------------------------------------------------- module state */

  var S = null; // active scenario object
  var els = null; // dom references, filled by buildDom()
  var docBound = false;

  var state = {
    mode: "title", // 'title' | 'line' | 'choices' | 'end'
    scene: null, // current scene id
    line: 0, // index of the currently displayed line
    flags: new Set(), // story flags
    bg: null, // current background id
    recent: [], // [{ id, feel }] latest two speakers, most recent first
    backlog: [], // [{ name, text }] displayed lines, capped at BACKLOG_LIMIT
    typing: false,
    typeFull: "",
    typePos: 0,
    auto: false,
    speedIdx: 1, // index into SPEEDS — default 正常 (30ms/char)
    menuMode: "save", // 'save' | 'load'
    autoDelayMs: AUTO_DELAY_MS, // mutable auto-mode delay, set from settings
  };

  var settingsVol = 1; // engine-side volume mirror (live value in VN_AUDIO)

  var timers = {
    type: null,
    auto: null,
    bg: null,
    fading: null,
    shake: null,
    toast: null,
    chapter: null,
    credits: null,
    creditsEnd: null,
  };

  /* ------------------------------------------------------------ dom helpers */

  function h(tag, cls, parent) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (parent) parent.appendChild(node);
    return node;
  }

  function closest(node, selector) {
    if (node && typeof node.closest === "function")
      return node.closest(selector);
    return null;
  }

  function buildDom() {
    deactivateCanvasScene(); // a restart must not leave a stale rAF loop behind
    var old = document.getElementById("vn-app");
    if (old && old.parentNode) old.parentNode.removeChild(old);

    var app = h("div", null, document.body);
    app.id = "vn-app";

    var bg = h("div", "vn-bg", app);
    var bgFx = h("div", "vn-bg-fx", bg); // animated fx markup, synced per bg
    // Always-present cinematic layers, between .vn-bg and .vn-sprites; the
    // engine only creates them — all styling lives in style.css.
    var vignette = h("div", "vn-vignette", app);
    var grain = h("div", "vn-grain", app);
    var sprites = h("div", "vn-sprites", app);

    var dialog = h("div", "vn-dialog", app);
    var name = h("div", "vn-name", dialog);
    var text = h("div", "vn-text", dialog);
    // decorative auto-mode progress line (aria-hidden: purely visual cue)
    var autoBar = h("div", "vn-auto-bar", dialog);
    autoBar.setAttribute("aria-hidden", "true");
    var autoBarFill = h("i", null, autoBar);

    var choices = h("div", "vn-choices vn-hidden", app);

    var topbar = h("div", "vn-topbar", app);
    var btns = {};
    [
      ["backlog", "记录"],
      ["save", "存档"],
      ["load", "读档"],
      ["auto", "自动"],
      ["skip", "快进"],
      ["speed", speedLabel()],
      ["title", "标题"],
      ["settings", "设置"], // opens the settings overlay (volume + auto delay)
      ["audio", audioLabel()], // reflects window.VN_AUDIO.enabled() at render
    ].forEach(function (pair) {
      var btn = h("button", "vn-btn", topbar);
      btn.type = "button";
      btn.setAttribute("data-act", pair[0]);
      btn.textContent = pair[1];
      btns[pair[0]] = btn;
    });

    var backlog = h("div", "vn-backlog vn-hidden", app);
    var blList = h("div", "vn-backlog-list", backlog);

    var menu = h("div", "vn-menu vn-hidden", app);
    var menuTitle = h("div", "vn-menu-title", menu);
    menuTitle.textContent = "存档";
    var slots = [];
    for (var i = 1; i <= SLOT_COUNT; i++) {
      (function (n) {
        var slot = h("button", "vn-slot", menu);
        slot.type = "button";
        var info = h("div", "vn-slot-info", slot);
        info.textContent = n + " · 空";
        slot.addEventListener("click", function () {
          onSlotClick(n);
        });
        slots.push({ info: info });
      })(i);
    }
    var menuClose = h("button", "vn-close", menu);
    menuClose.type = "button";
    menuClose.textContent = "关闭";
    menuClose.addEventListener("click", hideMenu);

    // Settings overlay (设置): same overlay pattern as .vn-menu — a centered
    // card, visibility toggled via .vn-hidden. Two labeled range rows (volume
    // percent, auto-advance delay) plus the reuse .vn-close 关闭 button.
    var settings = h("div", "vn-settings vn-hidden", app);
    var settingsTitle = h("div", "vn-settings-title", settings);
    settingsTitle.textContent = "设置";
    var volRange = h("input", "vn-range", null);
    volRange.type = "range";
    volRange.setAttribute("min", "0");
    volRange.setAttribute("max", "100");
    volRange.setAttribute("step", "5");
    var volVal = h("span", "vn-range-val", null);
    var volRow = h("div", "vn-setting-row", settings);
    var volLabel = h("label", null, volRow);
    volLabel.textContent = "音量";
    volRow.appendChild(volRange);
    volRow.appendChild(volVal);
    var autoRange = h("input", "vn-range", null);
    autoRange.type = "range";
    autoRange.setAttribute("min", String(SETTINGS_DELAY_MIN));
    autoRange.setAttribute("max", String(SETTINGS_DELAY_MAX));
    autoRange.setAttribute("step", "100");
    var autoVal = h("span", "vn-range-val", null);
    var autoRow = h("div", "vn-setting-row", settings);
    var autoLabel = h("label", null, autoRow);
    autoLabel.textContent = "自动推进";
    autoRow.appendChild(autoRange);
    autoRow.appendChild(autoVal);
    var settingsClose = h("button", "vn-close", settings);
    settingsClose.type = "button";
    settingsClose.textContent = "关闭";
    settingsClose.addEventListener("click", hideSettings);
    volRange.addEventListener("input", onVolumeInput);
    autoRange.addEventListener("input", onAutoDelayInput);

    var title = h("div", "vn-title", app);
    var titleCanvas = document.createElement("canvas");
    titleCanvas.className = "vn-title-canvas";
    title.appendChild(titleCanvas); // stacking handled by CSS z-index
    var titleName = h("div", "vn-title-name", title);
    var titleSub = h("div", "vn-title-sub", title);
    // 结局收集 readout: a quiet count line plus one pill per ending, kept
    // current by renderEndings() here and on every return to the title.
    var endings = h("div", "vn-endings", title);
    var endingsCount = h("div", "vn-endings-count", endings);
    var endingsMarks = h("div", "vn-endings-marks", endings);
    var endingMarks = {};
    ENDING_IDS.forEach(function (id) {
      var mark = h("span", "vn-ending-mark", endingsMarks);
      mark.setAttribute("data-ending", id);
      endingMarks[id] = mark;
    });
    var startBtn = h("button", null, title);
    startBtn.id = "vn-start";
    startBtn.type = "button";
    startBtn.textContent = "开始游戏";
    startBtn.addEventListener("click", beginGame);

    var chapter = h("div", "vn-chapter vn-hidden", app);
    var chapterText = h("div", "vn-chapter-text", chapter);

    var credits = h("div", "vn-credits vn-hidden", app);
    var creditsRoll = h("div", "vn-credits-roll", credits);

    var toastEl = h("div", "vn-toast vn-hidden", app);

    els = {
      app: app,
      bg: bg,
      bgFx: bgFx,
      vignette: vignette,
      grain: grain,
      sprites: sprites,
      name: name,
      text: text,
      autoBar: autoBar,
      autoBarFill: autoBarFill,
      choices: choices,
      topbar: topbar,
      btns: btns,
      backlog: backlog,
      blList: blList,
      menu: menu,
      menuTitle: menuTitle,
      slots: slots,
      settings: settings,
      settingsTitle: settingsTitle,
      volRange: volRange,
      volVal: volVal,
      autoRange: autoRange,
      autoVal: autoVal,
      title: title,
      titleCanvas: titleCanvas,
      titleName: titleName,
      titleSub: titleSub,
      endings: endings,
      endingsCount: endingsCount,
      endingsMarks: endingsMarks,
      endingMarks: endingMarks,
      chapter: chapter,
      chapterText: chapterText,
      credits: credits,
      creditsRoll: creditsRoll,
      toast: toastEl,
    };

    topbar.addEventListener("click", onTopbarClick);
    app.addEventListener("click", onAppClick);
    if (!docBound) {
      document.addEventListener("keydown", onKeyDown);
      document.addEventListener("keyup", onKeyUp);
      docBound = true;
    }
    loadSettings(); // once per build: volume -> VN_AUDIO, delay -> state
    renderEndings(); // initial collector readout (empty storage -> 0/3, ？x3)
  }

  /* ------------------------------------------------------------- small utils */

  function charColor(ch) {
    return typeof ch.color === "string" && ch.color ? ch.color : "#ffffff";
  }

  function speedLabel() {
    return "速度:" + SPEEDS[state.speedIdx].name;
  }

  function fmtTs(ts) {
    if (typeof ts !== "string") return "";
    return ts
      .replace("T", " ")
      .replace(/\.\d+Z$/, "")
      .replace("Z", "");
  }

  function slotKey(n) {
    return SAVE_PREFIX + n;
  }

  function readSlotRaw(n) {
    try {
      return localStorage.getItem(slotKey(n));
    } catch (err) {
      console.warn("[VN] localStorage unavailable: " + err);
      return null;
    }
  }

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.remove("vn-hidden");
    clearTimeout(timers.toast);
    timers.toast = setTimeout(function () {
      els.toast.classList.add("vn-hidden");
    }, TOAST_MS);
  }

  /* ------------------------------------------------------------ audio hooks */

  // Single guarded entry into the optional window.VN_AUDIO module: `name` is
  // the method to call ("scene" | "type" | "ui") and arg its single argument.
  // A missing module, a missing method or a throwing callback is swallowed
  // right here — audio is strictly optional and can never break the engine.
  // The module itself no-ops until a user gesture and checks enabled() on its
  // own; the engine only adds its own coarse throttling (typewriter ticks).
  function audioHook(name, arg) {
    var mod = typeof window !== "undefined" ? window.VN_AUDIO : null;
    if (!mod || typeof mod !== "object") return;
    var fn = mod[name];
    if (typeof fn !== "function") return;
    try {
      fn.call(mod, arg);
    } catch (err) {
      /* audio failed: ignore, the game goes on */
    }
  }

  // Topbar 音效 label, reflecting the module's state at render time. Default
  // label 音效:开 when the module is absent (or its enabled() throws).
  function audioLabel() {
    var mod = typeof window !== "undefined" ? window.VN_AUDIO : null;
    if (mod && typeof mod.enabled === "function") {
      try {
        return mod.enabled() ? "音效:开" : "音效:关";
      } catch (err) {
        /* fall through to the default label */
      }
    }
    return "音效:开";
  }

  // Topbar 音效 button: flips the module's enabled state, updates the label
  // and toasts the new state. Without the module (or its API): a plain
  // explanation toast. A throwing module changes nothing and never throws.
  function toggleAudio() {
    var mod = typeof window !== "undefined" ? window.VN_AUDIO : null;
    if (
      !mod ||
      typeof mod !== "object" ||
      typeof mod.setEnabled !== "function" ||
      typeof mod.enabled !== "function"
    ) {
      toast("无音频模块");
      return;
    }
    var on = false;
    try {
      on = !!mod.setEnabled(!mod.enabled());
    } catch (err) {
      return; // broken module: keep the current label, no crash
    }
    els.btns.audio.textContent = on ? "音效:开" : "音效:关";
    toast(on ? "音效已开启" : "音效已关闭");
  }

  /* -------------------------------------------------------------- typewriter */

  function speedMs() {
    return SPEEDS[state.speedIdx].ms;
  }

  function startTyping(text) {
    clearTimeout(timers.type);
    state.typing = true;
    state.typeFull = String(text);
    state.typePos = 0;
    els.text.textContent = "";
    timers.type = setTimeout(typeStep, speedMs());
  }

  function typeStep() {
    if (!state.typing) return;
    state.typePos += 1;
    els.text.textContent = state.typeFull.slice(0, state.typePos);
    // Coarse engine-side throttle: one tick per 2nd revealed character. The
    // module does its own enabled-check (and any fine throttling) itself.
    if (state.typePos % 2 === 0) audioHook("type");
    if (state.typePos >= state.typeFull.length) {
      finishTyping();
      return;
    }
    timers.type = setTimeout(typeStep, speedMs());
  }

  function finishTyping() {
    clearTimeout(timers.type);
    timers.type = null;
    state.typing = false;
    els.text.textContent = state.typeFull;
    scheduleAuto();
  }

  function completeTyping() {
    if (state.typing) finishTyping();
  }

  /* --------------------------------------------------------------- auto mode */

  // Decorative auto-mode progress line: fills over the auto-advance delay
  // while the current line waits, resets whenever auto pauses or turns off.
  function runAutoBar() {
    if (!els || !els.autoBarFill) return;
    var fill = els.autoBarFill;
    fill.style.animationDuration = state.autoDelayMs + "ms";
    fill.classList.remove("vn-auto-run");
    void els.autoBar.offsetWidth; // force reflow so the animation restarts
    fill.classList.add("vn-auto-run");
  }

  function resetAutoBar() {
    if (!els || !els.autoBarFill) return;
    els.autoBarFill.classList.remove("vn-auto-run");
  }

  function scheduleAuto() {
    clearTimeout(timers.auto);
    timers.auto = null;
    if (!state.auto || state.mode !== "line" || state.typing) return;
    runAutoBar();
    timers.auto = setTimeout(autoTick, state.autoDelayMs);
  }

  function autoTick() {
    timers.auto = null;
    // If the player opened an overlay, hold the game until it closes.
    if (overlaysOpen()) {
      resetAutoBar();
      timers.auto = setTimeout(autoTick, state.autoDelayMs);
      return;
    }
    advance();
  }

  function clearAuto() {
    clearTimeout(timers.auto);
    timers.auto = null;
    resetAutoBar();
  }

  function overlaysOpen() {
    if (!els) return true;
    return (
      state.mode !== "line" ||
      !els.menu.classList.contains("vn-hidden") ||
      !els.backlog.classList.contains("vn-hidden") ||
      !els.settings.classList.contains("vn-hidden")
    );
  }

  function toggleAuto() {
    state.auto = !state.auto;
    els.btns.auto.classList.toggle("vn-active", state.auto);
    if (state.auto) {
      setSkip(false, false); // auto and skip are mutually exclusive
      scheduleAuto();
    } else clearAuto();
  }

  /* ---------------------------------------------------------------- skip */

  // Skip mode: steps lines at SKIP_DELAY_MS until a choice/overlay stops it
  // (unconditional skip — the script is short, no seen-text store). Held S
  // temporarily skips without latching the topbar button.
  var skipOn = false;
  var skipHeld = false;

  function setSkip(on, latch) {
    if (latch) skipOn = on;
    else skipOn = skipOn && on;
    if (!skipOn) {
      clearTimeout(timers.skip);
      timers.skip = null;
    }
    if (els && els.btns.skip) {
      els.btns.skip.classList.toggle("vn-active", skipOn);
    }
    if (skipOn) {
      clearAuto();
      scheduleSkip();
    }
  }

  function toggleSkip() {
    setSkip(!skipOn, true);
  }

  function scheduleSkip() {
    clearTimeout(timers.skip);
    timers.skip = null;
    if ((!skipOn && !skipHeld) || !els) return;
    if (state.mode !== "line") {
      setSkip(false, true); // reached choices/ending: skip stops itself
      return;
    }
    // typing line: complete it instantly, then keep stepping
    if (state.typing) finishTyping();
    timers.skip = setTimeout(skipTick, SKIP_DELAY_MS);
  }

  function skipTick() {
    timers.skip = null;
    if (!skipOn && !skipHeld) return;
    if (overlaysOpen()) {
      setSkip(false, true); // choices / ending: skip stops itself
      return;
    }
    if (!els.choices.classList.contains("vn-hidden")) {
      setSkip(false, true);
      return;
    }
    advance();
    scheduleSkip();
  }

  function clearSkip() {
    skipHeld = false;
    setSkip(false, true);
  }

  function cycleSpeed() {
    state.speedIdx = (state.speedIdx + 1) % SPEEDS.length;
    els.btns.speed.textContent = speedLabel();
  }

  /* ----------------------------------------------------------------- sprites */

  // Resolves the trusted inline-SVG portrait for a character+feel from the
  // optional global window.CHAR_ART map (charId -> { normal, happy, sad,
  // surprised, angry }). Falls back from art[feel] to art.normal; returns
  // null when no usable art exists so callers keep the letter fallback.
  function charArtFor(charId, feel) {
    var map =
      typeof window !== "undefined" && window.CHAR_ART ? window.CHAR_ART : null;
    if (!map || typeof map !== "object") return null;
    var entry = map[charId];
    if (!entry || typeof entry !== "object") return null;
    if (typeof entry[feel] === "string" && entry[feel]) return entry[feel];
    if (typeof entry.normal === "string" && entry.normal) return entry.normal;
    return null;
  }

  // Paints a sprite's portrait: CHAR_ART svg (replaces the initial letter)
  // when available, else the original initial-letter circle fallback.
  function applySpriteArt(sp, charId, feel, ch) {
    var art = charArtFor(charId, feel);
    if (art != null) {
      sp.innerHTML = art; // trusted, authored inline SVG
    } else {
      sp.textContent = String(ch.name || charId).charAt(0);
    }
  }

  function showSprite(charId, feel) {
    var ch = S.characters && S.characters[charId];
    if (!ch) {
      console.warn("[VN] unknown character: " + charId);
      return;
    }
    var arr = state.recent;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].id === charId) {
        arr.splice(i, 1);
        break;
      }
    }
    arr.unshift({
      id: charId,
      feel: typeof feel === "string" && feel ? feel : "normal",
    });
    if (arr.length > 2) arr.length = 2; // keep only the latest two speakers
    renderSprites();
  }

  // Entrance: slide up + fade in (.vn-enter); the class removes itself after
  // SPRITE_ENTER_MS so the element settles into its normal transitioned state.
  function spriteEnter(sp) {
    sp.classList.add("vn-enter");
    clearTimeout(sp._vnEnterTimer);
    sp._vnEnterTimer = setTimeout(function () {
      sp._vnEnterTimer = null;
      if (sp.parentNode) sp.classList.remove("vn-enter");
    }, SPRITE_ENTER_MS);
  }

  // Cancels a pending .vn-leave removal (re-entry inside the leave window).
  // Returns true when a leave was actually canceled.
  function spriteCancelLeave(sp) {
    if (!sp._vnLeaveTimer) return false;
    clearTimeout(sp._vnLeaveTimer);
    sp._vnLeaveTimer = null;
    sp.classList.remove("vn-leave");
    return true;
  }

  // Exit: slide down + fade (.vn-leave); the element stays in the layer during
  // the window (so a fast re-entry can reuse it) and is dropped after
  // SPRITE_LEAVE_MS. Focus/dim/solo treatment is stripped while it slides.
  function spriteBeginLeave(sp) {
    if (sp._vnLeaveTimer) return; // already leaving
    clearTimeout(sp._vnEnterTimer);
    sp._vnEnterTimer = null;
    sp.classList.remove("vn-enter", "vn-focus", "vn-dim", "vn-solo");
    sp.classList.add("vn-leave");
    sp._vnLeaveTimer = setTimeout(function () {
      sp._vnLeaveTimer = null;
      if (sp.parentNode) sp.parentNode.removeChild(sp);
    }, SPRITE_LEAVE_MS);
  }

  // Immediate stage wipe (title screen): no exit animation, sprites vanish
  // with the rest of the game state, all per-sprite timers canceled.
  function clearSpritesNow() {
    if (!els) return;
    Array.prototype.forEach.call(els.sprites.children, function (sp) {
      clearTimeout(sp._vnEnterTimer);
      clearTimeout(sp._vnLeaveTimer);
      clearTimeout(sp._vnSwapTimer);
      sp._vnEnterTimer = null;
      sp._vnLeaveTimer = null;
      sp._vnSwapTimer = null;
      if (sp.parentNode) sp.parentNode.removeChild(sp);
    });
  }

  // Diffs the sprite layer against state.recent so existing elements (and any
  // CSS transitions on them) survive when a character stays on screen.
  //
  // Stage layout: slot 0 stands LEFT (.vn-pos-left), slot 1 RIGHT
  // (.vn-pos-right). The slot is stored on the element when it is created and
  // is never reassigned while the same characters stay on stage; a newcomer
  // takes the lowest free (vacated) slot. A lone character is always slot 0,
  // with .vn-solo nudging it toward center (styling in style.css).
  function renderSprites() {
    var layer = els.sprites;
    var existing = {};
    Array.prototype.forEach.call(layer.children, function (node) {
      existing[node.getAttribute("data-char")] = node;
    });

    // Desired DOM order: oldest speaker first, most recent last (gets .vn-focus).
    var desired = state.recent.slice().reverse();
    var kept = {};
    desired.forEach(function (item) {
      var sp = existing[item.id];
      var feel = item.feel || "normal";
      if (!sp) {
        var ch = S.characters && S.characters[item.id];
        if (!ch) return; // already warned when the character was used
        sp = document.createElement("div");
        sp.className = "vn-sprite";
        sp.setAttribute("data-char", item.id);
        sp.style.setProperty("--vn-color", charColor(ch));
        applySpriteArt(sp, item.id, feel, ch);
        layer.appendChild(sp);
        spriteEnter(sp); // slide up + fade in; class self-removes
      } else {
        // Same character back on stage inside the leave window: cancel the
        // pending removal and replay the entrance on the kept element.
        if (spriteCancelLeave(sp)) spriteEnter(sp);
        if (sp.getAttribute("data-feel") !== feel) {
          // Feel changed on an on-screen sprite: swap to the new feel's art
          // (falls back to normal art, then to the initial letter) under a
          // quick .vn-swap crossfade/scale pulse.
          var ch2 = S.characters && S.characters[item.id];
          if (ch2) {
            applySpriteArt(sp, item.id, feel, ch2);
            sp.classList.add("vn-swap");
            clearTimeout(sp._vnSwapTimer);
            sp._vnSwapTimer = setTimeout(function () {
              sp._vnSwapTimer = null;
              if (sp.parentNode) sp.classList.remove("vn-swap");
            }, SPRITE_SWAP_MS);
          }
        }
      }
      sp.setAttribute("data-feel", feel);
      kept[item.id] = sp;
    });

    // Characters no longer on stage slide out; their elements linger in the
    // layer during the leave window so a fast re-entry reuses them.
    Object.keys(existing).forEach(function (id) {
      if (!kept[id] && existing[id].parentNode) spriteBeginLeave(existing[id]);
    });

    // Slot assignment: stable while the same characters remain; a new or
    // returning sprite takes the lowest slot not held by a staying sprite.
    var used = {};
    desired.forEach(function (item) {
      var sp = kept[item.id];
      if (!sp) return;
      var slot;
      if (desired.length === 1) {
        slot = 0; // solo characters always stand left-of-center
      } else if (
        typeof sp._vnSlot === "number" &&
        !used[sp._vnSlot]
      ) {
        slot = sp._vnSlot; // unchanged cast: keep the established slot
      } else {
        slot = used[0] ? 1 : 0;
      }
      used[slot] = true;
      if (sp._vnSlot !== slot) {
        sp._vnSlot = slot;
        sp.setAttribute("data-slot", String(slot));
      }
    });

    var last = desired.length - 1;
    desired.forEach(function (item, i) {
      var sp = kept[item.id];
      if (!sp) return;
      layer.appendChild(sp); // re-append to enforce order without recreating
      sp.classList.toggle(SPRITE_POS[0], sp._vnSlot === 0);
      sp.classList.toggle(SPRITE_POS[1], sp._vnSlot === 1);
      sp.classList.toggle("vn-solo", desired.length === 1);
      sp.classList.toggle("vn-focus", i === last);
      sp.classList.toggle("vn-dim", i !== last);
    });
  }

  /* --------------------------------------------------------------- bg layer */

  // Syncs a background entry's trusted fx markup into .vn-bg-fx. Assigning
  // innerHTML replaces the previous content, restarting any CSS animations
  // authored inside the fx html; entries without html clear the layer.
  // bgId is passed through so the optional canvas scene layer (below) can
  // reconcile itself right after the wipe.
  function syncBgFx(bg, bgId) {
    if (!els || !els.bgFx) return;
    els.bgFx.innerHTML = typeof bg.html === "string" ? bg.html : "";
    updateCanvasScene(bgId);
  }

  function applyBg(bgId) {
    if (!bgId || bgId === state.bg) return; // bg persists when omitted / unchanged
    var bg = S.backgrounds && S.backgrounds[bgId];
    if (!bg || typeof bg.css !== "string") {
      console.warn("[VN] unknown background: " + bgId);
      return;
    }
    state.bg = bgId;
    clearTimeout(timers.bg);
    els.bg.classList.add("vn-fade");
    // Fade through black while the background swaps (styling in style.css).
    els.bg.classList.add("vn-fading");
    clearTimeout(timers.fading);
    timers.fading = setTimeout(function () {
      timers.fading = null;
      els.bg.classList.remove("vn-fading");
    }, BG_FADING_MS);
    timers.bg = setTimeout(function () {
      els.bg.style.background = bg.css;
      syncBgFx(bg, bgId);
      audioHook("scene", bgId); // bg now active: switch the ambient loop
      els.bg.classList.remove("vn-fade");
    }, BG_FADE_MS);
  }

  // Instant bg reconstruction used when loading a save (no fade).
  function restoreBg(bgId) {
    clearTimeout(timers.bg);
    els.bg.classList.remove("vn-fade");
    if (!bgId) return;
    var bg = S.backgrounds && S.backgrounds[bgId];
    if (!bg || typeof bg.css !== "string") {
      console.warn("[VN] unknown background in save: " + bgId);
      return;
    }
    state.bg = bgId;
    els.bg.style.background = bg.css;
    syncBgFx(bg, bgId); // re-apply the restored bg's fx html + canvas scene
    audioHook("scene", bgId); // restored bg now active: ambient loop follows
  }

  /* ------------------------------------------------------ canvas scenes */

  // Parallel-authored canvas scenes: window.VN_SCENES (a module loaded before
  // engine.js) maps background id -> { init(ctx, w, h), draw(ctx, w, h, t, dt) }
  // where t = seconds since activation and dt = seconds since the previous
  // frame; both callbacks are optional. While a bg with a scene entry is
  // active, a <canvas class="vn-bg-canvas"> is the last child of .vn-bg-fx
  // (painted above the fx html layer) and .vn-bg-fx carries .vn-has-canvas so
  // CSS can hide the html layer for scenes wanting full control.
  // Everything is defensive: a missing global, a non-object entry, missing
  // callbacks, a null 2d context or a throwing scene falls back silently to
  // the existing html/css behavior. This code never throws.
  var canvasScene = {
    active: false,
    id: null, // background id the scene was activated for
    scene: null, // the VN_SCENES entry
    canvas: null,
    ctx: null,
    raf: null, // pending requestAnimationFrame handle
    ro: null, // ResizeObserver (static frames only; loops check per frame)
    reduced: false, // prefers-reduced-motion: one static frame, no loop
    everFired: false, // has the frame loop run at least once
    fallback: null, // interval id driving frames when rAF never fires
    watchdog: null, // timer that decides whether the fallback is needed
    t: 0, // seconds since activation
    last: null, // previous frame timestamp (ms)
    w: 0, // css width the canvas was last sized to
    h: 0, // css height the canvas was last sized to
    dpr: 1,
  };
  var canvasSceneWarned = {}; // scene ids that already logged a runtime error

  function prefersReducedMotion() {
    try {
      if (
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function"
      ) {
        return !!window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      }
    } catch (err) {
      /* media queries unavailable: assume motion is fine */
    }
    return false;
  }

  function nextFrame(cb) {
    if (typeof requestAnimationFrame === "function") {
      try {
        return requestAnimationFrame(cb);
      } catch (err) {
        return null;
      }
    }
    if (
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
    ) {
      try {
        return window.requestAnimationFrame(cb);
      } catch (err) {
        return null;
      }
    }
    return null;
  }

  function cancelFrame(id) {
    if (id == null) return;
    if (typeof cancelAnimationFrame === "function") {
      try {
        cancelAnimationFrame(id);
      } catch (err) {
        /* ignore */
      }
      return;
    }
    if (
      typeof window !== "undefined" &&
      typeof window.cancelAnimationFrame === "function"
    ) {
      try {
        window.cancelAnimationFrame(id);
      } catch (err) {
        /* ignore */
      }
    }
  }

  function warnCanvasSceneOnce(id, what) {
    if (canvasSceneWarned[id]) return;
    canvasSceneWarned[id] = true;
    console.warn(
      "[VN] canvas scene " + what + " for bg " + id + " — using html layer",
    );
  }

  // Sizes the canvas to .vn-bg-fx's css box x devicePixelRatio (capped at 2).
  // Runs on activation and cheaply every frame; a no-op while nothing changed.
  // Re-init on resize is intentionally NOT done — only the buffer and the
  // context transform update.
  function sizeCanvasScene() {
    var cs = canvasScene;
    if (!cs.canvas || !cs.ctx || !els || !els.bgFx) return;
    var cssW = els.bgFx.clientWidth;
    var cssH = els.bgFx.clientHeight;
    if (
      typeof cssW !== "number" ||
      typeof cssH !== "number" ||
      !isFinite(cssW) ||
      !isFinite(cssH) ||
      cssW <= 0 ||
      cssH <= 0
    ) {
      return;
    }
    var dpr = 1;
    try {
      dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    } catch (err) {
      dpr = 1;
    }
    if (typeof dpr !== "number" || !isFinite(dpr) || dpr <= 0) dpr = 1;
    if (dpr > 2) dpr = 2;
    if (cssW === cs.w && cssH === cs.h && dpr === cs.dpr) return;
    cs.w = cssW;
    cs.h = cssH;
    cs.dpr = dpr;
    try {
      // Assigning width/height resets the buffer and the transform, so the
      // scale is (re)applied right after — it never compounds across resizes.
      cs.canvas.width = Math.max(1, Math.round(cssW * dpr));
      cs.canvas.height = Math.max(1, Math.round(cssH * dpr));
      if (typeof cs.ctx.setTransform === "function") {
        cs.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      } else if (typeof cs.ctx.scale === "function") {
        cs.ctx.scale(dpr, dpr);
      }
    } catch (err) {
      /* sizing failed: keep whatever buffer exists */
    }
  }

  // One rendered frame: cheap resize check, clear, scene.draw. Returns false
  // when the scene failed and the engine fell back to the html/css layer.
  function drawCanvasFrame(t, dt) {
    var cs = canvasScene;
    if (
      !cs.active ||
      !cs.ctx ||
      !cs.scene ||
      typeof cs.scene.draw !== "function"
    ) {
      return false;
    }
    sizeCanvasScene();
    try {
      cs.ctx.clearRect(0, 0, cs.w, cs.h);
      cs.scene.draw(cs.ctx, cs.w, cs.h, t, dt);
      return true;
    } catch (err) {
      warnCanvasSceneOnce(cs.id, "draw failed");
      deactivateCanvasScene(); // silent fallback: canvas out, html layer back
      return false;
    }
  }

  function canvasSceneLoop(ts) {
    var cs = canvasScene;
    cs.raf = null;
    if (!cs.active || !cs.ctx) return;
    cs.everFired = true;
    var dt = 0;
    if (typeof ts === "number" && typeof cs.last === "number") {
      dt = (ts - cs.last) / 1000;
    }
    if (!isFinite(dt) || dt < 0) dt = 0;
    if (typeof ts === "number") cs.last = ts;
    cs.t += dt;
    if (!drawCanvasFrame(cs.t, dt)) return; // scene failed: do not reschedule
    if (!cs.fallback) cs.raf = nextFrame(canvasSceneLoop);
  }

  // Static frames (reduced motion / no rAF) have no loop to check sizing, so
  // a ResizeObserver redraws the single frame when .vn-bg-fx actually changes
  // size. The observer's initial callback reports the already-applied size
  // and is ignored.
  function observeCanvasSceneResize() {
    var cs = canvasScene;
    if (cs.ro || typeof ResizeObserver !== "function" || !els || !els.bgFx) {
      return;
    }
    try {
      cs.ro = new ResizeObserver(function (entries) {
        var size =
          entries && entries.length && entries[0] && entries[0].contentRect
            ? entries[0].contentRect
            : null;
        if (!canvasScene.active || !size) return;
        if (
          Math.round(size.width) === canvasScene.w &&
          Math.round(size.height) === canvasScene.h
        ) {
          return;
        }
        sizeCanvasScene();
        if (canvasScene.reduced) drawCanvasFrame(1.5, 0);
      });
      cs.ro.observe(els.bgFx);
    } catch (err) {
      cs.ro = null;
    }
  }

  function activateCanvasScene(bgId, entry) {
    var canvas = document.createElement("canvas");
    var ctx = null;
    try {
      ctx = canvas.getContext("2d");
    } catch (err) {
      ctx = null;
    }
    if (!ctx) return; // no 2d context: silent html/css fallback, no canvas
    canvas.className = "vn-bg-canvas";
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none"; // purely visual: clicks pass through

    var cs = canvasScene;
    cs.active = true;
    cs.id = bgId;
    cs.scene = entry;
    cs.canvas = canvas;
    cs.ctx = ctx;
    cs.t = 0;
    cs.last = null;
    cs.raf = null;
    cs.reduced = prefersReducedMotion();
    els.bgFx.appendChild(canvas); // last child of .vn-bg-fx, above the html
    els.bgFx.classList.add("vn-has-canvas");
    sizeCanvasScene();

    // init runs once per activation, inside save/restore so a scene cannot
    // leak transform/clip state into anything else using the context.
    var initOk = true;
    try {
      ctx.save();
      if (typeof entry.init === "function") entry.init(ctx, cs.w, cs.h);
    } catch (err) {
      initOk = false;
    }
    try {
      ctx.restore();
    } catch (err) {
      /* restore cannot realistically fail after save() */
    }
    if (!initOk) {
      warnCanvasSceneOnce(bgId, "init failed");
      deactivateCanvasScene();
      return;
    }

    if (typeof entry.draw !== "function") return; // init-only scene: static
    if (cs.reduced) {
      drawCanvasFrame(1.5, 0); // exactly one static frame at t = 1.5, no loop
    } else {
      cs.everFired = false;
      cs.raf = nextFrame(canvasSceneLoop);
      if (cs.raf == null) drawCanvasFrame(0, 0); // no rAF: single frame
      // Watchdog: some embedded preview surfaces never fire rAF (the tab is
      // not composited). If the first frame hasn't run shortly after
      // activation, drive frames from a timer so scenes still animate.
      cs.watchdog = setTimeout(function () {
        cs.watchdog = null;
        if (cs.active && !cs.everFired && !cs.fallback) {
          cs.fallback = setInterval(function () {
            canvasSceneLoop(
              typeof performance === "object" && performance.now
                ? performance.now()
                : Date.now(),
            );
          }, 66);
        }
      }, 400);
    }
    if (cs.reduced || cs.raf == null) observeCanvasSceneResize();
  }

  function deactivateCanvasScene() {
    var cs = canvasScene;
    cancelFrame(cs.raf);
    if (cs.watchdog) {
      clearTimeout(cs.watchdog);
      cs.watchdog = null;
    }
    if (cs.fallback) {
      clearInterval(cs.fallback);
      cs.fallback = null;
    }
    if (cs.ro) {
      try {
        cs.ro.disconnect();
      } catch (err) {
        /* ignore */
      }
      cs.ro = null;
    }
    if (cs.canvas && cs.canvas.parentNode) {
      try {
        cs.canvas.parentNode.removeChild(cs.canvas);
      } catch (err) {
        /* ignore */
      }
    }
    if (els && els.bgFx) els.bgFx.classList.remove("vn-has-canvas");
    cs.active = false;
    cs.id = null;
    cs.scene = null;
    cs.canvas = null;
    cs.ctx = null;
    cs.raf = null;
    cs.reduced = false;
    cs.everFired = false;
    cs.t = 0;
    cs.last = null;
    cs.w = 0;
    cs.h = 0;
    cs.dpr = 1;
  }

  // Reconciles the canvas layer with the bg whose html just synced into
  // .vn-bg-fx. Called after every syncBgFx: activates a scene for bg ids
  // present in window.VN_SCENES, deactivates for everything else. Loading a
  // save onto the SAME canvas bg re-attaches the existing canvas untouched
  // and keeps the running loop — only an actual id change restarts it.
  function updateCanvasScene(bgId) {
    if (!els || !els.bgFx) return;
    var scenes = typeof window !== "undefined" ? window.VN_SCENES : null;
    var entry =
      scenes && typeof scenes === "object" && typeof bgId === "string"
        ? scenes[bgId]
        : null;
    var valid = !!(entry && typeof entry === "object");

    if (canvasScene.active) {
      if (valid && canvasScene.id === bgId && canvasScene.canvas) {
        // Same scene still active: the innerHTML wipe detached our canvas —
        // re-attach it as-is (loop, t and bitmap stay untouched).
        if (canvasScene.canvas.parentNode !== els.bgFx) {
          els.bgFx.appendChild(canvasScene.canvas);
        }
        els.bgFx.classList.add("vn-has-canvas");
        return;
      }
      deactivateCanvasScene();
    }
    if (!valid) return;
    activateCanvasScene(bgId, entry);
  }

  /* --------------------------------------------------------------- line fx */

  var fxWarned = {}; // unknown fx values already warned about (warn once)

  // Applies a line's optional fx. Glitch lasts while the line displays
  // (cleared by clearGlitch); shake is a fixed-duration screen effect that
  // removes itself.
  function applyLineFx(line) {
    var fx = line ? line.fx : null;
    if (fx == null || fx === "") return;
    if (fx === "glitch") {
      els.text.classList.add("vn-glitch");
      return;
    }
    if (fx === "shake") {
      els.app.classList.add("vn-shake");
      clearTimeout(timers.shake);
      timers.shake = setTimeout(function () {
        timers.shake = null;
        if (els) els.app.classList.remove("vn-shake");
      }, SHAKE_MS);
      return;
    }
    if (fx === "dolly") {
      // emotional peak: push the camera in — the background scales up and
      // softens while the focus sprite leans closer; lasts while the line
      // displays and clears on advance (see clearLineFx). The paired swell
      // cue is self-throttled inside the audio module.
      els.app.classList.add("vn-dolly");
      audioHook("swell");
      return;
    }
    if (!fxWarned[fx]) {
      fxWarned[fx] = true;
      console.warn("[VN] unknown line fx: " + fx);
    }
  }

  // Glitch is tied to the currently displayed line — cleared on advance and
  // whenever the engine stops presenting lines.
  function clearGlitch() {
    if (els) els.text.classList.remove("vn-glitch");
  }

  // Full fx reset (title screen): also cancels a pending shake and dolly.
  function clearLineFx() {
    clearGlitch();
    clearTimeout(timers.shake);
    timers.shake = null;
    if (els) {
      els.app.classList.remove("vn-shake");
      els.app.classList.remove("vn-dolly");
    }
  }

  /* ---------------------------------------------------------------- backlog */

  function pushBacklog(name, text) {
    state.backlog.push({ name: name, text: text });
    if (state.backlog.length > BACKLOG_LIMIT) state.backlog.shift();
    if (!els.backlog.classList.contains("vn-hidden")) renderBacklog();
  }

  function renderBacklog() {
    var list = els.blList;
    list.textContent = "";
    state.backlog.forEach(function (entry) {
      var line = document.createElement("div");
      line.className = "vn-backlog-line";
      var b = document.createElement("b");
      b.className = "vn-backlog-name";
      b.textContent = entry.name || "";
      var span = document.createElement("span");
      span.className = "vn-backlog-text";
      span.textContent = entry.text;
      line.appendChild(b);
      line.appendChild(span);
      list.appendChild(line);
    });
    list.scrollTop = list.scrollHeight; // no-op when the list is not scrollable
  }

  function toggleBacklog() {
    if (els.backlog.classList.contains("vn-hidden")) {
      renderBacklog();
      els.backlog.classList.remove("vn-hidden");
    } else {
      els.backlog.classList.add("vn-hidden");
    }
  }

  function hideBacklog() {
    els.backlog.classList.add("vn-hidden");
  }

  /* ---------------------------------------------------------- scene machine */

  // Full scene entry: bg -> enter flags -> branch (first match wins, skips lines).
  function enterScene(id, depth) {
    depth = depth || 0;
    var scene = null;
    while (true) {
      depth += 1;
      if (depth > MAX_SCENE_CHAIN) {
        console.warn(
          "[VN] scene chain too deep (possible branch loop) at: " + id,
        );
        showEnding();
        return;
      }
      scene = S.scenes[id];
      if (!scene || typeof scene !== "object") {
        console.warn("[VN] unknown scene: " + id);
        showEnding();
        return;
      }
      state.scene = id;
      collectEndingNow(id); // entering an ending_* scene collects it (once)
      applyBg(scene.bg);
      setEnterFlags(scene);
      var to = evalBranch(scene);
      if (to != null) {
        if (!S.scenes[to]) {
          console.warn("[VN] branch target scene not found: " + to);
          break; // fall through to this scene's own lines
        }
        id = to;
        continue;
      }
      break;
    }
    maybeShowChapter(scene);
    state.recent = [];
    renderSprites();
    els.name.classList.add("vn-hidden");
    els.name.textContent = "";
    els.text.textContent = "";
    state.line = 0;
    presentCurrent(depth);
  }

  function setEnterFlags(scene) {
    if (!Array.isArray(scene.enter)) return;
    scene.enter.forEach(function (flag) {
      if (typeof flag === "string") state.flags.add(flag);
      else console.warn("[VN] invalid enter flag: " + flag);
    });
  }

  function evalBranch(scene) {
    if (!Array.isArray(scene.branch)) return null;
    for (var i = 0; i < scene.branch.length; i++) {
      var br = scene.branch[i];
      if (!br || typeof br.when !== "string") {
        console.warn("[VN] invalid branch entry at index " + i);
        continue;
      }
      if (state.flags.has(br.when)) {
        if (typeof br.goto !== "string") {
          console.warn(
            '[VN] branch matched "' + br.when + '" but goto is missing',
          );
          return null;
        }
        return br.goto;
      }
    }
    return null;
  }

  function presentCurrent(depth) {
    var scene = S.scenes[state.scene];
    var lines = scene && Array.isArray(scene.lines) ? scene.lines : [];
    if (state.line < lines.length) {
      displayLine(lines[state.line]);
    } else {
      afterLastLine(depth || 0);
    }
  }

  function displayLine(line) {
    state.mode = "line";
    clearAuto();
    clearGlitch(); // fx of the previous line stops here
    if (els) els.app.classList.remove("vn-dolly");

    var speaker = null; // character object, or null for narration
    var speakerId = null;
    var text = "";

    if (line && typeof line.narr === "string") {
      text = line.narr;
    } else if (line && typeof line.who === "string" && line.who) {
      speakerId = line.who;
      speaker = (S.characters && S.characters[line.who]) || null;
      if (!speaker) {
        console.warn(
          "[VN] unknown character: " + line.who + " (rendering as narration)",
        );
      }
      text = typeof line.text === "string" ? line.text : "";
    } else {
      console.warn(
        "[VN] invalid line at index " + state.line + " in scene " + state.scene,
      );
    }

    if (speaker) {
      var nameText = speaker.name != null ? String(speaker.name) : speakerId;
      var color = charColor(speaker);
      els.name.classList.remove("vn-hidden");
      els.name.textContent = nameText;
      els.name.style.color = color;
      els.name.style.borderColor = color;
      showSprite(speakerId, line.feel);
      pushBacklog(nameText, text);
    } else {
      els.name.classList.add("vn-hidden");
      els.name.textContent = "";
      pushBacklog("", text);
    }

    applyLineFx(line);
    startTyping(text);
  }

  function afterLastLine(depth) {
    var scene = S.scenes[state.scene];
    var choices = collectChoices(scene && scene.choices);
    if (choices.length) {
      showChoices(choices);
      return;
    }
    var nxt = scene && typeof scene.next === "string" ? scene.next : null;
    if (scene && scene.next != null && nxt === null) {
      console.warn(
        "[VN] invalid next target in scene " + state.scene + ": " + scene.next,
      );
    }
    if (nxt) {
      if (!S.scenes[nxt]) {
        console.warn("[VN] unknown scene: " + nxt);
        showEnding();
        return;
      }
      enterScene(nxt, depth || 0);
      return;
    }
    showEnding();
  }

  function collectChoices(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    raw.forEach(function (choice, i) {
      if (
        choice &&
        typeof choice === "object" &&
        typeof choice.text === "string"
      ) {
        out.push(choice);
      } else {
        console.warn("[VN] invalid choice at index " + i);
      }
    });
    return out;
  }

  function showChoices(choices) {
    state.mode = "choices";
    clearGlitch();
    var box = els.choices;
    box.textContent = "";
    choices.forEach(function (choice) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vn-choice";
      btn.textContent = choice.text;
      btn.addEventListener("click", function () {
        pickChoice(choice);
      });
      box.appendChild(btn);
    });
    box.classList.remove("vn-hidden");
  }

  function pickChoice(choice) {
    audioHook("ui", "select"); // choice click blip
    if (Array.isArray(choice.set)) {
      choice.set.forEach(function (flag) {
        if (typeof flag === "string") state.flags.add(flag);
        else console.warn("[VN] invalid choice flag: " + flag);
      });
    }
    hideChoices();
    var to = typeof choice.goto === "string" ? choice.goto : null;
    if (!to || !S.scenes[to]) {
      console.warn("[VN] unknown choice target: " + choice.goto);
      showEnding();
      return;
    }
    enterScene(to, 0);
  }

  function hideChoices() {
    els.choices.textContent = "";
    els.choices.classList.add("vn-hidden");
  }

  function showEnding() {
    state.mode = "end";
    clearAuto();
    clearGlitch();
    els.name.classList.add("vn-hidden");
    els.name.textContent = "";
    startTyping(ENDING_TEXT);
    var box = els.choices;
    box.textContent = "";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "vn-choice";
    btn.textContent = "返回标题";
    btn.addEventListener("click", showTitle);
    box.appendChild(btn);
    box.classList.remove("vn-hidden");
    // let the ending breathe for a moment, then roll the credits
    clearTimeout(timers.credits);
    timers.credits = setTimeout(showCredits, CREDITS_DELAY_MS);
  }

  /* -------------------------------------------------------------- credits */

  var CREDITS_LINES = [
    ["", "参宿四还亮着"],
    ["剧本", "子夜工作室"],
    ["引擎与程序", "子夜工作室"],
    ["立绘", "子夜工作室"],
    ["场景渲染", "Canvas 粒子 × 7"],
    ["音效合成", "Web Audio 实时"],
    ["特别出演", "参宿四（α Orionis）"],
    ["献给", "还记得它亮着的每一个人"],
  ];

  function creditsVisible() {
    return !!els && !els.credits.classList.contains("vn-hidden");
  }

  function showCredits() {
    if (!els || state.mode !== "end") return;
    clearTimeout(timers.credits);
    timers.credits = null;
    els.choices.classList.add("vn-hidden"); // the return button yields
    var roll = els.creditsRoll;
    roll.textContent = "";
    CREDITS_LINES.forEach(function (pair) {
      var role = document.createElement("div");
      role.className = "vn-credits-role";
      role.textContent = pair[0];
      var name = document.createElement("div");
      name.className = "vn-credits-name";
      name.textContent = pair[1];
      if (pair[0] === "") {
        // the game title leads the roll, styled like a name
        role.classList.add("vn-credits-title");
        name.classList.add("vn-credits-logo");
      }
      roll.appendChild(role);
      roll.appendChild(name);
    });
    els.credits.classList.remove("vn-hidden");
    // restart the roll animation (class + reflow)
    roll.classList.remove("vn-roll");
    void roll.offsetWidth;
    roll.classList.add("vn-roll");
    clearTimeout(timers.creditsEnd);
    timers.creditsEnd = setTimeout(finishCredits, CREDITS_MS + 900);
  }

  function finishCredits() {
    clearTimeout(timers.creditsEnd);
    timers.creditsEnd = null;
    if (els) els.credits.classList.add("vn-hidden");
    showTitle();
  }

  function hideCreditsNow() {
    if (!els) return;
    els.credits.classList.add("vn-hidden");
    els.creditsRoll.classList.remove("vn-roll");
  }

  function advance() {
    if (chapterVisible()) {
      hideChapter(); // first click during a chapter card only dismisses it
      return;
    }
    if (state.mode !== "line") return;
    if (state.typing) {
      completeTyping();
      return;
    }
    clearAuto();
    state.line += 1;
    presentCurrent(0);
  }

  /* -------------------------------------------------------------- save/load */

  function writeSlot(n) {
    if (!state.scene) {
      toast("暂无进度");
      return;
    }
    var data = {
      scene: state.scene,
      line: state.line,
      flags: Array.from(state.flags),
      ts: new Date().toISOString(),
      title: S.meta && S.meta.title != null ? String(S.meta.title) : "",
      bg: state.bg,
    };
    try {
      localStorage.setItem(slotKey(n), JSON.stringify(data));
    } catch (err) {
      console.warn("[VN] failed to write save: " + err);
      toast("保存失败");
      return;
    }
    toast("已保存");
    audioHook("ui", "save"); // save-written blip
    refreshSlots();
    hideMenu();
  }

  function readSlot(n) {
    var raw = readSlotRaw(n);
    if (!raw) {
      toast("空存档");
      return;
    }
    var data = null;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      data = null;
    }
    if (
      !data ||
      typeof data !== "object" ||
      typeof data.scene !== "string" ||
      !S.scenes[data.scene]
    ) {
      console.warn(
        "[VN] save data in slot " + n + " is invalid for this scenario",
      );
      toast("空存档");
      return;
    }
    restoreFrom(data);
  }

  // Jump straight to scene/line — never re-runs enter flags or branch logic.
  function restoreFrom(data) {
    hideMenu();
    hideBacklog();
    hideSettings();
    hideChoices();
    clearTimeout(timers.type);
    timers.type = null;
    state.typing = false;
    clearAuto();

    state.flags = new Set(
      Array.isArray(data.flags)
        ? data.flags.filter(function (f) {
            return typeof f === "string";
          })
        : [],
    );
    state.scene = data.scene;
    var scene = S.scenes[data.scene];
    var lines = scene && Array.isArray(scene.lines) ? scene.lines : [];
    var line =
      typeof data.line === "number" && isFinite(data.line)
        ? Math.floor(data.line)
        : 0;
    if (line < 0) line = 0;
    if (lines.length > 0 && line > lines.length - 1) line = lines.length - 1;
    state.line = line;

    state.recent = [];
    renderSprites();
    els.title.classList.add("vn-hidden");
    restoreBg(typeof data.bg === "string" ? data.bg : null);
    audioHook("ui", "load"); // save-loaded blip
    presentCurrent(0);
  }

  /* ---------------------------------------------------------------- vn menu */

  function openMenu(mode) {
    if (mode === "save" && !state.scene) {
      toast("暂无进度");
      return;
    }
    state.menuMode = mode;
    els.menuTitle.textContent = mode === "save" ? "存档" : "读档";
    refreshSlots();
    els.menu.classList.remove("vn-hidden");
  }

  function hideMenu() {
    els.menu.classList.add("vn-hidden");
  }

  function refreshSlots() {
    els.slots.forEach(function (slot, i) {
      var n = i + 1;
      var label = n + " · 空";
      var raw = readSlotRaw(n);
      if (raw) {
        var data = null;
        try {
          data = JSON.parse(raw);
        } catch (err) {
          data = null;
        }
        if (data && typeof data === "object") {
          label =
            n +
            " · " +
            (fmtTs(data.ts) || "?") +
            " · " +
            (data.scene != null ? String(data.scene) : "?");
        }
      }
      slot.info.textContent = label;
    });
  }

  function onSlotClick(n) {
    if (state.menuMode === "save") writeSlot(n);
    else readSlot(n);
  }

  /* -------------------------------------------------------------- settings */

  // 设置面板 persistence: {volume: 0..1, autoDelay: ms} under SETTINGS_KEY,
  // shared with audio.js (which merge-writes the same key). Every storage
  // access is guarded exactly like vn-endings — an unavailable store or a
  // corrupt payload reads as the defaults and failed writes are skipped
  // silently. Storage can never break the game.
  function readSettings() {
    var defaults = { volume: 1, autoDelay: AUTO_DELAY_MS };
    var raw = null;
    try {
      raw = localStorage.getItem(SETTINGS_KEY);
    } catch (err) {
      return defaults; // storage unavailable
    }
    if (typeof raw !== "string" || !raw) return defaults;
    var data = null;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      return defaults; // corrupt JSON
    }
    if (!data || typeof data !== "object") return defaults;
    var vol =
      typeof data.volume === "number" && isFinite(data.volume)
        ? data.volume
        : 1;
    if (vol < SETTINGS_VOLUME_MIN) vol = SETTINGS_VOLUME_MIN;
    if (vol > SETTINGS_VOLUME_MAX) vol = SETTINGS_VOLUME_MAX;
    var delay =
      typeof data.autoDelay === "number" && isFinite(data.autoDelay)
        ? Math.round(data.autoDelay)
        : AUTO_DELAY_MS;
    if (delay < SETTINGS_DELAY_MIN) delay = SETTINGS_DELAY_MIN;
    if (delay > SETTINGS_DELAY_MAX) delay = SETTINGS_DELAY_MAX;
    return { volume: vol, autoDelay: delay };
  }

  function writeSettings(data) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
    } catch (err) {
      /* storage unavailable or full: the change is skipped silently */
    }
  }

  // Loaded once per buildDom: the volume is mirrored engine-side and pushed
  // into VN_AUDIO (guarded no-op without the module), the delay becomes the
  // mutable state.autoDelayMs the auto loop reads on every schedule.
  function loadSettings() {
    var loaded = readSettings();
    settingsVol = loaded.volume;
    state.autoDelayMs = loaded.autoDelay;
    audioHook("setVolume", settingsVol);
    syncSettingsUi();
  }

  function saveSettings() {
    writeSettings({ volume: settingsVol, autoDelay: state.autoDelayMs });
  }

  // Current volume: prefer the live module value when it answers, else the
  // engine-side mirror from persisted settings.
  function currentVolume() {
    var mod = typeof window !== "undefined" ? window.VN_AUDIO : null;
    if (mod && typeof mod.volume === "function") {
      try {
        var v = mod.volume();
        if (typeof v === "number" && isFinite(v)) {
          if (v < SETTINGS_VOLUME_MIN) v = SETTINGS_VOLUME_MIN;
          if (v > SETTINGS_VOLUME_MAX) v = SETTINGS_VOLUME_MAX;
          settingsVol = v;
          return v;
        }
      } catch (err) {
        /* fall through to the mirror */
      }
    }
    return settingsVol;
  }

  // Sliders reflect the live state; runs on openSettings and after load.
  function syncSettingsUi() {
    if (!els || !els.volRange) return;
    var v = currentVolume();
    var pct = Math.round(v * 100);
    els.volRange.value = String(pct);
    els.volVal.textContent = pct + "%";
    els.autoRange.value = String(state.autoDelayMs);
    els.autoVal.textContent = (state.autoDelayMs / 1000).toFixed(1) + "s";
  }

  function onVolumeInput() {
    if (!els || !els.volRange) return;
    var pct = parseFloat(els.volRange.value);
    if (!isFinite(pct)) return;
    var v = pct / 100; // 0..100 slider -> 0..1 volume (setVolume clamps again)
    if (v < SETTINGS_VOLUME_MIN) v = SETTINGS_VOLUME_MIN;
    if (v > SETTINGS_VOLUME_MAX) v = SETTINGS_VOLUME_MAX;
    settingsVol = v;
    audioHook("setVolume", v); // module persists its own copy (merge-write)
    if (els.volVal) els.volVal.textContent = Math.round(v * 100) + "%";
    saveSettings();
  }

  function onAutoDelayInput() {
    if (!els || !els.autoRange) return;
    var ms = parseFloat(els.autoRange.value);
    if (!isFinite(ms)) return;
    ms = Math.round(ms);
    if (ms < SETTINGS_DELAY_MIN) ms = SETTINGS_DELAY_MIN;
    if (ms > SETTINGS_DELAY_MAX) ms = SETTINGS_DELAY_MAX;
    state.autoDelayMs = ms;
    if (els.autoVal) els.autoVal.textContent = (ms / 1000).toFixed(1) + "s";
    saveSettings();
    if (state.auto) scheduleAuto(); // a running bar picks up the new duration
  }

  function openSettings() {
    syncSettingsUi(); // sliders always show the current values
    els.settings.classList.remove("vn-hidden");
  }

  function hideSettings() {
    els.settings.classList.add("vn-hidden");
  }

  /* ------------------------------------------------------ ending collection */

  // 结局收集: the three scenario endings are collected the moment their
  // scene is entered and persisted as a JSON id array under ENDINGS_KEY.
  // Every storage access is guarded — an unavailable store (or a corrupt
  // payload) just reads as "nothing collected yet", and a failed write is
  // skipped silently. Storage can never break the game.
  function readEndings() {
    var raw = null;
    try {
      raw = localStorage.getItem(ENDINGS_KEY);
    } catch (err) {
      return []; // storage unavailable: behave as if nothing was collected
    }
    if (typeof raw !== "string" || !raw) return [];
    var data = null;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      return []; // corrupt JSON: treat as empty
    }
    if (!Array.isArray(data)) return [];
    var out = [];
    for (var i = 0; i < data.length && out.length < ENDING_IDS.length; i++) {
      if (ENDING_IDS.indexOf(data[i]) !== -1 && out.indexOf(data[i]) === -1) {
        out.push(data[i]); // known ids only, deduped, capped at 3
      }
    }
    return out;
  }

  function writeEndings(ids) {
    try {
      localStorage.setItem(ENDINGS_KEY, JSON.stringify(ids));
    } catch (err) {
      /* storage unavailable or full: the collect is skipped silently */
    }
  }

  // Adds an ending id if absent; returns true only on a first-time collect
  // (the caller toasts then).
  function collectEnding(id) {
    if (ENDING_IDS.indexOf(id) === -1) return false;
    var ids = readEndings();
    if (ids.indexOf(id) !== -1) return false;
    ids.push(id);
    if (ids.length > ENDING_IDS.length) ids.length = ENDING_IDS.length;
    writeEndings(ids);
    return true;
  }

  // Collection point: scene entry (see enterScene). The robust moment — it
  // holds even when the player leaves an ending scene before its THE END,
  // and scenes only load during play, never on the title screen.
  function collectEndingNow(id) {
    if (!els) return;
    if (collectEnding(id)) toast("结局回收 +1"); // first-time collect only
  }

  // Title-screen readout: "结局回收 N/3" plus one pill per ending — "？"
  // while uncollected, the ending's own label once seen. Runs from buildDom
  // and every showTitle; touches no timers or rAF loops.
  function renderEndings() {
    if (!els || !els.endingsCount) return;
    var got = readEndings();
    els.endingsCount.textContent =
      "结局回收 " + got.length + "/" + ENDING_IDS.length;
    ENDING_IDS.forEach(function (id) {
      var mark = els.endingMarks[id];
      if (!mark) return;
      var collected = got.indexOf(id) !== -1;
      mark.textContent = collected ? ENDING_LABELS[id] : ENDING_UNSEEN;
      mark.classList.toggle("vn-collected", collected);
    });
  }

  /* ----------------------------------------------------------- title screen */

  var TITLE_SUB_BONUS = "无论走到哪条时间线，它都亮着。";

  function applyTitleSub(bonus) {
    if (!els) return;
    if (bonus) {
      els.titleSub.textContent = TITLE_SUB_BONUS;
      return;
    }
    var author =
      S && S.meta && S.meta.author != null && S.meta.author !== ""
        ? String(S.meta.author)
        : "";
    els.titleSub.textContent = author ? author + " · 视觉小说" : "视觉小说";
  }

  function fillTitle() {
    var meta = (S && S.meta) || {};
    els.titleName.textContent = meta.title != null ? String(meta.title) : "";
    applyTitleSub(titleBonusActive());
  }

  /* -------------------------------------------------- title canvas + chapter */

  // Gentle starfield behind the title screen: seeded stars with individual
  // twinkle, a drifting additive nebula band, and occasional shooting stars.
  // Runs on rAF with the same watchdog fallback as canvas scenes (embedded
  // preview surfaces may never fire rAF), and stops whenever the title is
  // hidden. Static single frame under prefers-reduced-motion.
  var titleFx = {
    canvas: null,
    ctx: null,
    raf: null,
    last: null,
    t: 0,
    everFired: false,
    fallback: null,
    watchdog: null,
    stars: null,
    nebula: null,
    shoot: null,
    nextShoot: 5,
    w: 0,
    h: 0,
    dpr: 1,
    bonus: false, // all endings collected: title runs the finale_star scene
    bonusInit: false,
    subBase: null, // original subtitle text (author line)
  };

  // 100% completion reward: with all three endings collected (and the
  // finale_star renderer present), the title screen runs that scene instead
  // of the default starfield and swaps the subtitle for a thank-you line.
  function titleBonusActive() {
    if (typeof window === "undefined" || !window.VN_SCENES) return false;
    var sc = window.VN_SCENES.finale_star;
    if (!sc || typeof sc.draw !== "function") return false;
    return readEndings().length >= ENDING_IDS.length;
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function startTitleCanvas() {
    if (!els || !els.titleCanvas) return;
    var ctx = null;
    try {
      ctx = els.titleCanvas.getContext("2d");
    } catch (err) {
      ctx = null;
    }
    if (!ctx) return;
    var cs = titleFx;
    cs.canvas = els.titleCanvas;
    cs.ctx = ctx;
    cs.t = 0;
    cs.last = null;
    cs.everFired = false;
    cs.bonus = titleBonusActive();
    cs.bonusInit = false;
    sizeTitleCanvas();
    initTitleScene(); // re-seed on every activation (also seeds bonus scene)
    if (prefersReducedMotion()) {
      drawTitleFrame(1.5, 0); // static frame, no loop
      return;
    }
    cs.raf = nextFrame(titleLoop);
    cs.watchdog = setTimeout(function () {
      cs.watchdog = null;
      if (!cs.everFired && !cs.fallback) {
        cs.fallback = setInterval(function () {
          titleLoop(
            typeof performance === "object" && performance.now
              ? performance.now()
              : Date.now(),
          );
        }, 66);
      }
    }, 400);
  }

  function stopTitleCanvas() {
    var cs = titleFx;
    cancelFrame(cs.raf);
    cs.raf = null;
    if (cs.watchdog) {
      clearTimeout(cs.watchdog);
      cs.watchdog = null;
    }
    if (cs.fallback) {
      clearInterval(cs.fallback);
      cs.fallback = null;
    }
    cs.everFired = false;
    cs.last = null;
    cs.shoot = null;
  }

  function sizeTitleCanvas() {
    var cs = titleFx;
    if (!cs.ctx) return;
    var w = els.title.clientWidth || 320;
    var hgt = els.title.clientHeight || 240;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (cs.w === w && cs.h === hgt && cs.dpr === dpr) return;
    cs.w = w;
    cs.h = hgt;
    cs.dpr = dpr;
    cs.canvas.width = Math.round(w * dpr);
    cs.canvas.height = Math.round(hgt * dpr);
    cs.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    initTitleScene();
  }

  function initTitleScene() {
    var cs = titleFx;
    if (cs.bonus) {
      // completion reward: hand the canvas to the finale_star renderer
      var fs = window.VN_SCENES && window.VN_SCENES.finale_star;
      if (fs && typeof fs.init === "function" && !cs.bonusInit) {
        try {
          cs.ctx.save();
          fs.init(cs.ctx, cs.w, cs.h);
          cs.bonusInit = true;
        } catch (err) {
          cs.bonus = false; // scene failed: fall back to the starfield
        }
        try {
          cs.ctx.restore();
        } catch (err) {
          /* restore cannot realistically fail after save() */
        }
      }
      return;
    }
    var rnd = mulberry32(0xb3715);
    cs.stars = [];
    for (var i = 0; i < 140; i++) {
      cs.stars.push({
        x: rnd() * cs.w,
        y: rnd() * cs.h * 0.85,
        r: 0.4 + rnd() * 1.3,
        ph: rnd() * 6.283,
        sp: 0.5 + rnd() * 1.5,
        warm: rnd() < 0.25,
        drift: (rnd() - 0.5) * 1.2,
      });
    }
    var nb = document.createElement("canvas");
    nb.width = Math.max(2, Math.round(cs.w * 0.7));
    nb.height = Math.max(2, Math.round(cs.h * 0.5));
    try {
      var ng = nb.getContext("2d");
      if (ng && typeof ng.createRadialGradient === "function") {
        ng.globalCompositeOperation = "lighter";
        for (var j = 0; j < 90; j++) {
          var bx = rnd() * nb.width;
          var by = rnd() * nb.height;
          var br = 30 + rnd() * 90;
          var g = ng.createRadialGradient(bx, by, 0, bx, by, br);
          var hue = 210 + rnd() * 60;
          g.addColorStop(0, "hsla(" + hue + ",60%,70%,0.045)");
          g.addColorStop(1, "hsla(" + hue + ",60%,70%,0)");
          ng.fillStyle = g;
          ng.beginPath();
          ng.arc(bx, by, br, 0, 6.283);
          ng.fill();
        }
      }
    } catch (err) {
      nb = null; // nebula is decorative: skip it entirely
    }
    cs.nebula = nb;
    cs.nextShoot = 4 + rnd() * 5;
    cs.shoot = null;
  }

  function titleLoop(ts) {
    var cs = titleFx;
    cs.raf = null;
    if (!cs.ctx || !els || els.title.classList.contains("vn-hidden")) return;
    cs.everFired = true;
    var dt = 0;
    if (typeof ts === "number" && typeof cs.last === "number") {
      dt = (ts - cs.last) / 1000;
    }
    if (!isFinite(dt) || dt < 0) dt = 0;
    if (typeof ts === "number") cs.last = ts;
    cs.t += dt;
    drawTitleFrame(cs.t, dt);
    if (!cs.fallback) cs.raf = nextFrame(titleLoop);
  }

  function drawTitleFrame(t, dt) {
    var cs = titleFx;
    var ctx = cs.ctx;
    if (!ctx) return;
    sizeTitleCanvas();
    if (cs.bonus) {
      // completion reward: the finale_star scene paints the title instead
      var fs = window.VN_SCENES && window.VN_SCENES.finale_star;
      if (fs && typeof fs.draw === "function") {
        ctx.clearRect(0, 0, cs.w, cs.h);
        try {
          fs.draw(ctx, cs.w, cs.h, t, dt);
        } catch (err) {
          cs.bonus = false; // scene broke mid-run: drop back to starfield
        }
      }
      return;
    }
    if (!cs.stars) return;
    ctx.clearRect(0, 0, cs.w, cs.h);
    ctx.globalCompositeOperation = "lighter";
    if (cs.nebula) {
      try {
        var nx = cs.w * 0.15 + Math.sin(t * 0.02) * 30;
        var ny = cs.h * 0.1 + Math.cos(t * 0.013) * 20;
        ctx.drawImage(cs.nebula, nx, ny, cs.nebula.width, cs.nebula.height);
      } catch (err) {
        cs.nebula = null; // drawImage unsupported in this environment
      }
    }
    for (var i = 0; i < cs.stars.length; i++) {
      var s = cs.stars[i];
      var tw = 0.55 + 0.45 * Math.sin(s.ph + t * s.sp);
      s.x += s.drift * dt;
      if (s.x < 0) s.x += cs.w;
      if (s.x > cs.w) s.x -= cs.w;
      ctx.globalAlpha = tw;
      ctx.fillStyle = s.warm ? "#ffd9a0" : "#dfe9ff";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    cs.nextShoot -= dt;
    if (!cs.shoot && cs.nextShoot <= 0) {
      cs.shoot = {
        x: cs.w * (0.2 + Math.random() * 0.5),
        y: cs.h * (0.05 + Math.random() * 0.25),
        vx: 380 + Math.random() * 160,
        vy: 150 + Math.random() * 90,
        life: 0,
      };
      cs.nextShoot = 7 + Math.random() * 5;
    }
    if (cs.shoot) {
      var sh = cs.shoot;
      sh.life += dt;
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      var a = Math.max(0, 1 - sh.life / 1.1);
      if (a <= 0 || sh.x > cs.w + 60 || sh.y > cs.h) {
        cs.shoot = null;
      } else {
        var grad = ctx.createLinearGradient(
          sh.x,
          sh.y,
          sh.x - sh.vx * 0.22,
          sh.y - sh.vy * 0.22,
        );
        grad.addColorStop(0, "rgba(255,255,255," + 0.9 * a + ")");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(sh.x, sh.y);
        ctx.lineTo(sh.x - sh.vx * 0.22, sh.y - sh.vy * 0.22);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  // Chapter cards: a scene may carry `chapter: "第X章 · ..."`; a card shows
  // once per distinct string (per session; reset on title), fades itself out
  // after ~2.8s, and the next click/space dismisses it early.
  var lastChapter = null;
  var chapterTimers = { show: null, hide: null };

  function maybeShowChapter(scene) {
    if (!els) return;
    var txt = scene && typeof scene.chapter === "string" ? scene.chapter : null;
    if (!txt || txt === lastChapter) return;
    lastChapter = txt;
    els.chapterText.textContent = txt;
    els.chapter.classList.remove("vn-hidden");
    els.chapter.classList.remove("vn-show");
    clearTimeout(chapterTimers.show);
    clearTimeout(chapterTimers.hide);
    chapterTimers.show = setTimeout(function () {
      chapterTimers.show = null;
      els.chapter.classList.add("vn-show");
    }, 30);
    chapterTimers.hide = setTimeout(hideChapter, 2800);
  }

  function chapterVisible() {
    return !!els && !els.chapter.classList.contains("vn-hidden");
  }

  function hideChapter() {
    if (!els) return;
    clearTimeout(chapterTimers.show);
    clearTimeout(chapterTimers.hide);
    chapterTimers.show = null;
    chapterTimers.hide = null;
    if (els.chapter.classList.contains("vn-hidden")) return;
    els.chapter.classList.remove("vn-show");
    setTimeout(function () {
      els.chapter.classList.add("vn-hidden");
    }, 800);
  }

  function hideChapterNow() {
    if (!els) return;
    clearTimeout(chapterTimers.show);
    clearTimeout(chapterTimers.hide);
    chapterTimers.show = null;
    chapterTimers.hide = null;
    els.chapter.classList.remove("vn-show");
    els.chapter.classList.add("vn-hidden");
  }

  function showTitle() {
    clearTimeout(timers.type);
    clearAuto();
    clearTimeout(timers.bg);
    state.mode = "title";
    state.typing = false;
    state.auto = false;
    els.btns.auto.classList.remove("vn-active");
    state.scene = null;
    state.line = 0;
    state.flags = new Set();
    state.bg = null;
    state.recent = [];
    state.backlog = [];
    clearSpritesNow(); // title flow: the stage empties at once, no exit anim
    renderBacklog();
    clearLineFx(); // drop any line fx still on screen
    clearTimeout(timers.fading);
    els.bg.classList.remove("vn-fade");
    els.bg.classList.remove("vn-fading");
    els.bg.style.background = "";
    els.bgFx.innerHTML = "";
    deactivateCanvasScene(); // stop the loop, drop the canvas + .vn-has-canvas
    audioHook("scene", null); // title screen: the module silences the ambient
    els.name.classList.add("vn-hidden");
    els.name.textContent = "";
    els.text.textContent = "";
    hideChoices();
    hideMenu();
    hideBacklog();
    hideSettings();
    hideCreditsNow();
    clearTimeout(timers.credits);
    clearTimeout(timers.creditsEnd);
    timers.credits = null;
    timers.creditsEnd = null;
    hideChapterNow();
    lastChapter = null; // returning to title allows chapter cards again
    setSkip(false, true); // title reset latches skip off
    renderEndings(); // refresh the 结局收集 readout for this visit
    applyTitleSub(titleBonusActive()); // 3/3: swap in the thank-you subtitle
    els.title.classList.remove("vn-hidden");
    startTitleCanvas();
  }

  function beginGame() {
    audioHook("ui", "start"); // start button click blip
    var startId = S && typeof S.start === "string" ? S.start : null;
    if (!startId || !S.scenes[startId]) {
      console.warn("[VN] start scene not found: " + (S ? S.start : S));
      return;
    }
    state.flags = new Set();
    els.title.classList.add("vn-hidden");
    stopTitleCanvas();
    enterScene(startId, 0);
  }

  /* ----------------------------------------------------------------- events */

  function onTopbarClick(e) {
    var btn = closest(e.target, ".vn-btn");
    if (!btn) return;
    var act = btn.getAttribute("data-act");
    if (act === "backlog") toggleBacklog();
    else if (act === "save") openMenu("save");
    else if (act === "load") openMenu("load");
    else if (act === "auto") toggleAuto();
    else if (act === "skip") toggleSkip();
    else if (act === "speed") cycleSpeed();
    else if (act === "title") showTitle();
    else if (act === "settings") openSettings();
    else if (act === "audio") toggleAudio();
    else console.warn("[VN] unknown topbar action: " + act);
  }

  function onAppClick(e) {
    if (!S || !els) return;
    if (creditsVisible()) {
      finishCredits(); // any click skips the roll
      return;
    }
    if (overlaysOpen()) return;
    if (closest(e.target, "button")) return;
    if (closest(e.target, ".vn-topbar")) return;
    advance();
  }

  function onKeyDown(e) {
    if (!S || !els) return;
    if (e.key === "Escape" || e.key === "Esc") {
      hideMenu();
      hideBacklog();
      hideSettings();
      return;
    }
    // hold S to fast-skip without latching the topbar button
    if (
      (e.key === "s" || e.key === "S") &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      if (!skipHeld) {
        skipHeld = true;
        scheduleSkip();
      }
      return;
    }
    if (e.key !== " " && e.key !== "Spacebar" && e.key !== "Enter") return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (creditsVisible()) {
      if (typeof e.preventDefault === "function") e.preventDefault();
      finishCredits(); // space/enter skips the roll too
      return;
    }
    if (overlaysOpen()) return;
    if (typeof e.preventDefault === "function") e.preventDefault();
    advance();
  }

  function onKeyUp(e) {
    if (e.key === "s" || e.key === "S") {
      skipHeld = false;
      if (!skipOn) {
        clearTimeout(timers.skip);
        timers.skip = null;
      }
    }
  }

  /* -------------------------------------------------------------------- api */

  function start(scenario) {
    var sc =
      scenario || (typeof window !== "undefined" ? window.SCENARIO : null);
    if (
      !sc ||
      typeof sc !== "object" ||
      !sc.scenes ||
      typeof sc.scenes !== "object"
    ) {
      console.warn("[VN] start: invalid scenario object");
      return;
    }
    if (typeof document === "undefined" || !document.body) {
      console.warn("[VN] start: document.body is not ready yet");
      return;
    }
    S = sc;
    buildDom();
    fillTitle();
    showTitle();
  }

  window.VN = { start: start };
})();
