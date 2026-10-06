// Dictation (docs/01, "Captura"): on-device recognition when the browser has it;
// otherwise the browser's own service, which sends the audio to Apple or Google,
// only after the user agrees (decision of 6 Oct 2026, docs/07).

type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable';

interface LocalRecognition extends EventTarget {
	lang: string;
	interimResults: boolean;
	processLocally: boolean;
	start(): void;
	stop(): void;
	onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
	onend: (() => void) | null;
	onerror: (() => void) | null;
}

interface RecognitionConstructor {
	new (): LocalRecognition;
	available?: (options: { langs: string[]; processLocally: boolean }) => Promise<Availability>;
}


const LOCALES = { en: 'en-US', es: 'es-ES' } as const;

function recognitionConstructor(): RecognitionConstructor | undefined {
	const w = globalThis as unknown as Record<string, RecognitionConstructor | undefined>;
	return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** local = on the device; cloud = the browser's service (the audio leaves the device); none = no dictation. */
export type SpeechMode = 'local' | 'cloud' | 'none';

export async function speechMode(lang: 'en' | 'es'): Promise<SpeechMode> {
	// Headless Chromium crashes inside available(); automated browsers never dictate.
	if (globalThis.navigator?.webdriver) return 'none';
	const Recognition = recognitionConstructor();
	if (!Recognition) return 'none';
	if (Recognition.available) {
		try {
			if ((await Recognition.available({ langs: [LOCALES[lang]], processLocally: true })) === 'available') return 'local';
		} catch {
			// Fall through to the browser's service.
		}
	}
	return 'cloud';
}

/** Starts dictation; returns a function that stops it. */
export function dictate(
	lang: 'en' | 'es',
	mode: Exclude<SpeechMode, 'none'>,
	onText: (text: string) => void,
	onEnd: () => void
): () => void {
	const Recognition = recognitionConstructor();
	if (!Recognition) {
		onEnd();
		return () => {};
	}
	const recognition = new Recognition();
	recognition.lang = LOCALES[lang];
	recognition.interimResults = true;
	if (mode === 'local') recognition.processLocally = true;
	recognition.onresult = (event) => {
		let text = '';
		for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
		onText(text);
	};
	recognition.onend = onEnd;
	recognition.onerror = onEnd;
	recognition.start();
	return () => recognition.stop();
}
