// The capture sheet lives in the layout; any screen can open it.
// Closing it without saving keeps the text as a draft on this device, so an
// interruption does not lose it (docs/01, "Captura").
const DRAFT_KEY = 'qadrant.captureDraft';

function readDraft(): string {
	try {
		return localStorage.getItem(DRAFT_KEY) ?? '';
	} catch {
		return '';
	}
}

function writeDraft(text: string) {
	try {
		if (text) localStorage.setItem(DRAFT_KEY, text);
		else localStorage.removeItem(DRAFT_KEY);
	} catch {
		// Without storage the draft only lives until the sheet closes.
	}
}

class CaptureState {
	open = $state(false);
	text = $state('');
	/** Start dictating as soon as the sheet opens. */
	dictate = $state(false);

	show(text = '', options: { dictate?: boolean } = {}) {
		this.text = text || readDraft();
		this.dictate = options.dictate ?? false;
		this.open = true;
	}

	/** Closes the sheet; pass the text to keep it as a draft, nothing once it is saved. */
	hide(draft = '') {
		writeDraft(draft.trim() ? draft : '');
		this.open = false;
		this.text = '';
		this.dictate = false;
	}
}

export const capture = new CaptureState();
