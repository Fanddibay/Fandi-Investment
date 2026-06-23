import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Honor an assigned PORT (lets a second instance run alongside the dev one).
    port: Number(process.env.PORT) || 5173,
    // Proxy the ANTAM gold API (iamutaki/logam-mulia-api) server-side so the
    // browser can read it despite the worker sending no CORS headers.
    proxy: {
      '/lm-api': {
        target: 'https://logam-mulia-api.iamutaki.workers.dev',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/lm-api/, ''),
      },
      // News RSS feeds (no CORS headers) — read server-side via the dev proxy.
      // CNBC's public RSS channels (Markets/Economy) live under one view.xml.
      '/cnbc-rss': {
        target: 'https://search.cnbc.com',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/cnbc-rss/, '/rs/search/combinedcms/view.xml'),
      },
      // Yahoo Finance per-symbol headline feed.
      '/yahoo-rss': {
        target: 'https://feeds.finance.yahoo.com',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/yahoo-rss/, '/rss/2.0/headline'),
      },
      // MarketWatch (Dow Jones) top stories.
      '/mw-rss': {
        target: 'https://feeds.marketwatch.com',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/mw-rss/, ''),
      },
      // Reuters business + top news feeds.
      '/reuters-rss': {
        target: 'https://feeds.reuters.com',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/reuters-rss/, ''),
      },
      // CNBC Indonesia market/investment RSS.
      '/cnbcid-rss': {
        target: 'https://www.cnbcindonesia.com',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/cnbcid-rss/, '/rss'),
      },
      // Kontan investasi RSS.
      '/kontan-rss': {
        target: 'https://www.kontan.co.id',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/kontan-rss/, '/rss'),
      },
    },
  },
})
