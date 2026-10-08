// Builds the static landing page (site/) into site/dist: one page per language,
// with the design tokens, self-hosted fonts and icons copied in (docs/07, "Landing page").
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');
const out = join(site, 'dist');

// Public addresses. Override with env vars when the domains change.
const APP_URL = (process.env.QADRANT_APP_URL ?? 'https://qadrant-62h.pages.dev').replace(/\/$/, '');
const SITE_URL = (process.env.QADRANT_SITE_URL ?? 'https://qadrant.iisra.dev').replace(/\/?$/, '/');
const SERVER_REPO_URL = 'https://github.com/iisra-dev/qadrant-server';
const GITHUB_URL = 'https://github.com/iisra-dev';

const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const template = readFileSync(join(site, 'template.html'), 'utf8');

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const languages = {
	en: { dir: '', root: './', other: 'es', otherHref: 'es/' },
	es: { dir: 'es', root: '../', other: 'en', otherHref: '../' }
};

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'fonts'), { recursive: true });

// Demo video slot (docs/08-video-demo.md): site/media/demo-<lang>.mp4 and .jpg (poster).
// Without them the page shows the HTML mockup, as before.
const media = join(site, 'media');
const demoFor = (lang) => {
	const files = [`demo-${lang}.mp4`, `demo-${lang}.jpg`];
	if (!files.every((file) => existsSync(join(media, file)))) return null;
	mkdirSync(join(out, 'media'), { recursive: true });
	for (const file of files) copyFileSync(join(media, file), join(out, 'media', file));
	return files.map((file) => `media/${file}`);
};

for (const [lang, page] of Object.entries(languages)) {
	const strings = JSON.parse(readFileSync(join(site, 'i18n', `${lang}.json`), 'utf8'));
	const demo = demoFor(lang);
	const values = {
		phoneClass: demo ? 'phone has-video' : 'phone',
		demoVideo: demo
			? `        <video class="ph-video" muted loop playsinline controls preload="none" width="780" height="1688" poster="${page.root}${demo[1]}">
          <source src="${page.root}${demo[0]}" type="video/mp4">
        </video>
        <button class="ph-toggle" type="button" hidden data-play="${escape(strings.demoPlay)}" data-pause="${escape(strings.demoPause)}">${escape(strings.demoPlay)}</button>`
			: '',
		demoScript: demo ? `<script src="${page.root}demo.js" defer></script>\n` : '',
		...Object.fromEntries(Object.entries(strings).map(([k, v]) => [k, escape(v)])),
		lang,
		root: page.root,
		langPath: page.dir ? `${page.dir}/` : '',
		otherLang: page.other,
		otherLangHref: page.otherHref,
		appUrl: APP_URL,
		siteUrl: SITE_URL,
		serverRepoUrl: SERVER_REPO_URL,
		githubUrl: GITHUB_URL,
		version
	};
	const html = template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
		if (!(key in values)) throw new Error(`site/i18n/${lang}.json: missing "${key}"`);
		return values[key];
	});
	mkdirSync(join(out, page.dir), { recursive: true });
	writeFileSync(join(out, page.dir, 'index.html'), html);
}

copyFileSync(join(root, 'design', 'tokens.css'), join(out, 'tokens.css'));
copyFileSync(join(site, 'site.css'), join(out, 'site.css'));
copyFileSync(join(site, '_headers'), join(out, '_headers'));
if (existsSync(join(out, 'media'))) copyFileSync(join(site, 'demo.js'), join(out, 'demo.js'));
for (const file of ['logo.svg', 'logo-dark.svg', 'favicon.ico', 'apple-touch-icon.png']) {
	copyFileSync(join(root, 'static', file), join(out, file));
}
const fonts = [
	['bricolage-grotesque', 500],
	['bricolage-grotesque', 700],
	['ibm-plex-sans', 400],
	['ibm-plex-sans', 600],
	['ibm-plex-mono', 500]
];
for (const [family, weight] of fonts) {
	const file = `${family}-latin-${weight}-normal.woff2`;
	copyFileSync(join(root, 'node_modules', '@fontsource', family, 'files', file), join(out, 'fonts', file));
}

// Cloudflare caches .css and .svg at the edge whatever the origin says, while the HTML is never
// cached: a content hash in each URL makes every deploy point at files the edge has not seen.
const versioned = ['tokens.css', 'site.css', 'logo.svg', 'logo-dark.svg', 'demo.js', ...Object.keys(languages).flatMap((lang) => [`media/demo-${lang}.mp4`, `media/demo-${lang}.jpg`])].filter((file) => existsSync(join(out, file)));
const hashes = Object.fromEntries(
	versioned.map((file) => [file, createHash('sha256').update(readFileSync(join(out, file))).digest('hex').slice(0, 10)])
);
for (const page of Object.values(languages)) {
	const path = join(out, page.dir, 'index.html');
	const html = readFileSync(path, 'utf8').replace(
		/(href|src|srcset|poster)="((?:\.\.?\/)?)([\w./-]+)"/g,
		(match, attr, prefix, file) => (file in hashes ? `${attr}="${prefix}${file}?v=${hashes[file]}"` : match)
	);
	writeFileSync(path, html);
}

console.log(`Landing page ${version} built in site/dist (app: ${APP_URL})`);
