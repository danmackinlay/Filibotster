import { defineConfig } from 'vite'

// PORT is set by tooling (e.g. the Claude Code preview harness) when 5173 is
// taken; default remains vite's usual 5173 for manual `npm run dev`.
export default defineConfig({
  server: { port: Number(process.env.PORT) || 5173 },
})
