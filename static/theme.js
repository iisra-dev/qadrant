// Applies the saved theme before the first paint (see src/lib/theme.ts).
// Loaded as a blocking script from app.html so the CSP needs no inline scripts.
try {
	var theme = localStorage.getItem('qadrant.theme');
	if (theme === 'light' || theme === 'dark') {
		document.documentElement.setAttribute('data-theme', theme);
		var color = theme === 'dark' ? '#0E0E10' : '#FAF9F6';
		document.querySelectorAll('meta[name="theme-color"]').forEach(function (meta) {
			meta.setAttribute('content', color);
		});
	}
	// Interface language, mirrored by src/lib/i18n (English unless Spanish was chosen).
	if (localStorage.getItem('qadrant.lang') === 'es') document.documentElement.setAttribute('lang', 'es');
} catch (e) {}
