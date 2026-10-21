FROM node:24-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY --chown=node:node . .
RUN mkdir -p /app/node_modules/.vite && chown node:node /app /app/node_modules/.vite

USER node
EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
