// The capture sheet lives in the layout; any screen can open it.
// Closing it without saving discards the text (docs/01, "Captura").

// Versions up to 1.0.0 kept the text as a draft under this key; drop what is left.
const OLD_DRAFT_KEY = 'qadrant.captureDraft';

function dropOldDraft() {
	try {
		localStorage.removeItem(OLD_DRAFT_KEY);
	} catch {
		// Without storage there is nothing to drop.
	}
}

/** How long the row of a task just saved keeps its landing highlight. */
const LANDED_MS = 2000;

class CaptureState {
	open = $state(false);
	text = $state('');
	/** Start dictating as soon as the sheet opens. */
	dictate = $state(false);
	/** Task just saved from the sheet: its row lands with a highlight in the Matrix. */
	landed = $state<string | null>(null);
	#landedTimer: ReturnType<typeof setTimeout> | undefined;

	show(text = '', options: { dictate?: boolean } = {}) {
		dropOldDraft();
		this.text = text;
		this.dictate = options.dictate ?? false;
		this.open = true;
	}

	/** Closes the sheet; whatever was typed and not saved is gone. */
	hide() {
		this.open = false;
		this.text = '';
		this.dictate = false;
	}

	markLanded(id: string) {
		clearTimeout(this.#landedTimer);
		this.landed = id;
		this.#landedTimer = setTimeout(() => (this.landed = null), LANDED_MS);
	}
}

export const capture = new CaptureState();
