#!/bin/bash
set -e

echo "🚀 ClawdAgent Setup"
echo "===================="

# Check prerequisites
echo "Checking prerequisites..."
command -v node >/dev/null 2>&1 || { echo "❌ Node.js required"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "❌ pnpm required. Install: npm i -g pnpm"; exit 1; }
command -v docker >/dev/null 2>&1 || echo "⚠️  Docker not found (optional for dev)"

# Install dependencies
echo "Installing dependencies..."
pnpm install

# Setup .env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "📝 Created .env from .env.example — edit it with your keys!"
else
  echo "✅ .env already exists"
fi

# Create directories
mkdir -p logs data

# Start services
echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your API keys"
echo "  2. Start databases: docker compose up -d postgres redis"
echo "  3. Run migrations: pnpm db:migrate"
echo "  4. Start dev server: pnpm dev"
echo ""
