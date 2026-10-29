FROM node:22.14.0-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY server.mjs richtext.mjs ./
RUN mkdir plugins data && chown -R node:node /app
USER node
EXPOSE 8787
CMD ["node", "server.mjs"]
