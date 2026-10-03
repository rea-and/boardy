FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY server ./server
COPY public ./public
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV NODE_ENV=production PORT=4173 BOARDY_DATA_DIR=/app/data
EXPOSE 4173
CMD ["node", "server/index.js"]
