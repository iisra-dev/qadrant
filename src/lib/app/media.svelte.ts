// Breakpoints of docs/05, "Responsive".
class Media {
	web = $state(false); // >= 768 px: header, capture as modal, detail as side panel
	wide = $state(false); // >= 1024 px: matrix and today's agenda side by side

	start(): () => void {
		const web = matchMedia('(min-width: 768px)');
		const wide = matchMedia('(min-width: 1024px)');
		const update = () => {
			this.web = web.matches;
			this.wide = wide.matches;
		};
		update();
		web.addEventListener('change', update);
		wide.addEventListener('change', update);
		return () => {
			web.removeEventListener('change', update);
			wide.removeEventListener('change', update);
		};
	}
}

export const media = new Media();
