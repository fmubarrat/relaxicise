import { defineConfig } from 'vitest/config';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:lan` (mode "lan") serves over HTTPS on the local network: browsers only allow
// the camera on localhost or HTTPS, so another device on the same Wi-Fi needs HTTPS. The
// certificate is self-signed, so the browser shows a warning once ("Advanced" -> "Proceed").
export default defineConfig(({ mode }) => {
  const lan = mode === 'lan';
  return {
    plugins: lan ? [basicSsl()] : [],
    server: { port: lan ? 5174 : 5173, host: lan ? true : undefined, strictPort: true },
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
    },
  };
});
