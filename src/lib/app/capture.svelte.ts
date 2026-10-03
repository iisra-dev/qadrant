// The capture sheet lives in the layout; any screen can open it.
class CaptureState {
	open = $state(false);
	text = $state('');

	show(text = '') {
		this.text = text;
		this.open = true;
	}

	hide() {
		this.open = false;
		this.text = '';
	}
}

export const capture = new CaptureState();
