FROM node:22.22.2-bookworm-slim

WORKDIR /app

# Install Bun (package manager) and runtime deps needed by native modules.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip libatomic1 \
  && rm -rf /var/lib/apt/lists/*

ENV BUN_INSTALL=/root/.bun
ENV PATH="$BUN_INSTALL/bin:$PATH"
RUN curl -fsSL https://bun.sh/install | bash

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "./build/server/index.js"]
