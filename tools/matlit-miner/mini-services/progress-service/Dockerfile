FROM node:20-slim
RUN npm install -g bun
WORKDIR /app
COPY package.json ./
RUN bun install
COPY . .
EXPOSE 3003
CMD ["bun", "--hot", "index.ts"]
