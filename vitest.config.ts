import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		alias: {
			// The `obsidian` package is types-only; point its runtime at a stub.
			obsidian: fileURLToPath(
				new URL('./test/obsidian-mock.ts', import.meta.url),
			),
		},
	},
});
