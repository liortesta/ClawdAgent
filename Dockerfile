# ---------- Stage: deps ----------
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

# ---------- Stage: dev ----------
FROM deps AS dev

COPY . .

EXPOSE 3000 5173

CMD ["pnpm", "dev"]

# ---------- Stage: build ----------
FROM deps AS build

COPY . .

RUN pnpm build

# ---------- Stage: production ----------
FROM node:20-alpine AS production

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

EXPOSE 3000

USER node

CMD ["node", "dist/index.js"]
