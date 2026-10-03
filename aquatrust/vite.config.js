import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Dev-only proxy so browser can call the EA Water Quality API without CORS issues.
      '/api/ea': {
        target: 'https://environment.data.gov.uk',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/ea/, '/water-quality'),
      },
    },
  },
})
