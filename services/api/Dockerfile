FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY sql ./sql
EXPOSE 8787
# migrate + seed on boot; disk catalog import is a separate one-shot (deploy script)
CMD ["sh", "-c", "node dist/migrate.js && node dist/seed.js && node dist/index.js"]
