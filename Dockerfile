# ---------- Stage: deps ----------
FROM node:20-alpine AS deps

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

# ---------- Stage: web-build ----------
FROM node:20-alpine AS web-build

WORKDIR /app/web

COPY web/package.json web/package-lock.json* ./

RUN npm install

COPY web/ .

RUN npm run build

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

# Copy backend build
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

# Copy web dashboard build
COPY --from=web-build /app/web/dist ./web/dist

# Copy data files (skills, configs)
COPY data/ ./data/
COPY config/ ./config/

# Create required directories
RUN mkdir -p logs data/skills data/projects plugins

EXPOSE 3000

USER node

CMD ["node", "dist/index.js"]
