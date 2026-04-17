import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('framer-motion')) return 'framer-motion'
          if (id.includes('react-router')) return 'react-router'
          if (id.includes('lucide-react')) return 'lucide-react'
          if (
            id.includes('react-markdown') ||
            id.includes('/remark-') ||
            id.includes('/mdast') ||
            id.includes('/micromark') ||
            id.includes('/unist')
          ) {
            return 'markdown'
          }
        },
      },
    },
  },
})
