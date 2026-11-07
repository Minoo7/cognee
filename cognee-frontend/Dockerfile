FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci
COPY next.config.ts tsconfig.json postcss.config.mjs jest.setup.ts ./
COPY src ./src
COPY types ./types
COPY public ./public
ENV NEXT_PUBLIC_IS_CLOUD_ENVIRONMENT=false NEXT_TELEMETRY_DISABLED=1
RUN npm run build
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
WORKDIR /app
RUN apk add --no-cache libc6-compat && addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs
COPY --from=builder --chown=1001:1001 /app /app
COPY server.cjs /app/server.cjs
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 TLS_PORT=3443
USER nextjs
CMD ["node", "server.cjs"]
