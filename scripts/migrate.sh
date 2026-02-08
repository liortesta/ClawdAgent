#!/bin/bash
set -e
echo "Running database migrations..."
pnpm db:generate
pnpm db:migrate
echo "✅ Migrations complete"
