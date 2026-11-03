// art.js — inline SVG waist-up standing portraits (classic visual-novel
// sprite style) for the cast. Defines window.CHAR_ART =
// { <charId>: { normal, happy, sad, surprised, angry } } where every value is
// a standalone <svg> string (viewBox "0 0 260 340", width/height 100%,
// preserveAspectRatio xMidYMax so the waist sits on the stage floor) rendered
// inside the .vn-sprite slot via innerHTML.
//
// Each character is ONE parameterized template: shared head geometry +
// per-character silhouette (hair / clothing / signature prop) and palette.
// The five feelings vary eyes, brows, mouth and a posture accent:
//   happy     closed arc eyes + blush + soft head tilt (head group rotate)
//   sad       lowered lids + low pupils + downturned mouth + whole figure
//             translated down 2px (subtle shoulder drop)
//   surprised wide eyes + small pupils + raised brows + small open mouth
//             + 1px head lift
//   angry     slanted brows + narrowed lids + gritted mouth + warm rim tint
//             over the face group
// Shading is 2-tone cel (base + one shadow tone per surface, shirt folds as
// short strokes) with a thin rim-light stroke on the lit side; no gradients,
// no raster, no text elements. mian keeps a translucent double-exposure feel
// in every feel (group opacity .88 + feGaussianBlur duplicate silhouette).
// Per-character identity:
//   yu 陈屿  messy short hair, dark jacket over shirt, binoculars on a neck
//            strap, slight stoop (head lean + dropped screen-right shoulder)
//   lin 林晚 long draped hair, star hairpin (story motif), oversized
//            cardigan, hands half in sleeves
//   qi 栖    sleek symmetric bob, high-collar fitted outfit, faint mint
//            circuit tracery along cheek/jaw/neck, perfect posture
//   mian 沈眠 loose wavy hair, hospital-pale palette, faint scarf,
//            translucent + blurred silhouette duplicate
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

  var FACE = "M94 98 Q94 60 130 58 Q166 60 166 98 Q166 134 130 156 Q94 134 94 98 Z";
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
    return '<path d="' + d + '" stroke="' + c + '" stroke-width="' + w + '"' + (x || "") + "/>";
  }
  function o(cx, cy, r, f, x) {
    return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + f + '"' + (x || "") + "/>";
  }
  function e(cx, cy, rx, ry, f) {
    return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" fill="' + f + '"/>';
  }

  // ---- parameterized features (shared across the cast) ----------------------

  function eyes(f, eye, dk) {
    function one(cx, right) {
      if (f === "happy") {
        return s("M" + (cx - 9) + " 115 Q" + cx + " 105 " + (cx + 9) + " 115", eye, 3);
      }
      if (f === "sad") {
        return (
          e(cx, 114, 9, 8, WHITE) +
          o(cx, 116, 4.4, eye) +
          o(cx, 116, 2, PUPIL) +
          '<rect x="' + (cx - 10) + '" y="101" width="20" height="8" fill="' + SKIN + '"/>' +
          s("M" + (cx - 9) + " 110 Q" + cx + " 106 " + (cx + 9) + " 110", dk, 2)
        );
      }
      if (f === "surprised") {
        return (
          e(cx, 112, 10, 12, WHITE) +
          o(cx, 113, 5, eye) +
          o(cx, 113, 2.2, PUPIL) +
          o(cx - 2.8, 108.6, 1.9, WHITE)
        );
      }
      var cy = f === "angry" ? 114 : 113;
      var ry = f === "angry" ? 8 : 10.5;
      var t =
        e(cx, cy, 9.5, ry, WHITE) +
        o(cx, cy, 4.8, eye) +
        o(cx, cy, 2.1, PUPIL) +
        o(cx - 2.6, cy - 3.5, 1.7, WHITE) +
        s("M" + (cx - 9) + " " + (cy - 4) + " Q" + cx + " " + (cy - 11) + " " + (cx + 9) + " " + (cy - 4), dk, 2.2);
      if (f === "angry") {
        t += s(
          right
            ? "M" + (cx + 9) + " " + (cy - 6) + " L" + (cx - 9) + " " + (cy - 2)
            : "M" + (cx - 9) + " " + (cy - 6) + " L" + (cx + 9) + " " + (cy - 2),
          dk,
          2.4
        );
      }
      return t;
    }
    return one(110, false) + one(150, true);
  }

  function brows(f, dk) {
    var d;
    if (f === "sad") d = "M100 101 Q110 99 120 93 M140 93 Q150 99 160 101";
    else if (f === "surprised") d = "M99 92 Q110 86 121 91 M139 91 Q150 86 161 92";
    else if (f === "angry") d = "M100 91 Q110 93 120 100 M140 100 Q150 93 160 91";
    else if (f === "happy") d = "M100 94 Q110 89 120 93 M140 93 Q150 89 160 94";
    else d = "M100 97 Q110 92 120 96 M140 96 Q150 92 160 97";
    return s(d, dk, 2.6);
  }

  function mouth(f) {
    if (f === "happy") return p("M120 138 Q130 154 140 138 Q130 145 120 138 Z", MOUTH);
    if (f === "sad") return s("M123 146 Q130 140 137 146", MOUTH, 2.6);
    if (f === "surprised") return e(130, 144, 5.5, 7, MOUTH);
    if (f === "angry") {
      return p("M120 139 H140 L136 149 H124 Z", "#8e4048") + s("M122 143.5 H138", WHITE, 1.6, ' opacity=".9"');
    }
    return s("M122 141 Q130 147 138 141", MOUTH, 2.6);
  }

  function accents(f) {
    if (f === "happy") return o(98, 130, 7.5, BLUSH) + o(162, 130, 7.5, BLUSH);
    if (f === "angry") return s("M165 94 Q173 122 164 150", "#ff6a4d", 4, ' opacity=".5"');
    return "";
  }

  // ---- per-character identity ----------------------------------------------

  // 陈屿 — messy short hair, dark jacket over light shirt, binoculars on a
  // neck strap; slight stoop (3deg head lean + screen-right shoulder lower).
  var YU = {
    eye: "#3f7fa3",
    hi: "#c2e5f4",
    dk: "#48758f",
    stoop: "rotate(3 130 100)",
    ears: e(93, 114, 5, 8, SKIN) + e(167, 114, 5, 8, SKIN),
    back: p(
      "M84 140 Q62 84 82 64 Q92 50 108 56 Q120 44 134 54 Q150 44 162 58 Q186 60 182 96 Q190 116 176 142 L170 118 Q166 98 150 90 Q130 80 110 90 Q94 100 90 120 Z",
      "#6fa9c6"
    ),
    fringe: p(
      "M92 100 Q90 56 130 52 Q170 56 168 100 L158 82 L151 99 L143 80 L134 97 L126 81 L117 98 L110 80 L102 98 L96 84 Z",
      "#6fa9c6"
    ),
    sides:
      p("M92 98 Q84 124 90 142 Q99 136 97 108 Z", "#6fa9c6") +
      p("M168 98 Q176 124 170 142 Q161 136 163 108 Z", "#6fa9c6"),
    sheen: s("M106 64 Q114 82 108 98", "#c2e5f4", 3, ' opacity=".55"'),
    body: (function () {
      var J = "#1d2c49", JD = "#152240", SH = "#e4edf5", SD = "#c9d8e4";
      return (
        p("M44 340 L44 254 Q44 206 94 194 L116 184 Q130 199 144 184 L166 197 Q216 212 216 258 L216 340 Z", SH) +
        s("M112 228 Q118 256 114 290", SD, 3, ' opacity=".8"') +
        s("M132 234 Q136 262 132 294", SD, 2.5, ' opacity=".7"') +
        p("M44 340 L44 254 Q44 206 94 194 L117 184 L130 242 L134 340 Z", J) +
        p("M216 340 L216 258 Q216 212 166 197 L143 184 L130 242 L126 340 Z", J) +
        p("M172 200 Q210 214 210 260 L210 340 L186 340 L186 240 Q178 218 158 202 Z", JD) +
        p("M117 184 L130 242 L108 202 Z", JD) +
        p("M143 184 L130 242 L152 204 Z", JD) +
        s("M117 185 L130 240", "#2c3f63", 2) +
        s("M143 185 L130 240", "#2c3f63", 2) +
        s("M98 200 Q90 248 92 308", "#0e1a30", 2, ' opacity=".6"') +
        s("M162 202 Q170 250 168 310", "#0e1a30", 2, ' opacity=".6"') +
        s("M104 202 Q114 232 122 254", "#0d1526", 5) +
        s("M156 204 Q146 234 138 254", "#0d1526", 5) +
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
  };

  // 林晚 — long draped hair with a star hairpin (story motif), oversized
  // cardigan over a pale blouse, hands half hidden in the sleeves.
  var LIN = {
    eye: "#6b58a8",
    hi: "#cfc2f4",
    dk: "#6f5aa8",
    ears: e(93, 114, 5, 8, SKIN) + e(167, 114, 5, 8, SKIN),
    back: p(
      "M62 340 L62 262 Q46 172 58 118 Q66 54 130 50 Q194 54 202 118 Q214 172 198 262 L198 340 L166 340 Q180 262 174 182 Q168 106 130 102 Q92 106 86 182 Q80 262 94 340 Z",
      "#9a86d8"
    ),
    fringe: p(
      "M92 100 Q90 56 130 52 Q170 56 168 100 L161 94 Q166 72 140 66 Q148 86 136 96 Q122 68 98 74 Q90 84 92 100 Z",
      "#9a86d8"
    ),
    sides:
      p("M92 96 Q68 140 72 214 Q74 272 88 318 Q99 296 93 220 Q89 148 104 106 Z", "#9a86d8") +
      p("M168 96 Q192 140 188 214 Q186 272 172 318 Q161 296 167 220 Q171 148 156 106 Z", "#9a86d8") +
      p("M163 112 Q180 162 178 222 Q176 268 168 302 Q172 242 170 182 Q168 142 159 114 Z", "#6f5aa8", ' opacity=".45"'),
    sheen: s("M106 64 Q112 82 106 98", "#cfc2f4", 3, ' opacity=".5"'),
    extra:
      '<path d="M99 71 L102.5 80 L111.5 84 L102.5 88 L99 97 L95.5 88 L86.5 84 L95.5 80 Z" fill="#f6d98d"/>' +
      o(99, 84, 2.2, "#fff4cf"),
    body: (function () {
      var C = "#3a3059", CD = "#2d2547", SH = "#efe9f8", SD = "#d8cfee";
      return (
        p("M38 340 L38 254 Q38 202 92 190 L116 181 Q130 196 144 181 L168 190 Q222 202 222 254 L222 340 Z", SH) +
        s("M118 224 Q123 258 119 292", SD, 3, ' opacity=".8"') +
        p("M38 340 L38 254 Q38 202 92 190 L116 181 L123 340 Z", C) +
        p("M222 340 L222 254 Q222 202 168 190 L144 181 L137 340 Z", C) +
        p("M174 194 Q216 208 216 258 L216 340 L192 340 L192 238 Q184 214 162 198 Z", CD) +
        p("M108 183 Q130 203 152 183 L152 193 Q130 213 108 193 Z", CD) +
        s("M108 184 Q130 204 152 184", "#b7a8ec", 2.5, ' opacity=".7"') +
        p("M36 300 Q54 316 70 300 L70 340 L36 340 Z", CD) +
        p("M190 300 Q206 316 224 300 L224 340 L190 340 Z", CD) +
        s("M36 301 Q54 317 70 301", "#4a3f6e", 2.5, ' opacity=".9"') +
        s("M190 301 Q206 317 224 301", "#4a3f6e", 2.5, ' opacity=".9"') +
        p("M44 306 Q54 315 64 306 L62 334 Q53 340 46 334 Z", SKIN) +
        p("M196 306 Q206 315 216 306 L214 334 Q205 340 198 334 Z", SKIN) +
        p("M44 306 Q54 315 64 306 L63.5 313 Q53 320 44.5 313 Z", SKIN_DK, ' opacity=".55"') +
        p("M196 306 Q206 315 216 306 L215.5 313 Q205 320 196.5 313 Z", SKIN_DK, ' opacity=".55"') +
        s("M38 252 Q38 208 90 194", "#b7a8ec", 2.5, ' opacity=".55"')
      );
    })(),
  };

  // 栖 — the AI: sleek symmetric bob, high-collar fitted outfit, faint mint
  // circuit tracery along cheek/jaw/neck, unnaturally perfect posture
  // (perfectly symmetric shoulders, never tilts the head).
  var QI = {
    eye: "#2e8f7c",
    hi: "#aef2e0",
    dk: "#3f9a86",
    noTilt: true,
    back: p(
      "M76 224 Q62 58 130 52 Q198 58 184 224 Q183 234 172 234 L88 234 Q77 234 76 224 Z",
      "#63d2b8"
    ),
    fringe: p(
      "M92 98 Q92 54 130 52 Q168 54 168 98 L160 96 Q158 88 150 92 Q145 85 137 91 Q130 85 123 91 Q115 85 110 92 Q102 88 100 96 Z",
      "#63d2b8"
    ),
    sides:
      p("M92 96 Q87 150 96 198 Q106 202 109 194 Q100 150 104 102 Z", "#63d2b8") +
      p("M168 96 Q173 150 164 198 Q154 202 151 194 Q160 150 156 102 Z", "#63d2b8") +
      p("M95 110 Q92 152 99 190 Q94 152 97 112 Z", "#3f9a86", ' opacity=".5"') +
      p("M165 110 Q168 152 161 190 Q166 152 163 112 Z", "#3f9a86", ' opacity=".5"'),
    sheen:
      s("M104 64 Q108 76 104 88", "#aef2e0", 2.5, ' opacity=".5"') +
      s("M156 64 Q152 76 156 88", "#aef2e0", 2.5, ' opacity=".5"'),
    extra:
      p("M106 164 Q130 186 154 164 L154 182 Q130 204 106 182 Z", "#123f39") +
      s("M106 165 Q130 187 154 165", "#86efd8", 3, ' opacity=".95"') +
      s("M144 132 L151 139 L151 148 L157 154", "#86efd8", 4, ' opacity=".22"') +
      s("M144 132 L151 139 L151 148 L157 154", "#86efd8", 1.6, ' opacity=".9"') +
      o(151, 139, 1.9, "#86efd8") +
      o(151, 148, 1.9, "#86efd8") +
      o(157, 154, 1.7, "#86efd8") +
      s("M138 158 L146 165 L146 176", "#86efd8", 3.5, ' opacity=".22"') +
      s("M138 158 L146 165 L146 176", "#86efd8", 1.5, ' opacity=".85"') +
      o(146, 165, 1.7, "#86efd8") +
      o(146, 176, 1.7, "#86efd8"),
    body: (function () {
      var S = "#102b28", SD = "#0b1f1d", SM = "#1d4a42";
      return (
        p("M52 340 L52 250 Q52 204 98 192 L118 182 Q130 197 142 182 L162 192 Q208 204 208 250 L208 340 Z", S) +
        p("M158 196 Q202 210 202 254 L202 340 L178 340 L178 240 Q170 212 146 198 Z", SD) +
        s("M96 198 Q86 256 90 336", SM, 2, ' opacity=".9"') +
        s("M164 198 Q174 256 170 336", SM, 2, ' opacity=".9"') +
        s("M130 212 V336", SM, 2, ' opacity=".9"') +
        o(130, 228, 6, "#0b1f1d") +
        o(130, 228, 3.4, "#86efd8") +
        '<circle cx="130" cy="228" r="6" fill="none" stroke="#86efd8" stroke-width="1.2" opacity=".5"/>' +
        s("M100 194 L112 186 M160 194 L148 186", "#86efd8", 1.6, ' opacity=".4"') +
        s("M56 246 Q56 206 96 194", "#86efd8", 2.5, ' opacity=".5"')
      );
    })(),
  };

  // 沈眠 — the missing friend: loose wavy hair, hospital-pale palette, faint
  // scarf; translucent in every feel (group opacity .88) with a blurred
  // duplicate silhouette behind (feGaussianBlur).
  var MIAN = {
    eye: "#7c86ac",
    hi: "#f3f6fd",
    dk: "#9aa5c2",
    op: ".88",
    ears: e(93, 114, 5, 8, SKIN) + e(167, 114, 5, 8, SKIN),
    defs:
      '<defs><filter id="mnBlur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3"/></filter></defs>',
    blurSil: p(
      "M130 48 Q174 52 170 116 Q208 156 214 250 L214 340 L46 340 L46 250 Q52 156 90 116 Q86 52 130 48 Z",
      "#ccd3e6",
      ' filter="url(#mnBlur)" opacity=".5"'
    ),
    back: p(
      "M52 322 Q36 210 54 136 Q60 56 130 52 Q200 56 206 136 Q224 210 208 322 Q196 334 184 324 Q196 244 188 174 Q178 108 130 104 Q82 108 72 174 Q64 244 76 324 Q64 334 52 322 Z",
      "#ccd3e6"
    ),
    fringe: p(
      "M92 100 Q90 56 130 52 Q170 56 168 100 L163 92 Q168 68 136 64 Q135 82 130 94 Q125 82 124 64 Q92 68 97 92 Z",
      "#ccd3e6"
    ),
    sides:
      p("M92 96 Q72 150 80 214 Q84 262 74 302 Q90 294 91 228 Q92 158 104 108 Z", "#ccd3e6") +
      p("M168 96 Q188 150 180 214 Q176 262 190 306 Q172 298 169 228 Q168 158 156 108 Z", "#ccd3e6") +
      p("M96 120 Q82 168 84 224 Q86 260 80 288 Q90 258 89 208 Q90 156 100 122 Z", "#9aa5c2", ' opacity=".4"') +
      p("M164 120 Q178 168 176 224 Q174 260 182 292 Q170 260 171 208 Q170 156 160 122 Z", "#9aa5c2", ' opacity=".4"'),
    sheen: s("M106 62 Q113 80 106 96", "#f3f6fd", 3, ' opacity=".6"'),
    body: (function () {
      var G = "#dfe4f0", GD = "#c3cade";
      return (
        p("M44 340 L44 252 Q44 202 94 190 L116 181 Q130 196 144 181 L166 190 Q216 202 216 252 L216 340 Z", G) +
        p("M158 196 Q208 210 208 256 L208 340 L182 340 L182 238 Q172 212 148 198 Z", GD) +
        s("M118 224 Q123 260 119 296", GD, 3, ' opacity=".8"') +
        p("M102 170 Q130 194 158 170 Q168 180 156 194 Q130 216 104 194 Q92 180 102 170 Z", "#eef1f9") +
        p("M144 192 Q158 232 150 272 Q144 278 136 272 Q144 234 134 196 Z", "#e2e9f6") +
        s("M104 176 Q130 198 156 176", "#c9d4e8", 2, ' opacity=".8"') +
        s("M48 246 Q48 206 92 194", "#f3f6fd", 2.5, ' opacity=".8"')
      );
    })(),
  };

  var CAST = { yu: YU, lin: LIN, qi: QI, mian: MIAN };

  // ---- portrait assembly ----------------------------------------------------

  function portrait(c, f) {
    var headT = c.stoop ? c.stoop : "";
    if (f === "happy" && !c.noTilt) headT += (headT ? " " : "") + "rotate(-4 130 160)";
    if (f === "surprised") headT += (headT ? " " : "") + "translate(0 -1)";
    var head =
      "<g" + (headT ? ' transform="' + headT + '"' : "") + ">" +
      p(NECK, SKIN) +
      p(NSHAD, SKIN_DK, ' opacity=".75"') +
      p(FACE, SKIN) +
      p(BANGSH, SKIN_DK, ' opacity=".4"') +
      (c.ears || "") +
      c.fringe +
      c.sides +
      (c.sheen || "") +
      s("M97 70 Q90 94 94 118", c.hi, 3, ' opacity=".7"') +
      eyes(f, c.eye, c.dk) +
      brows(f, c.dk) +
      s(NOSE, SKIN_DK, 2, ' opacity=".9"') +
      mouth(f) +
      accents(f) +
      (c.extra || "") +
      "</g>";
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 340" width="100%" height="100%" preserveAspectRatio="xMidYMax meet" fill="none" stroke-linecap="round">' +
      (c.defs || "") +
      '<g opacity="' + (c.op || "1") + '"' + (f === "sad" ? ' transform="translate(0 2)"' : "") + ">" +
      (c.blurSil || "") +
      c.back +
      c.body +
      head +
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
