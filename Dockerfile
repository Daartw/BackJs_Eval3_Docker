# Servicio de usuarios (Node.js + Express)
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Dependencias primero (aprovecha la caché de capas). npm ci instala exactamente
# lo que indica package-lock.json, sin dependencias de desarrollo.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./
COPY src ./src

# El proceso no corre como root
USER node

EXPOSE 8081

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-8081}/health" || exit 1

CMD ["node", "server.js"]
