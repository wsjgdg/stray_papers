FROM node:20-slim
RUN npm install -g bun
WORKDIR /app
COPY package.json ./
RUN bun install
COPY . .
# Realtime service runs TWO servers in one process:
#   - 3004: Socket.io (frontend connects via `io("/?XTransformPort=3004")`)
#   - 3005: plain HTTP /emit + /health (internal, called by Next.js routes)
EXPOSE 3004
EXPOSE 3005
CMD ["bun", "--hot", "index.ts"]
