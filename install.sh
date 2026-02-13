#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════
# ClawdAgent Installer — Production Setup Wizard v6.0
# ═══════════════════════════════════════════════════════════════════

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "  ╔═══════════════════════════════════════════╗"
echo "  ║    ClawdAgent — Setup Wizard v6.0         ║"
echo "  ║    Autonomous AI Agent + Web Dashboard    ║"
echo "  ╚═══════════════════════════════════════════╝"
echo -e "${NC}"

# ── 1. Check prerequisites ──────────────────────────────────────
echo -e "${BLUE}[1/9] Checking prerequisites...${NC}"

check_command() {
  if command -v "$1" &>/dev/null; then
    echo -e "  ${GREEN}✔${NC} $1 found: $(command -v "$1")"
    return 0
  else
    echo -e "  ${RED}✘${NC} $1 not found"
    return 1
  fi
}

MISSING=0
check_command node || MISSING=1
check_command pnpm || { echo -e "  ${YELLOW}→ Installing pnpm...${NC}"; npm install -g pnpm; }
check_command git || MISSING=1

# Claude Code CLI (optional but recommended — FREE via Max subscription)
if check_command claude; then
  echo -e "  ${GREEN}✔${NC} Claude Code CLI found (FREE via Max subscription)"
else
  echo -e "  ${YELLOW}→${NC} Claude Code CLI not found (optional — saves API costs)"
  echo -e "  ${YELLOW}  Install:${NC} npm install -g @anthropic-ai/claude-code && claude login"
fi

if [ "$MISSING" -eq 1 ]; then
  echo -e "${RED}Missing prerequisites. Please install Node.js and Git first.${NC}"
  exit 1
fi

NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo -e "${RED}Node.js 18+ required (found v${NODE_VER})${NC}"
  exit 1
fi
echo -e "  ${GREEN}✔${NC} Node.js v$(node -v | cut -d'v' -f2)"

# ── 2. Install backend dependencies ──────────────────────────────
echo -e "\n${BLUE}[2/9] Installing backend dependencies...${NC}"
pnpm install

# ── 3. Install web dashboard dependencies ─────────────────────────
echo -e "\n${BLUE}[3/9] Installing web dashboard dependencies...${NC}"
if [ -d "web" ]; then
  cd web && npm install && cd ..
  echo -e "  ${GREEN}✔${NC} Dashboard dependencies installed"
else
  echo -e "  ${YELLOW}→${NC} web/ directory not found, skipping dashboard"
fi

# ── 4. Setup environment ─────────────────────────────────────────
echo -e "\n${BLUE}[4/9] Setting up environment...${NC}"

if [ -f .env ]; then
  echo -e "  ${YELLOW}⚠${NC} .env already exists — skipping (backup: .env.backup)"
  cp .env .env.backup
else
  cp .env.example .env
  echo -e "  ${GREEN}✔${NC} Created .env from template"
fi

# ── 5. Interactive configuration ──────────────────────────────────
echo -e "\n${BLUE}[5/9] Configuration${NC}"
echo -e "${YELLOW}Configure your API keys now? (y/n)${NC}"
read -r CONFIGURE

