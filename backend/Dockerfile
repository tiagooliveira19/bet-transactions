FROM oven/bun:1.2-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production=false

COPY . .

EXPOSE 3000

CMD ["bun", "run", "src/main.ts"]
