// Dictation only with on-device recognition (docs/01, "Captura"): the regular
// Web Speech API may send the audio to Google or Apple.

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

const LANG = 'es-ES';

function recognitionConstructor(): RecognitionConstructor | undefined {
	const w = globalThis as unknown as Record<string, RecognitionConstructor | undefined>;
	return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** True only if the browser can recognise Spanish on the device right now. */
export async function localSpeechAvailable(): Promise<boolean> {
	// Headless Chromium crashes inside available(); automated browsers never dictate.
	if (globalThis.navigator?.webdriver) return false;
	const Recognition = recognitionConstructor();
	if (!Recognition?.available) return false;
	try {
		return (await Recognition.available({ langs: [LANG], processLocally: true })) === 'available';
	} catch {
		return false;
	}
}

/** Starts on-device dictation; returns a function that stops it. */
export function dictate(onText: (text: string) => void, onEnd: () => void): () => void {
	const Recognition = recognitionConstructor();
	if (!Recognition) {
		onEnd();
		return () => {};
	}
	const recognition = new Recognition();
	recognition.lang = LANG;
	recognition.interimResults = true;
	recognition.processLocally = true;
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
