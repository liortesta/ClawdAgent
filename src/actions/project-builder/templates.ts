export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  stack: string;
  files: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  dockerBase?: string;
}

export const templates: ProjectTemplate[] = [
  {
    id: 'landing-page',
    name: 'Landing Page',
    description: 'Static HTML/CSS/JS landing page with Tailwind',
    stack: 'html',
    files: {
      'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{PROJECT_NAME}}</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-white text-gray-900">
  <header class="bg-blue-600 text-white py-16 text-center">
    <h1 class="text-5xl font-bold">{{PROJECT_NAME}}</h1>
    <p class="mt-4 text-xl">{{DESCRIPTION}}</p>
  </header>
  <main class="max-w-4xl mx-auto py-12 px-4">
    <section class="grid md:grid-cols-3 gap-8">
      <div class="text-center p-6"><h3 class="text-xl font-semibold mb-2">Feature 1</h3><p>Description here.</p></div>
      <div class="text-center p-6"><h3 class="text-xl font-semibold mb-2">Feature 2</h3><p>Description here.</p></div>
      <div class="text-center p-6"><h3 class="text-xl font-semibold mb-2">Feature 3</h3><p>Description here.</p></div>
    </section>
  </main>
  <footer class="bg-gray-100 py-8 text-center text-gray-600">&copy; 2025 {{PROJECT_NAME}}</footer>
</body>
</html>`,
      'style.css': `/* Custom styles */\nbody { font-family: system-ui, sans-serif; }`,
    },
    dockerBase: 'nginx:alpine',
  },

  {
    id: 'rest-api',
    name: 'REST API',
    description: 'Express.js REST API with TypeScript',
    stack: 'node',
    files: {
      'src/index.ts': `import express from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(helmet());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.get('/api/items', (_req, res) => {
  res.json({ items: [], total: 0 });
});

app.post('/api/items', (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  res.status(201).json({ id: Date.now().toString(), name, description, createdAt: new Date().toISOString() });
});

app.listen(PORT, () => console.log(\`Server running on port \${PORT}\`));
`,
      'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}`,
    },
    dependencies: { express: 'latest', cors: 'latest', helmet: 'latest' },
    devDependencies: { typescript: 'latest', tsx: 'latest', '@types/node': 'latest', '@types/express': 'latest', '@types/cors': 'latest' },
    scripts: { dev: 'tsx watch src/index.ts', build: 'tsc', start: 'node dist/index.js' },
    dockerBase: 'node:20-alpine',
  },

  {
    id: 'react-dashboard',
    name: 'React Dashboard',
    description: 'React + Vite + Tailwind dashboard',
    stack: 'react',
    files: {
      'index.html': `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>{{PROJECT_NAME}}</title></head>
<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>`,
      'src/main.tsx': `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
`,
      'src/App.tsx': `import { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow px-6 py-4"><h1 className="text-xl font-bold">{{PROJECT_NAME}}</h1></nav>
      <main className="max-w-6xl mx-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg shadow p-6"><h2 className="text-lg font-semibold">Users</h2><p className="text-3xl font-bold mt-2">1,234</p></div>
          <div className="bg-white rounded-lg shadow p-6"><h2 className="text-lg font-semibold">Revenue</h2><p className="text-3xl font-bold mt-2">$56,789</p></div>
          <div className="bg-white rounded-lg shadow p-6"><h2 className="text-lg font-semibold">Orders</h2><p className="text-3xl font-bold mt-2">890</p></div>
        </div>
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Dashboard Content</h2>
          <p>Counter: {count} <button className="ml-2 px-3 py-1 bg-blue-500 text-white rounded" onClick={() => setCount(c => c + 1)}>+1</button></p>
        </div>
      </main>
    </div>
  );
}
`,
      'src/index.css': `@tailwind base;\n@tailwind components;\n@tailwind utilities;`,
      'tailwind.config.js': `export default { content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'], theme: { extend: {} }, plugins: [] };`,
      'postcss.config.js': `export default { plugins: { tailwindcss: {}, autoprefixer: {} } };`,
      'vite.config.ts': `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({ plugins: [react()] });\n`,
      'tsconfig.json': `{
  "compilerOptions": { "target": "ES2020", "module": "ESNext", "lib": ["ES2020", "DOM", "DOM.Iterable"], "moduleResolution": "bundler", "jsx": "react-jsx", "strict": true, "skipLibCheck": true },
  "include": ["src"]
}`,
    },
    dependencies: { react: 'latest', 'react-dom': 'latest' },
    devDependencies: { vite: 'latest', '@vitejs/plugin-react': 'latest', typescript: 'latest', tailwindcss: 'latest', postcss: 'latest', autoprefixer: 'latest', '@types/react': 'latest', '@types/react-dom': 'latest' },
    scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
    dockerBase: 'nginx:alpine',
  },

  {
    id: 'nextjs-saas',
    name: 'Next.js SaaS',
    description: 'Next.js 14 SaaS starter with App Router + Tailwind',
    stack: 'nextjs',
    files: {
      'app/layout.tsx': `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: '{{PROJECT_NAME}}', description: '{{DESCRIPTION}}' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body className="antialiased">{children}</body></html>);
}
`,
      'app/page.tsx': `export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <h1 className="text-5xl font-bold mb-4">{{PROJECT_NAME}}</h1>
      <p className="text-xl text-gray-600 mb-8">{{DESCRIPTION}}</p>
      <div className="flex gap-4">
        <a href="/dashboard" className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700">Get Started</a>
        <a href="/docs" className="px-6 py-3 border border-gray-300 rounded-lg font-semibold hover:bg-white">Documentation</a>
      </div>
    </main>
  );
}
`,
      'app/dashboard/page.tsx': `export default function Dashboard() {
  return (<div className="p-8"><h1 className="text-3xl font-bold mb-6">Dashboard</h1><p>Welcome to your dashboard.</p></div>);
}
`,
      'app/globals.css': `@tailwind base;\n@tailwind components;\n@tailwind utilities;`,
      'tailwind.config.ts': `import type { Config } from 'tailwindcss';\nconst config: Config = { content: ['./app/**/*.{js,ts,jsx,tsx}'], theme: { extend: {} }, plugins: [] };\nexport default config;`,
      'next.config.mjs': `/** @type {import('next').NextConfig} */\nconst nextConfig = {};\nexport default nextConfig;\n`,
      'tsconfig.json': `{
  "compilerOptions": { "target": "ES2017", "lib": ["dom", "dom.iterable", "esnext"], "module": "esnext", "moduleResolution": "bundler", "jsx": "preserve", "strict": true, "plugins": [{ "name": "next" }], "paths": { "@/*": ["./*"] } },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}`,
    },
    dependencies: { next: 'latest', react: 'latest', 'react-dom': 'latest' },
    devDependencies: { typescript: 'latest', tailwindcss: 'latest', postcss: 'latest', autoprefixer: 'latest', '@types/node': 'latest', '@types/react': 'latest', '@types/react-dom': 'latest' },
    scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
    dockerBase: 'node:20-alpine',
  },

  {
    id: 'python-api',
    name: 'Python FastAPI',
    description: 'Python FastAPI with uvicorn',
    stack: 'python',
    files: {
      'main.py': `from fastapi import FastAPI
from pydantic import BaseModel
from datetime import datetime

app = FastAPI(title="{{PROJECT_NAME}}", description="{{DESCRIPTION}}")

class Item(BaseModel):
    name: str
    description: str | None = None

class ItemResponse(BaseModel):
    id: str
    name: str
    description: str | None
    created_at: str

@app.get("/health")
def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

@app.get("/api/items")
def list_items():
    return {"items": [], "total": 0}

@app.post("/api/items", status_code=201)
def create_item(item: Item):
    return ItemResponse(id=str(int(datetime.now().timestamp())), name=item.name, description=item.description, created_at=datetime.now().isoformat())
`,
      'requirements.txt': `fastapi>=0.104.0\nuvicorn[standard]>=0.24.0\npydantic>=2.0.0\n`,
    },
    dockerBase: 'python:3.12-slim',
  },
];

export function getTemplate(id: string): ProjectTemplate | undefined {
  return templates.find(t => t.id === id);
}

export function listTemplates(): Array<{ id: string; name: string; description: string; stack: string }> {
  return templates.map(t => ({ id: t.id, name: t.name, description: t.description, stack: t.stack }));
}
