import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // UNCOMMENT THE FOLLOWING LINE WHEN USING YOUR DOMAIN
  base: "/dist/",   // tells Vite to prefix all asset paths with /dist/

})
