import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// GitHub Pages serves project sites from https://<user>.github.io/<repo>/,
// not from "/" — so the production build needs that repo name as its base
// path, or every asset request 404s. We derive it automatically from the
// GITHUB_REPOSITORY env var GitHub Actions sets ("owner/repo") instead of
// hard-coding the repo name, so this keeps working if the repo is renamed
// or forked. Outside GitHub Actions (local `npm run dev` / a plain local
// `vite build`) that env var isn't set, so base stays "/", which is what
// local development needs.
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base = process.env.GITHUB_ACTIONS && repoName ? `/${repoName}/` : '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
})
