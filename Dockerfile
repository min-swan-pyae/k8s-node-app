
FROM node:22-alpine

WORKDIR /app

COPY --chown=node:node package*.json ./

RUN npm ci --omit=dev

COPY --chown=node:node app.js ./
COPY --chown=node:node database/ ./database/
COPY --chown=node:node scripts/ ./scripts/

ENV NODE_ENV=production

USER node

EXPOSE 3000

CMD ["node", "app.js"]

