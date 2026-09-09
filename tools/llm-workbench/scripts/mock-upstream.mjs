// 本地 mock 上游：接收 /v1/chat/completions，回 SSE，含 usage（含 cache）
import http from 'node:http';

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.url.startsWith('/v1/chat/completions')) {
      // 校验 auth header是否注入
      const auth =
        req.headers['authorization'] || req.headers['x-api-key'] || req.headers['x-goog-api-key'];
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      const chunks = ['你好', '，', '我是', '自定义', '网关'];
      let i = 0;
      const timer = setInterval(() => {
        if (i < chunks.length) {
          res.write(
            `data: ${JSON.stringify({ choices: [{ delta: { content: chunks[i] } }] })}\n\n`,
          );
          i++;
        } else {
          clearInterval(timer);
          res.write(
            `data: ${JSON.stringify({
              choices: [{ delta: {} }],
              usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
                prompt_tokens_details: { cached_tokens: 8 },
              },
            })}\n\n`,
          );
          res.write('data: [DONE]\n\n');
          res.end();
        }
      }, 20);
      return;
    }
    res.writeHead(404);
    res.end('not found');
  });
});

server.listen(9123, '127.0.0.1', () => {
  console.log('mock-upstream listening on 9123');
});
