import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// PWA icons generated from static/logo.svg (docs/05-sistema-de-diseno.md, "Logotipo").
export default defineConfig({
	preset: {
		...minimal2023Preset,
		maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#FAF9F6' } },
		apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#FAF9F6' } }
	},
	images: ['static/logo.svg']
});
