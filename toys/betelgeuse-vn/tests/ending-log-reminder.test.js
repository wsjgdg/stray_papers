const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { after, before, test } = require("node:test");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const HARNESS = `<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <script src="/scenario.js"></script>
  <script src="/engine.js"></script>
  <script>VN.start(window.SCENARIO);</script>
</body>
</html>`;

let server;
let browser;
let baseUrl;

before(async () => {
  server = http.createServer((req, res) => {
    const pathname = new URL(req.url, "http://127.0.0.1").pathname;
    if (pathname === "/__test_harness__") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(HARNESS);
      return;
    }

    const filePath = path.resolve(ROOT, `.${decodeURIComponent(pathname)}`);
    if (!filePath.startsWith(`${ROOT}${path.sep}`)) {
      res.writeHead(403);
      res.end();
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      const contentType = filePath.endsWith(".css")
        ? "text/css; charset=utf-8"
        : "text/javascript; charset=utf-8";
      res.writeHead(200, { "content-type": contentType });
      res.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/__test_harness__`;
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function openGame(seed) {
  const context = await browser.newContext();
  await context.addInitScript((values) => {
    Object.entries(values).forEach(([key, value]) => {
      localStorage.setItem(key, value);
    });
  }, seed);
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.locator("#vn-start").waitFor();
  return { context, page };
}

async function visible(page, selector) {
  const element = page.locator(selector);
  return (await element.count()) > 0 && element.isVisible();
}

function seedFor({
  endings = ["ending_good"],
  seenNodes = ["obsv_daily"],
} = {}) {
  return {
    "vn-endings": JSON.stringify(endings),
    "vn-seen-nodes": JSON.stringify(seenNodes),
    "vn-save-1": JSON.stringify({ marker: "preserve-slot" }),
    "vn-save-autosave": JSON.stringify({ marker: "preserve-autosave" }),
  };
}

test("shows the log reminder only after good ending and before true ending or log_last", async (t) => {
  const cases = [
    {
      name: "good ending, log not seen",
      endings: ["ending_good"],
      seen: ["obsv_daily"],
      shown: true,
    },
    {
      name: "true ending collected",
      endings: ["ending_good", "ending_true"],
      seen: ["obsv_daily"],
      shown: false,
    },
    {
      name: "log_last already seen",
      endings: ["ending_good"],
      seen: ["obsv_daily", "log_last"],
      shown: false,
    },
    {
      name: "obsv_daily not unlocked",
      endings: ["ending_good"],
      seen: [],
      shown: false,
    },
    {
      name: "good ending not collected",
      endings: [],
      seen: ["obsv_daily"],
      shown: false,
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const { context, page } = await openGame(
        seedFor({ endings: scenario.endings, seenNodes: scenario.seen }),
      );
      assert.equal(await visible(page, "#vn-log-reminder"), scenario.shown);
      await context.close();
    });
  }
});

test("opens the tree with obsv_daily highlighted without changing save data", async () => {
  const { context, page } = await openGame(seedFor());
  const saveSnapshot = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith("vn-save-"))
      .sort()
      .map((key) => [key, localStorage.getItem(key)]),
  );

  assert.equal(await visible(page, "#vn-log-reminder"), true);
  await page.locator("#vn-log-reminder").click();
  assert.equal(await visible(page, ".vn-gallery"), true);
  assert.equal(
    await page
      .locator('.vn-gtab[data-tab="tree"]')
      .getAttribute("aria-selected"),
    "true",
  );
  const target = page.locator(
    '.vn-tree-node[data-node="obsv_daily"].vn-tree-log-reminder',
  );
  assert.equal(await target.count(), 1);
  assert.equal(await target.isEnabled(), true);
  assert.equal(
    await target.evaluate((node) => {
      const nodeRect = node.getBoundingClientRect();
      const wrapRect = node.closest(".vn-tree-wrap").getBoundingClientRect();
      return (
        nodeRect.left >= wrapRect.left &&
        nodeRect.right <= wrapRect.right &&
        nodeRect.top >= wrapRect.top &&
        nodeRect.bottom <= wrapRect.bottom
      );
    }),
    true,
    "the highlighted route node should be brought into view",
  );
  assert.deepEqual(
    await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith("vn-save-"))
        .sort()
        .map((key) => [key, localStorage.getItem(key)]),
    ),
    saveSnapshot,
  );

  await context.close();
});
