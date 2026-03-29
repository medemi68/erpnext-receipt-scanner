FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src/ ./src/
RUN npx tsc

FROM node:20-slim
RUN apt-get update && \
    apt-get install -y --no-install-recommends graphicsmagick ghostscript && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist/
EXPOSE 3000
CMD ["node", "dist/index.js"]
