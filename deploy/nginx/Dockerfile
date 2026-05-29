# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install --registry=https://registry.npmjs.org/

COPY frontend/ ./
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

RUN apk add --no-cache curl

COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html
COPY --from=frontend-build /app/frontend/node_modules/@excalidraw/excalidraw/dist/excalidraw-assets /usr/share/nginx/html/node_modules/@excalidraw/excalidraw/dist/excalidraw-assets
COPY deploy/nginx/nginx.conf /etc/nginx/nginx.conf

EXPOSE 80 443

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD curl -f http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