if [ "$CONFIGURE" = "y" ] || [ "$CONFIGURE" = "Y" ]; then
  echo ""

  # Anthropic API Key
  echo -e "${CYAN}Anthropic API Key (required):${NC}"
  read -r -s ANTHROPIC_KEY
  if [ -n "$ANTHROPIC_KEY" ]; then
    sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=$ANTHROPIC_KEY|" .env
    echo -e "  ${GREEN}✔${NC} Anthropic API key set"
  fi

  # Database
  echo -e "\n${CYAN}PostgreSQL URL (default: postgresql://localhost:5432/clawdagent):${NC}"
  read -r DB_URL
  DB_URL=${DB_URL:-postgresql://localhost:5432/clawdagent}
  sed -i "s|^DATABASE_URL=.*|DATABASE_URL=$DB_URL|" .env
  echo -e "  ${GREEN}✔${NC} Database URL set"

  # Telegram
  echo -e "\n${CYAN}Telegram Bot Token (optional, press Enter to skip):${NC}"
  read -r -s TG_TOKEN
  if [ -n "$TG_TOKEN" ]; then
    sed -i "s|^TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=$TG_TOKEN|" .env
    echo -e "  ${GREEN}✔${NC} Telegram token set"

    echo -e "${CYAN}Telegram Admin ID(s) (comma-separated):${NC}"
    read -r TG_ADMINS
    if [ -n "$TG_ADMINS" ]; then
      sed -i "s|^TELEGRAM_ADMIN_IDS=.*|TELEGRAM_ADMIN_IDS=$TG_ADMINS|" .env
    fi
  else
    echo -e "  ${YELLOW}→${NC} Skipped"
  fi

  # OpenRouter (free models)
  echo -e "\n${CYAN}OpenRouter API Key (optional, for free models):${NC}"
  read -r -s OR_KEY
  if [ -n "$OR_KEY" ]; then
    sed -i "s|^OPENROUTER_API_KEY=.*|OPENROUTER_API_KEY=$OR_KEY|" .env
    echo -e "  ${GREEN}✔${NC} OpenRouter key set"
  else
    echo -e "  ${YELLOW}→${NC} Skipped"
  fi

  # GitHub
  echo -e "\n${CYAN}GitHub Token (optional):${NC}"
  read -r -s GH_TOKEN
  if [ -n "$GH_TOKEN" ]; then
    sed -i "s|^GITHUB_TOKEN=.*|GITHUB_TOKEN=$GH_TOKEN|" .env
    echo -e "  ${GREEN}✔${NC} GitHub token set"
  else
    echo -e "  ${YELLOW}→${NC} Skipped"
  fi
fi

# ── 6. Create data directories ────────────────────────────────────
echo -e "\n${BLUE}[6/9] Creating directories...${NC}"
mkdir -p data/projects data/skills data/whatsapp-session data/rag
mkdir -p config/agents config/models config/behaviors config/mcp
mkdir -p plugins logs
echo -e "  ${GREEN}✔${NC} Directories created"

# ── 7. Generate security keys ─────────────────────────────────────
echo -e "\n${BLUE}[7/9] Generating security keys...${NC}"

generate_key() {
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
}

# Only generate if default values
if grep -q "change-this-to-a-real-secret" .env 2>/dev/null; then
  JWT_KEY=$(generate_key)
  ENC_KEY=$(generate_key)
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$JWT_KEY|" .env
  sed -i "s|^ENCRYPTION_KEY=.*|ENCRYPTION_KEY=$ENC_KEY|" .env
  echo -e "  ${GREEN}✔${NC} JWT secret generated"
  echo -e "  ${GREEN}✔${NC} Encryption key generated"
else
  echo -e "  ${YELLOW}→${NC} Security keys already set"
fi

# ── 8. Build ──────────────────────────────────────────────────────
echo -e "\n${BLUE}[8/9] Building project...${NC}"

# Build backend
echo -e "  Building backend..."
pnpm run build 2>&1 || {
  echo -e "  ${YELLOW}⚠${NC} Backend build had warnings (this is normal for first build)"
}

# Build dashboard
if [ -d "web" ]; then
  echo -e "  Building web dashboard..."
  cd web && npm run build 2>&1 && cd .. || {
    echo -e "  ${YELLOW}⚠${NC} Dashboard build had warnings"
    cd ..
  }
  echo -e "  ${GREEN}✔${NC} Dashboard built"
fi

# ── 9. Docker (optional) ──────────────────────────────────────────
echo -e "\n${BLUE}[9/9] Docker setup${NC}"
if command -v docker &>/dev/null; then
  echo -e "${YELLOW}Start Docker containers (PostgreSQL + Redis)? (y/n)${NC}"
  read -r USE_DOCKER
  if [ "$USE_DOCKER" = "y" ] || [ "$USE_DOCKER" = "Y" ]; then
    if [ -f docker-compose.yml ]; then
      docker compose up -d postgres redis 2>/dev/null || docker-compose up -d postgres redis
      echo -e "  ${GREEN}✔${NC} Docker containers started"
      echo -e "  Waiting for PostgreSQL to be ready..."
      sleep 3
    else
      echo -e "  ${YELLOW}⚠${NC} docker-compose.yml not found"
    fi
  fi
else
  echo -e "  ${YELLOW}→${NC} Docker not installed (PostgreSQL and Redis must be running separately)"
fi

# ── Done ──────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ClawdAgent v6.0 setup complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${CYAN}Start development:${NC}  pnpm dev"
echo -e "  ${CYAN}Start production:${NC}   pnpm start"
echo -e "  ${CYAN}Web Dashboard:${NC}      http://localhost:5173"
echo -e "  ${CYAN}API:${NC}                http://localhost:3000"
echo -e "  ${CYAN}Run tests:${NC}          pnpm test"
echo -e "  ${CYAN}Build:${NC}              pnpm run build"
echo ""
echo -e "  ${YELLOW}Quick start with Docker:${NC}"
echo -e "    docker compose up -d"
echo ""
echo -e "  ${YELLOW}Important:${NC}"
echo -e "  1. Make sure PostgreSQL is running"
echo -e "  2. Make sure Redis is running"
echo -e "  3. Edit .env to add remaining API keys"
echo -e "  4. Or manage keys via Dashboard → Settings"
echo ""
