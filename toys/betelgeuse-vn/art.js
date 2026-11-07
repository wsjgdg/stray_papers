// art.js — inline SVG waist-up standing portraits (classic visual-novel
// sprite style) for the cast. Defines window.CHAR_ART =
// { <charId>: { normal, happy, sad, surprised, angry } } where every value is
// a standalone <svg> string (viewBox "0 0 260 340", width/height 100%,
// preserveAspectRatio xMidYMax so the waist sits on the stage floor) rendered
// inside the .vn-sprite slot via innerHTML.
//
// Each character is ONE parameterized template: shared head geometry +
// per-character silhouette (hair / clothing / signature prop) and palette.
// The five feelings are differentiated EYES-FIRST, with independent brow
// shapes and per-feel mouths layered on top:
//   normal     relaxed lids (upper lid just grazing the iris) + faint
//              lower-lid hint
//   happy      closed joy arcs with outer lash ticks + blush + head tilt
//   sad        lids half-down, gaze averted down-left, faint under-eye line,
//              inner-brows raised and drawn together, short off-center
//              downturned mouth, figure sinks 2px
//   surprised  tall whites all around a small iris, lids high, small oval
//              mouth, 1px head lift
//   angry      hard angled lids half-covering the iris, narrowed pupils,
//              inner brows pressed toward the nose + warm rim tint; angry
//              mouth is per-character (yu grits / lin presses one corner
//              down / qi a perfectly flat line / mian a trembling wave)
// Per-character feel accents:
//   yu   thin glasses in every feel (lens glint flares when angry); angry
//        pushes them up with one finger (raised jacket sleeve + hand at the
//        bridge); sad turns the head slightly away from the viewer
//   lin  star hairpin sparkles on happy; hugs her own sleeve on sad (forearm
//        wrapped across the chest, fingers gripping); covers her mouth with
//        one cardigan sleeve on surprised
//   qi   chest status light changes with the feel (normal mint / happy bright
//        cyan / sad dimmed gray-cyan / surprised double-dot blink hint /
//        angry amber) and the cheek circuit tracery brightens on angry;
//        posture stays perfectly symmetric (head never tilts)
//   mian  translucent in every feel (.88), dipping to .78 on sad as the
//        double-exposure blur intensifies; a hand pressed to her chest on
//        surprised
// Shading is 2-tone cel (base + one shadow tone per surface) with a thin
// rim-light stroke on the lit side; no gradients, no raster, no text
// elements. mian keeps a blurred duplicate silhouette behind (feGaussianBlur).
// Strings use single quotes in JS with double quotes inside the SVG markup.
(function () {
  "use strict";

  // ---- shared palette & head geometry --------------------------------------
  var SKIN = "#f6dcc8";
  var SKIN_DK = "#ecc6ab";
  var PUPIL = "#232a3d";
  var MOUTH = "#a4525c";
  var BLUSH = "rgba(255,138,132,0.4)";
  var WHITE = "#fff";

  var FACE =
    "M94 98 Q94 60 130 58 Q166 60 166 98 Q166 134 130 156 Q94 134 94 98 Z";
  var NECK = "M116 142 H144 V182 Q130 192 116 182 Z";
  var NSHAD = "M116 144 Q130 160 144 144 L144 156 Q130 170 116 156 Z";
  var BANGSH = "M98 92 Q130 80 162 92 L162 104 Q130 94 98 104 Z";
  var NOSE = "M128 121 Q131.5 125 128.5 128";

  var FEELS = ["normal", "happy", "sad", "surprised", "angry"];

  // tiny builders (keep generated strings compact)
  function p(d, f, x) {
    return '<path d="' + d + '" fill="' + f + '"' + (x || "") + "/>";
  }
  function s(d, c, w, x) {
    return (
      '<path d="' +
      d +
      '" stroke="' +
      c +
      '" stroke-width="' +
      w +
      '"' +
      (x || "") +
      "/>"
    );
  }
  function o(cx, cy, r, f, x) {
    return (
      '<circle cx="' +
      cx +
      '" cy="' +
      cy +
      '" r="' +
      r +
      '" fill="' +
      f +
      '"' +
      (x || "") +
      "/>"
    );
  }
  function e(cx, cy, rx, ry, f, x) {
    return (
      '<ellipse cx="' +
      cx +
      '" cy="' +
      cy +
      '" rx="' +
      rx +
      '" ry="' +
      ry +
      '" fill="' +
      f +
      '"' +
      (x || "") +
      "/>"
    );
  }

  // vertical hair gradient (light crown -> dark ends): the single biggest
  // "not flat" cue. ids are per-character — at most one sprite per character
  // is ever on stage, so url(#) collisions cannot happen.
  function hairGrad(id, top, bottom) {
    return (
      '<defs><linearGradient id="' +
      id +
      '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="' +
      top +
      '"/>' +
      '<stop offset="1" stop-color="' +
      bottom +
      '"/></linearGradient></defs>'
    );
  }

  // ---- parameterized features (shared across the cast) ----------------------

  // Eyes are the primary emotional channel: each feel gets its own lid
  // geometry, iris size/position and support lines.
  function eyes(f, c) {
    var eye = c.eye;
    var dk = c.dk;
    var hi = c.hi;
    // limbal ring: a dark rim around the iris, strong enough to read at
    // sprite scale. glow: a light arc hugging the iris bottom — the anime
    // depth cue that makes flat circles read as glassy eyes.
    function ring(cx, cy, r) {
      return (
        '<circle cx="' +
        cx +
        '" cy="' +
        cy +
        '" r="' +
        r +
        '" fill="none" stroke="' +
        eye +
        '" stroke-width="1.6" opacity=".7"/>'
      );
    }
    function glow(cx, cy, w) {
      return s(
        "M" +
          (cx - w) +
          " " +
          (cy + 3) +
          " Q" +
          cx +
          " " +
          (cy + 5.6) +
          " " +
          (cx + w) +
          " " +
          (cy + 3),
        hi,
        2.2,
        ' opacity=".85"',
      );
    }
    function one(cx, right) {
      if (f === "happy") {
        // closed joy arcs + a lash tick flicking up-outward
        return (
          s(
            "M" +
              (cx - 9.5) +
              " 113.5 Q" +
              cx +
              " 103 " +
              (cx + 9.5) +
              " 113.5",
            eye,
            3.2,
          ) +
          s(
            right
              ? "M" + (cx + 9) + " 112.6 L" + (cx + 12.5) + " 110.4"
              : "M" + (cx - 9) + " 112.6 L" + (cx - 12.5) + " 110.4",
            eye,
            2.2,
          )
        );
      }
      if (f === "sad") {
        // lids half-down (outer corner sags), gaze averted down-left,
        // faint under-eye line
        var so = right ? cx + 10 : cx - 10;
        var si = right ? cx - 10 : cx + 10;
        return (
          e(cx, 113, 9, 8, WHITE) +
          o(cx - 2, 115.5, 4.2, eye) +
          o(cx - 2, 115.5, 1.9, PUPIL) +
          o(cx - 3.5, 113.5, 1.5, WHITE) + // catchlight the other feels have
          glow(cx - 2, 115.5, 2.6) +
          ring(cx - 2, 115.5, 4.2) +
          p(
            "M" +
              so +
              " 111.5 L" +
              so +
              " 102 L" +
              si +
              " 102 L" +
              si +
              " 109.5 Z",
            SKIN,
          ) +
          s(
            "M" +
              (right ? so - 1 : so + 1) +
              " 110.8 L" +
              (right ? si + 1 : si - 1) +
              " 109.2",
            dk,
            2.2,
          ) +
          s(
            "M" +
              (cx - 6.5) +
              " 122.8 Q" +
              cx +
              " 125.2 " +
              (cx + 6) +
              " 122.8",
            dk,
            1.4,
            ' opacity=".45"',
          )
        );
      }
      if (f === "surprised") {
        // tall whites all around a small iris, lids pushed high
        return (
          e(cx, 112, 10, 12, WHITE) +
          o(cx, 113.5, 4.1, eye) +
          o(cx, 113.5, 1.8, PUPIL) +
          ring(cx, 113.5, 4.1) +
          glow(cx, 113.5, 2.5) +
          o(cx - 1.8, 109.8, 1.8, WHITE) +
          s(
            "M" + (cx - 10) + " 100.5 Q" + cx + " 98 " + (cx + 10) + " 100.5",
            dk,
            2,
          ) +
          s(
            "M" + (cx - 8) + " 123.5 Q" + cx + " 125.5 " + (cx + 8) + " 123.5",
            dk,
            1.4,
            ' opacity=".55"',
          )
        );
      }
      if (f === "angry") {
        // hard angled lid quad half-covering the iris, inner end pressed
        // low toward the nose; narrowed pupil
        var ai = right ? cx - 10 : cx + 10;
        var ao = right ? cx + 10 : cx - 10;
        return (
          e(cx, 113, 9.5, 9, WHITE) +
          o(cx, 114.5, 4.6, eye) +
          o(cx, 114.5, 1.6, PUPIL) +
          ring(cx, 114.5, 4.6) +
          glow(cx, 114.5, 2.8) +
          o(cx - 2.4, 111.8, 1.8, WHITE) +
          p(
            "M" +
              ao +
              " 107.5 L" +
              ao +
              " 101.5 L" +
              ai +
              " 101.5 L" +
              ai +
              " 113.5 Z",
            SKIN,
          ) +
          s("M" + ao + " 108 L" + ai + " 113.8", dk, 2.4)
        );
      }
      // normal — relaxed lids, faint lower-lid hint
      return (
        e(cx, 113, 9.5, 10, WHITE) +
        o(cx, 113.5, 5.4, eye) +
        o(cx, 113.5, 2.3, PUPIL) +
        ring(cx, 113.5, 5.4) +
        glow(cx, 113.5, 3.2) +
        o(cx - 2.8, 110.2, 2.1, WHITE) +
        o(cx + 2.4, 116, 1, WHITE, ' opacity=".7"') +
        s(
          "M" +
            (cx - 9.5) +
            " 109.5 Q" +
            cx +
            " 103.5 " +
            (cx + 9.5) +
            " 109.5",
          dk,
          2.2,
        ) +
        s(
          "M" + (cx - 6) + " 121.5 Q" + cx + " 123 " + (cx + 6) + " 121.5",
          dk,
          1.2,
          ' opacity=".3"',
        )
      );
    }
    return one(110, false) + one(150, true);
  }

  // Brows: five genuinely different shapes, not rotations of one arc.
  function brows(f, dk) {
    var d;
    if (f === "happy")
      d = "M99 93 Q110 87.5 121 92.5 M139 92.5 Q150 87.5 161 93";
    else if (f === "sad")
      d = "M100 104 Q111 102.5 122 96.5 M138 96.5 Q149 102.5 160 104";
    else if (f === "surprised")
      d = "M99 90.5 Q110 82.5 121 89.5 M139 89.5 Q150 82.5 161 90.5";
    else if (f === "angry")
      d = "M100 90.5 Q111 93.5 122 101 M138 101 Q149 93.5 160 90.5";
    else d = "M100 96.5 Q110 92 120 95.5 M140 95.5 Q150 92 160 96.5";
    return s(d, dk, f === "angry" ? 3.2 : 3);
  }

  function mouth(f, c) {
    if (f === "happy") {
      // small open smile + lower-lip hint
      return (
        p("M121 138 Q130 152.5 139 138 Q130 144 121 138 Z", MOUTH) +
        s("M124.5 150 Q130 152 135.5 150", MOUTH, 1.7, ' opacity=".65"')
      );
    }
    if (f === "sad") return s("M122.5 145.5 Q128.5 140 135 145.5", MOUTH, 2.6);
    if (f === "surprised")
      return e(130, 144, 5, 6.5, MOUTH) + e(130, 145.8, 2.8, 3.8, "#7e3b44");
    if (f === "angry") return c.angryM;
    return s("M122 141 Q130 147 138 141", MOUTH, 2.6);
  }

  function accents(f) {
    if (f === "happy")
      return (
        o(98, 130, 7.5, BLUSH) +
        o(162, 130, 7.5, BLUSH) +
        // soft lower-lip hint under the open smile
        s("M124.5 152.5 Q130 155 135.5 152.5", MOUTH, 1.4, ' opacity=".4"')
      );
    if (f === "angry")
      return s("M165 94 Q173 122 164 150", "#ff6a4d", 4, ' opacity=".5"');
    if (f === "normal" || f === "sad")
      // faint lower-lip shadow grounds the simple stroke mouth
      return s(
        "M124.5 150.5 Q130 153 135.5 150.5",
        MOUTH,
        1.4,
        ' opacity=".32"',
      );
    return "";
  }

  // ---- shared refinement passes (all cast, every feel) -----------------------

  // inner-ear curve: matches the ear ellipses at (93,114)/(167,114); rendered
  // right after c.ears so fringe/sides still layer over it where hair covers
  var EAR_DETAIL =
    s(
      "M91 111.5 Q94.5 112 94.5 114.5 Q93.5 117.5 90.5 117.5",
      SKIN_DK,
      1.5,
      ' opacity=".65"',
    ) +
    s(
      "M169 111.5 Q165.5 112 165.5 114.5 Q166.5 117.5 169.5 117.5",
      SKIN_DK,
      1.5,
      ' opacity=".65"',
    );

  // hair refinement: lower-bang volume band, strand separations, crown gloss,
  // flyaways — coordinates sit in the shared bangs region (x92-168, y52-100)
  function hairDetail(c) {
    var dk = c.hairDk || c.dk;
    return (
      p(
        "M93 96 Q95 62 130 58 Q165 62 167 96 L167 90 Q152 80 130 82 Q108 80 93 90 Z",
        dk,
        ' opacity=".2"',
      ) +
      s("M112 58 Q108 76 112 93", dk, 2, ' opacity=".6"') +
      s("M130 54 Q127 70 130 86", dk, 2, ' opacity=".5"') +
      s("M148 58 Q152 76 148 93", dk, 2, ' opacity=".6"') +
      // anime crown shine: a zigzag band across the upper bangs
      s(
        "M106 68 Q116 61 126 65 Q136 59 146 64 Q152 61 156 66",
        c.hi,
        3.6,
        ' opacity=".8"',
      ) +
      s("M108 75 Q118 69 128 72 Q138 67 148 71", c.hi, 2, ' opacity=".45"') +
      e(126, 62, 24, 9, WHITE, ' opacity=".1"') +
      s("M118 53 Q114 45 107 42", dk, 1.4, ' opacity=".55"') +
      s("M138 53 Q142 44 150 42", dk, 1.4, ' opacity=".55"')
    );
  }

  // face refinement: double-lid creases, outer lash ticks, nose-bridge
  // highlight + nostril hint, soft jaw shadow under the chin
  function faceDetail(f, c) {
    var t =
      s("M101 101.5 Q110 97 119 100.5", c.dk, 1.5, ' opacity=".35"') +
      s("M141 100.5 Q150 97 159 101.5", c.dk, 1.5, ' opacity=".35"');
    if (f !== "happy") {
      // lash ticks at the outer corners (happy eyes have their own)
      t +=
        s("M100.5 108.5 L96.5 106", c.dk, 2, ' opacity=".65"') +
        s("M159.5 108.5 L163.5 106", c.dk, 2, ' opacity=".65"');
    }
    return (
      t +
      s("M127 108 Q126 117 127.5 123", WHITE, 1.6, ' opacity=".26"') +
      s("M126.5 128.6 Q128.2 129.6 130 128.8", c.dk, 1.2, ' opacity=".4"') +
      // crescent shading along the right jaw (key light from screen-left)
      p(
        "M148 82 Q162 96 163 112 Q160 134 138 152 Q154 136 156 114 Q155 96 148 82 Z",
        SKIN_DK,
        ' opacity=".18"',
      ) +
      // permanent soft cheek warmth (happy/angry have their own stronger flush)
      (f !== "angry" && f !== "happy"
        ? o(102, 131, 6, "rgba(255,138,132,0.2)") +
          o(158, 131, 6, "rgba(255,138,132,0.2)")
        : "") +
      s("M113 149.5 Q130 157.5 147 149.5", SKIN_DK, 4, ' opacity=".3"')
    );
  }

  // ---- per-character identity ----------------------------------------------

  // 陈屿 — messy short hair, dark jacket over light shirt, binoculars on a
  // neck strap; slight stoop (3deg head lean + screen-right shoulder lower).
  // Thin glasses in every feel; angry pushes them up with one finger; sad
  // turns the head slightly away.
  var YU = {
    eye: "#3f7fa3",
    hi: "#c2e5f4",
    dk: "#48758f",
    hairDk: "#4f83a0",
    defs: hairGrad("yuHair", "#8ec2dc", "#548ba9"),
    stoop: "rotate(3 130 100)",
    sadTilt: "rotate(-2.5 130 150)",
    angryM:
      p("M119 139.5 H141 L137.5 149 H122.5 Z", "#8e4048") +
      s("M121 143.5 H139", WHITE, 1.7, ' opacity=".95"') +
      s("M126 140.8 V146.9 M134 140.8 V146.9", WHITE, 1.1, ' opacity=".75"'),
    ears: e(93, 114, 5, 8, SKIN) + e(167, 114, 5, 8, SKIN),
    back: p(
      "M84 140 Q62 84 82 64 Q92 50 108 56 Q120 44 134 54 Q150 44 162 58 Q186 60 182 96 Q190 116 176 142 L170 118 Q166 98 150 90 Q130 80 110 90 Q94 100 90 120 Z",
      "url(#yuHair)",
    ),
    fringe: p(
      "M92 100 Q90 56 130 52 Q170 56 168 100 L158 82 L151 99 L143 80 L134 97 L126 81 L117 98 L110 80 L102 98 L96 84 Z",
      "url(#yuHair)",
    ),
    sides: p(
      "M92 98 Q84 124 90 142 Q99 136 97 108 Z M168 98 Q176 124 170 142 Q161 136 163 108 Z",
      "url(#yuHair)",
    ),
    sheen: s("M106 64 Q114 82 108 98", "#c2e5f4", 3, ' opacity=".55"'),
    headFx: function (f) {
      var t =
        '<g fill="none" stroke="#3d4f6b" stroke-width="2">' +
        '<rect x="99" y="102.5" width="22" height="21" rx="7.5"/>' +
        '<rect x="139" y="102.5" width="22" height="21" rx="7.5"/>' +
        "</g>" +
        s(
          "M121 109.5 Q130 106.5 139 109.5 M99 109 L93.5 111 M161 109 L166.5 111",
          "#3d4f6b",
          2,
        ) +
        s(
          "M105 108 L112 115.5",
          "#e8f7fd",
          2,
          ' opacity="' +
            (f === "angry" ? ".85" : f === "surprised" ? ".5" : ".3") +
            '"',
        );
      if (f === "angry")
        t += s("M110 105.5 L116.5 112", "#e8f7fd", 1.6, ' opacity=".7"');
      return t;
    },
    front: function (f) {
      if (f !== "angry") return "";
      // raised jacket sleeve + one finger pushing the glasses bridge up
      return (
        p(
          "M146 198 Q151 158 139 127 L152.5 118 Q166 150 165 198 Z",
          "#1d2c49",
        ) +
        p(
          "M139 127 Q131.5 118 130 109.5 Q129.6 105.6 133 105.2 Q136 105.2 137.2 110 Q138.6 116.5 143 122 Z",
          SKIN,
        )
      );
    },
    body: (function () {
      var J = "#1d2c49",
        JD = "#152240",
        SH = "#e4edf5";
      return (
        p(
          "M44 340 L44 254 Q44 206 94 194 L116 184 Q130 199 144 184 L166 197 Q216 212 216 258 L216 340 Z",
          SH,
        ) +
        p("M44 340 L44 254 Q44 206 94 194 L117 184 L130 242 L134 340 Z", J) +
        p(
          "M216 340 L216 258 Q216 212 166 197 L143 184 L130 242 L126 340 Z",
          J,
        ) +
        p(
          "M172 200 Q210 214 210 260 L210 340 L186 340 L186 240 Q178 218 158 202 Z",
          JD,
        ) +
        p("M117 184 L130 242 L108 202 Z", JD) +
        p("M143 184 L130 242 L152 204 Z", JD) +
        s("M117 185 L130 240 M143 185 L130 240", "#2c3f63", 2) +
        s(
          "M98 200 Q90 248 92 308 M162 202 Q170 250 168 310",
          "#0e1a30",
          2,
          ' opacity=".6"',
        ) +
        s("M104 202 Q114 232 122 254 M156 204 Q146 234 138 254", "#0d1526", 5) +
        p("M110 254 H150 V276 Q130 288 110 276 Z", "#232b3d") +
        p("M126 254 H134 V282 Q130 285 126 282 Z", "#161d2c") +
        o(121, 268, 8, "#0f1420") +
        o(139, 268, 8, "#0f1420") +
        o(121, 268, 4.5, "#9bd4e8") +
        o(139, 268, 4.5, "#9bd4e8") +
        o(119, 266, 1.6, "#e8f7fd") +
        o(137, 266, 1.6, "#e8f7fd") +
        s("M48 248 Q48 210 92 198", "#9bd4e8", 2.5, ' opacity=".55"')
      );
    })(),
    bodyDetail:
      // jacket fold shadows + shoulder seams + neckline stitch
      s(
        "M98 204 Q92 240 94 272 M162 206 Q168 242 166 276",
        "#0e1a30",
        1.8,
        ' opacity=".5"',
      ) +
      s("M108 196 Q100 226 104 258", "#2c3f63", 1.6, ' opacity=".7"') +
      s("M152 198 Q160 228 156 260", "#2c3f63", 1.6, ' opacity=".7"') +
      s("M116 190 Q130 204 144 190", "#2c3f63", 1.8, ' opacity=".9"'),
  };

  // 林晚 — long draped hair with a star hairpin (story motif), oversized
  // cardigan over a pale blouse, hands half hidden in the sleeves.
  // Happy: the hairpin catches the light; sad: hugs her own sleeve;
  // surprised: a sleeve-covered hand flies to her mouth.
  var LIN = {
    eye: "#6b58a8",
    hi: "#cfc2f4",
    dk: "#6f5aa8",
    hairDk: "#7a63b8",
    defs: hairGrad("linHair", "#b3a1e6", "#7863b2"),
    angryM: s("M121 143.5 H138 Q141.5 144.5 141.5 147.5", MOUTH, 2.6),
    ears: e(93, 114, 5, 8, SKIN) + e(167, 114, 5, 8, SKIN),
    back: p(
      "M62 340 L62 262 Q46 172 58 118 Q66 54 130 50 Q194 54 202 118 Q214 172 198 262 L198 340 L166 340 Q180 262 174 182 Q168 106 130 102 Q92 106 86 182 Q80 262 94 340 Z",
      "url(#linHair)",
    ),
    fringe: p(
      "M92 100 Q90 56 130 52 Q170 56 168 100 L161 94 Q166 72 140 66 Q148 86 136 96 Q122 68 98 74 Q90 84 92 100 Z",
      "url(#linHair)",
    ),
    sides:
      p(
        "M92 96 Q68 140 72 214 Q74 272 88 318 Q99 296 93 220 Q89 148 104 106 Z M168 96 Q192 140 188 214 Q186 272 172 318 Q161 296 167 220 Q171 148 156 106 Z",
        "url(#linHair)",
      ) +
      p(
        "M163 112 Q180 162 178 222 Q176 268 168 302 Q172 242 170 182 Q168 142 159 114 Z",
        "#6f5aa8",
        ' opacity=".45"',
      ),
    sheen: s("M106 64 Q112 82 106 98", "#cfc2f4", 3, ' opacity=".5"'),
    headFx: function (f) {
      if (f !== "happy") return "";
      // star hairpin glints: sparkle crosses + pinpricks around (99,84)
      return (
        s("M86 72 L93 79 M93 72 L86 79", "#fffbe8", 1.8) +
        s("M108 66 L112 70 M112 66 L108 70", "#fffbe8", 1.5, ' opacity=".8"') +
        o(97, 66, 1.3, "#fffbe8") +
        o(84, 84, 1.1, "#fffbe8")
      );
    },
    bodyFx: function (f) {
      if (f !== "sad") return "";
      // hugs her own sleeve: forearm wrapped across the chest, fingers gripping
      return (
        p(
          "M88 216 Q104 203 128 207 Q148 211 153 223 Q151 233 133 234 Q104 235 88 227 Z",
          "#3a3059",
        ) +
        s("M91 217 Q110 207 136 211", "#4a3f6e", 2.2, ' opacity=".9"') +
        p(
          "M142 212 Q151 215 152.5 223 Q149 228 142.5 226 Q139 219 142 212 Z",
          SKIN,
        )
      );
    },
    front: function (f) {
      if (f !== "surprised") return "";
      // cardigan sleeve raised, hand clapped over the mouth
      return (
        p("M154 200 Q150 172 141 154 L120 152 Q114 172 116 200 Z", "#3a3059") +
        p(
          "M141 154 Q135 146 129 143.5 Q123 141.5 121 146 Q119.5 150 124 153.5 Q130 157.5 137 159 Z",
          SKIN,
        )
      );
    },
    body: (function () {
      var C = "#3a3059",
        CD = "#2d2547",
        SH = "#efe9f8",
        SD = "#d8cfee";
      return (
        p(
          "M38 340 L38 254 Q38 202 92 190 L116 181 Q130 196 144 181 L168 190 Q222 202 222 254 L222 340 Z",
          SH,
        ) +
        s("M118 224 Q123 258 119 292", SD, 3, ' opacity=".8"') +
        p("M38 340 L38 254 Q38 202 92 190 L116 181 L123 340 Z", C) +
        p("M222 340 L222 254 Q222 202 168 190 L144 181 L137 340 Z", C) +
        p(
          "M174 194 Q216 208 216 258 L216 340 L192 340 L192 238 Q184 214 162 198 Z",
          CD,
        ) +
        p("M108 183 Q130 203 152 183 L152 193 Q130 213 108 193 Z", CD) +
        s("M108 184 Q130 204 152 184", "#b7a8ec", 2.5, ' opacity=".7"') +
        p("M36 300 Q54 316 70 300 L70 340 L36 340 Z", CD) +
        p("M190 300 Q206 316 224 300 L224 340 L190 340 Z", CD) +
        s(
          "M36 301 Q54 317 70 301 M190 301 Q206 317 224 301",
          "#4a3f6e",
          2.5,
          ' opacity=".9"',
        ) +
        p("M44 306 Q54 315 64 306 L62 334 Q53 340 46 334 Z", SKIN) +
        p("M196 306 Q206 315 216 306 L214 334 Q205 340 198 334 Z", SKIN) +
        p(
          "M44 306 Q54 315 64 306 L63.5 313 Q53 320 44.5 313 Z",
          SKIN_DK,
          ' opacity=".55"',
        ) +
        p(
          "M196 306 Q206 315 216 306 L215.5 313 Q205 320 196.5 313 Z",
          SKIN_DK,
          ' opacity=".55"',
        ) +
        s("M38 252 Q38 208 90 194", "#b7a8ec", 2.5, ' opacity=".55"')
      );
    })(),
    bodyDetail:
      // cardigan drape folds + sleeve seams + blouse neckline
      s(
        "M50 258 Q58 296 54 336 M210 258 Q202 296 206 336",
        "#2d2547",
        2,
        ' opacity=".6"',
      ) +
      s("M104 194 Q100 240 103 284", "#4a3f6e", 2, ' opacity=".55"') +
      s("M156 194 Q160 240 157 284", "#4a3f6e", 2, ' opacity=".55"') +
      s("M112 190 Q130 206 148 190", "#b7a8ec", 1.6, ' opacity=".6"'),
  };

  // 栖 — the AI: sleek symmetric bob, high-collar fitted outfit, faint mint
  // circuit tracery along cheek/jaw/neck, unnaturally perfect posture
  // (perfectly symmetric shoulders, never tilts the head). The chest status
  // light recolors with the feel and the tracery brightens when angry.
  var QI = {
    eye: "#2e8f7c",
    hi: "#aef2e0",
    dk: "#3f9a86",
    hairDk: "#3f9a86",
    defs: hairGrad("qiHair", "#79e3c9", "#3f9a86"),
    noTilt: true,
    angryM: s("M121 144 H139", MOUTH, 2.7),
    back: p(
      "M76 224 Q62 58 130 52 Q198 58 184 224 Q183 234 172 234 L88 234 Q77 234 76 224 Z",
      "url(#qiHair)",
    ),
    fringe: p(
      "M92 98 Q92 54 130 52 Q168 54 168 98 L160 96 Q158 88 150 92 Q145 85 137 91 Q130 85 123 91 Q115 85 110 92 Q102 88 100 96 Z",
      "url(#qiHair)",
    ),
    sides:
      p(
        "M92 96 Q87 150 96 198 Q106 202 109 194 Q100 150 104 102 Z M168 96 Q173 150 164 198 Q154 202 151 194 Q160 150 156 102 Z",
        "url(#qiHair)",
      ) +
      p(
        "M95 110 Q92 152 99 190 Q94 152 97 112 Z M165 110 Q168 152 161 190 Q166 152 163 112 Z",
        "#3f9a86",
        ' opacity=".5"',
      ),
    sheen: s(
      "M104 64 Q108 76 104 88 M156 64 Q152 76 156 88",
      "#aef2e0",
      2.5,
      ' opacity=".5"',
    ),
    headFx: function (f) {
      if (f !== "angry") return "";
      // circuit tracery flares bright on angry
      return (
        s(
          "M144 132 L151 139 L151 148 L157 154 M138 158 L146 165 L146 176",
          "#d6fff2",
          2.2,
          ' opacity=".95"',
        ) +
        o(151, 139, 2.1, "#d6fff2") +
        o(157, 154, 1.9, "#d6fff2") +
        o(146, 176, 1.9, "#d6fff2")
      );
    },
    bodyFx: function (f) {
      // chest status light, recolored per feel (surprised = blink double-dot)
      var core =
        f === "happy"
          ? "#45e6ff"
          : f === "sad"
            ? "#5b7d80"
            : f === "angry"
              ? "#ffb054"
              : "#86efd8";
      var t = o(130, 228, 6, "#0b1f1d");
      if (f === "surprised") {
        return (
          t +
          o(126.6, 228, 2.1, "#b9f4ff") +
          o(133.6, 228, 2.1, "#b9f4ff", ' opacity=".45"')
        );
      }
      t += o(130, 228, f === "sad" ? 2.8 : 3.4, core);
      t +=
        '<circle cx="130" cy="228" r="6" fill="none" stroke="' +
        core +
        '" stroke-width="1.2" opacity="' +
        (f === "sad"
          ? ".22"
          : f === "happy"
            ? ".85"
            : f === "angry"
              ? ".95"
              : ".5") +
        '"/>';
      return t;
    },
    extra:
      p("M106 164 Q130 186 154 164 L154 182 Q130 204 106 182 Z", "#123f39") +
      s("M106 165 Q130 187 154 165", "#86efd8", 3, ' opacity=".95"') +
      s("M144 132 L151 139 L151 148 L157 154", "#86efd8", 4, ' opacity=".22"') +
      s(
        "M144 132 L151 139 L151 148 L157 154",
        "#86efd8",
        1.6,
        ' opacity=".9"',
      ) +
      o(151, 139, 1.9, "#86efd8") +
      o(151, 148, 1.9, "#86efd8") +
      o(157, 154, 1.7, "#86efd8") +
      s("M138 158 L146 165 L146 176", "#86efd8", 3.5, ' opacity=".22"') +
      s("M138 158 L146 165 L146 176", "#86efd8", 1.5, ' opacity=".85"') +
      o(146, 165, 1.7, "#86efd8") +
      o(146, 176, 1.7, "#86efd8"),
    body: (function () {
      var S = "#102b28",
        SD = "#0b1f1d",
        SM = "#1d4a42";
      return (
        p(
          "M52 340 L52 250 Q52 204 98 192 L118 182 Q130 197 142 182 L162 192 Q208 204 208 250 L208 340 Z",
          S,
        ) +
        p(
          "M158 196 Q202 210 202 254 L202 340 L178 340 L178 240 Q170 212 146 198 Z",
          SD,
        ) +
        s(
          "M96 198 Q86 256 90 336 M164 198 Q174 256 170 336 M130 212 V336",
          SM,
          2,
          ' opacity=".9"',
        ) +
        s(
          "M100 194 L112 186 M160 194 L148 186",
          "#86efd8",
          1.6,
          ' opacity=".4"',
        ) +
        s("M56 246 Q56 206 96 194", "#86efd8", 2.5, ' opacity=".5"')
      );
    })(),
    bodyDetail:
      // suit panel seams + side contour seams + shoulder glints
      s(
        "M104 200 Q100 260 102 336 M156 200 Q160 260 158 336",
        "#1d4a42",
        1.6,
        ' opacity=".8"',
      ) +
      s(
        "M64 250 Q60 290 62 336 M196 250 Q200 290 198 336",
        "#0b1f1d",
        2,
        ' opacity=".7"',
      ) +
      s("M98 196 L112 188 M162 196 L148 188", "#86efd8", 1.2, ' opacity=".5"'),
  };

  // 沈眠 — the missing friend: loose wavy hair, hospital-pale palette, faint
  // scarf; translucent in every feel (group opacity .88) with a blurred
  // duplicate silhouette behind (feGaussianBlur). The translucency deepens
  // to .78 on sad; a hand presses to her chest on surprised.
  var MIAN = {
    eye: "#7c86ac",
    hi: "#f3f6fd",
    dk: "#9aa5c2",
    hairDk: "#9aa5c2",
    opFor: function (f) {
      return f === "sad" ? ".78" : ".88";
    },
    angryM: s(
      "M122 143.5 Q126 141.5 130 143.5 Q134 145.5 138 143.5",
      MOUTH,
      2.4,
    ),
    ears: e(93, 114, 5, 8, SKIN) + e(167, 114, 5, 8, SKIN),
    defs:
      hairGrad("mianHair", "#dfe5f2", "#a9b3cc") +
      '<defs><filter id="mnBlur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3"/></filter></defs>',
    blurSil: p(
      "M130 48 Q174 52 170 116 Q208 156 214 250 L214 340 L46 340 L46 250 Q52 156 90 116 Q86 52 130 48 Z",
      "url(#mianHair)",
      ' filter="url(#mnBlur)" opacity=".5"',
    ),
    back: p(
      "M52 322 Q36 210 54 136 Q60 56 130 52 Q200 56 206 136 Q224 210 208 322 Q196 334 184 324 Q196 244 188 174 Q178 108 130 104 Q82 108 72 174 Q64 244 76 324 Q64 334 52 322 Z",
      "url(#mianHair)",
    ),
    fringe: p(
      "M92 100 Q90 56 130 52 Q170 56 168 100 L163 92 Q168 68 136 64 Q135 82 130 94 Q125 82 124 64 Q92 68 97 92 Z",
      "url(#mianHair)",
    ),
    sides:
      p(
        "M92 96 Q72 150 80 214 Q84 262 74 302 Q90 294 91 228 Q92 158 104 108 Z M168 96 Q188 150 180 214 Q176 262 190 306 Q172 298 169 228 Q168 158 156 108 Z",
        "url(#mianHair)",
      ) +
      p(
        "M96 120 Q82 168 84 224 Q86 260 80 288 Q90 258 89 208 Q90 156 100 122 Z M164 120 Q178 168 176 224 Q174 260 182 292 Q170 260 171 208 Q170 156 160 122 Z",
        "#9aa5c2",
        ' opacity=".4"',
      ),
    sheen: s("M106 62 Q113 80 106 96", "#f3f6fd", 3, ' opacity=".6"'),
    bodyFx: function (f) {
      if (f !== "surprised") return "";
      // a hand pressed to her chest, gown sleeve below the wrist
      return (
        p(
          "M115 252 Q117 234 126 224 L140 228 Q136 240 135 254 L117 254 Z",
          "#dfe4f0",
        ) +
        p(
          "M124 228 Q128 216 132 212 Q138 210 141 216 Q143 224 139 231 Q132 235 127 232 Q123 230 124 228 Z",
          SKIN,
        )
      );
    },
    body: (function () {
      var G = "#dfe4f0",
        GD = "#c3cade";
      return (
        p(
          "M44 340 L44 252 Q44 202 94 190 L116 181 Q130 196 144 181 L166 190 Q216 202 216 252 L216 340 Z",
          G,
        ) +
        p(
          "M158 196 Q208 210 208 256 L208 340 L182 340 L182 238 Q172 212 148 198 Z",
          GD,
        ) +
        s("M118 224 Q123 260 119 296", GD, 3, ' opacity=".8"') +
        p(
          "M102 170 Q130 194 158 170 Q168 180 156 194 Q130 216 104 194 Q92 180 102 170 Z",
          "#eef1f9",
        ) +
        p(
          "M144 192 Q158 232 150 272 Q144 278 136 272 Q144 234 134 196 Z",
          "#e2e9f6",
        ) +
        s("M104 176 Q130 198 156 176", "#c9d4e8", 2, ' opacity=".8"') +
        s("M48 246 Q48 206 92 194", "#f3f6fd", 2.5, ' opacity=".8"')
      );
    })(),
    bodyDetail:
      // gown drape folds + side shading + scarf fold hints
      s(
        "M82 240 Q86 280 82 320 M178 242 Q174 282 178 322",
        "#c3cade",
        2,
        ' opacity=".6"',
      ) +
      s(
        "M96 200 Q92 250 95 296 M164 202 Q168 250 165 296",
        "#c3cade",
        1.8,
        ' opacity=".5"',
      ) +
      s(
        "M112 178 Q122 186 130 187 M148 178 Q138 186 130 187",
        "#c9d4e8",
        1.5,
        ' opacity=".7"',
      ),
  };

  var CAST = { yu: YU, lin: LIN, qi: QI, mian: MIAN };

  // ---- portrait assembly ----------------------------------------------------

  function portrait(c, f) {
    var headT = c.stoop ? c.stoop : "";
    if (f === "happy" && !c.noTilt)
      headT += (headT ? " " : "") + "rotate(-4 130 160)";
    if (f === "sad" && c.sadTilt) headT += (headT ? " " : "") + c.sadTilt;
    if (f === "surprised") headT += (headT ? " " : "") + "translate(0 -1)";
    var head =
      "<g" +
      (headT ? ' transform="' + headT + '"' : "") +
      ">" +
      p(NECK, SKIN) +
      p(NSHAD, SKIN_DK, ' opacity=".75"') +
      p(FACE, SKIN, ' stroke="' + SKIN_DK + '" stroke-width="1.4"') +
      p(BANGSH, SKIN_DK, ' opacity=".4"') +
      (c.ears ? c.ears + EAR_DETAIL : "") +
      c.fringe +
      c.sides +
      (c.sheen || "") +
      hairDetail(c) +
      s("M97 70 Q90 94 94 118", c.hi, 3, ' opacity=".7"') +
      eyes(f, c) +
      brows(f, c.dk) +
      s(NOSE, SKIN_DK, 2, ' opacity=".9"') +
      faceDetail(f, c) +
      mouth(f, c) +
      accents(f) +
      (c.extra || "") +
      (c.headFx ? c.headFx(f) : "") +
      "</g>";
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 340" width="100%" height="100%" preserveAspectRatio="xMidYMax meet" fill="none" stroke-linecap="round">' +
      (c.defs || "") +
      '<g opacity="' +
      (c.opFor ? c.opFor(f) : c.op || "1") +
      '"' +
      (f === "sad" ? ' transform="translate(0 2)"' : "") +
      ">" +
      (c.blurSil || "") +
      c.back +
      c.body +
      (c.bodyDetail || "") +
      (c.bodyFx ? c.bodyFx(f) : "") +
      head +
      (c.front ? c.front(f) : "") +
      "</g></svg>"
    );
  }

  // ---- export: 4 characters x 5 feelings = 20 SVG strings -------------------
  window.CHAR_ART = {};
  Object.keys(CAST).forEach(function (id) {
    window.CHAR_ART[id] = {};
    FEELS.forEach(function (f) {
      window.CHAR_ART[id][f] = portrait(CAST[id], f);
    });
  });
})();
