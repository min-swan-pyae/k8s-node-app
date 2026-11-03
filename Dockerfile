# ==========================================
# Stage 1: Build dependencies
# ==========================================
FROM node:22-alpine AS build

WORKDIR /app

# Copy dependency definitions first
COPY package*.json ./

# Install all dependencies for the build stage
RUN npm ci

# Copy application source
COPY . .


# ==========================================
# Stage 2: Production image
# ==========================================
FROM node:22-alpine AS production

ENV NODE_ENV=production

WORKDIR /app

# Install only production dependencies
COPY package*.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force

# Copy application files from build stage
COPY --from=build --chown=node:node /app/app.js ./app.js
COPY --from=build --chown=node:node /app/app.test.js ./app.test.js
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/database ./database

# Use a non-root user
USER node

EXPOSE 3000

CMD ["node", "app.js"]
