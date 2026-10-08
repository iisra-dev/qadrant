// Demo video in the phone (docs/08-video-demo.md). Without this script the video keeps its
// native controls and never plays on its own.
// - Plays muted only while it is on screen, and never on its own if reduced motion is asked for.
// - A visible button pauses and resumes it; the reader's choice wins over scrolling.
const video = document.querySelector('.ph-video');
const button = document.querySelector('.ph-toggle');

if (video && button) {
	const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	let wanted = !reduceMotion;
	let visible = false;

	const render = () => {
		button.textContent = video.paused ? button.dataset.play : button.dataset.pause;
	};
	const sync = () => {
		if (wanted && visible) video.play().catch(() => {});
		else video.pause();
	};

	video.controls = false;
	button.hidden = false;
	video.addEventListener('play', render);
	video.addEventListener('pause', render);
	button.addEventListener('click', () => {
		wanted = video.paused;
		sync();
	});
	new IntersectionObserver(
		([entry]) => {
			visible = entry.isIntersecting;
			sync();
		},
		{ threshold: 0.5 }
	).observe(video);
	render();
}
