# ==========================================
# Stage 1: Build stage
# ==========================================
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .


# ==========================================
# Stage 2: Production stage
# ==========================================
FROM node:22-alpine AS production

ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force

COPY --from=build --chown=node:node /app/app.js ./app.js
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/database ./database

USER node

EXPOSE 3000

CMD ["node", "app.js"]
