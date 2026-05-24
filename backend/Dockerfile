FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm install --omit=dev --registry=https://registry.npmjs.org/

FROM node:20-alpine

RUN apk add --no-cache curl tini

WORKDIR /app

RUN addgroup -g 1001 appgroup && adduser -u 1001 -G appgroup -s /bin/sh -D appuser

COPY --from=builder /app/node_modules ./node_modules
COPY src/ ./src/

RUN mkdir -p logs uploads && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]

CMD ["node", "src/app.js"]
