import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { fetchJson, fetchText } from '../server/http.js';
import { fetchOpenRouterModels } from '../server/sources/openrouter.js';
import { fetchArtificialAnalysis } from '../server/sources/artificialAnalysis.js';

const realFetch = globalThis.fetch;
let server: Server;
let origin: string;
let status = 200;
let body = '{}';

beforeAll(async () => {
  server = createServer((_req, res) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(() => vi.unstubAllGlobals());
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

function upstream(code: number, text: string) {
  status = code;
  body = text;
  vi.stubGlobal('fetch', (_url: unknown, init?: RequestInit) => realFetch(origin, init));
}

describe('source HTTP status handling', () => {
  it('keeps successful JSON responses', async () => {
    upstream(200, '{"data":[]}');
    await expect(fetchJson(origin)).resolves.toEqual({ data: [] });
  });

  it.each([401, 403, 429, 500])('rejects HTTP %i before accepting JSON', async (code) => {
    upstream(code, '{"data":[],"error":"private upstream detail"}');
    await expect(fetchJson(origin)).rejects.toThrow(`HTTP ${code}`);
  });

  it('rejects HTML errors with a status rather than a JSON parse error', async () => {
    upstream(502, '<html>private upstream detail</html>');
    await expect(fetchJson(origin)).rejects.toThrow(/^HTTP 502$/);
  });

  it('keeps raw status responses available to provider probes', async () => {
    upstream(401, '{"error":"unauthorized"}');
    await expect(fetchText(origin)).resolves.toMatchObject({ status: 401, text: body });
  });

  it('does not report an OpenRouter HTTP error as an empty model catalog', async () => {
    upstream(500, '{"error":"unavailable"}');
    await expect(fetchOpenRouterModels()).rejects.toThrow('HTTP 500');
  });

  it('does not report an AA HTTP error as empty leaderboards', async () => {
    upstream(503, '<html>unavailable</html>');
    await expect(fetchArtificialAnalysis()).rejects.toThrow('HTTP 503');
  });

  it('keeps successful AA parsing unchanged', async () => {
    upstream(
      200,
      '<script type="application/ld+json">{"@type":"Dataset","name":"Artificial Analysis Intelligence Index","data":[{"label":"example-model","intelligenceIndex":42}]}</script>',
    );
    const result = await fetchArtificialAnalysis();
    expect(result.leaderboards[0]).toMatchObject({
      id: 'intelligence',
      entries: [{ label: 'example-model', value: 42 }],
    });
  });
});
