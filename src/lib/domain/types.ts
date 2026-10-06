// Domain types shared by the UI, the database and the engine (docs/03, docs/04).

export type Quadrant = 'do' | 'schedule' | 'delegate' | 'eliminate';

export const QUADRANTS: readonly Quadrant[] = ['do', 'schedule', 'delegate', 'eliminate'];

export type Engine = 'model-webgpu' | 'model-wasm' | 'rules';

export interface Decision {
	quadrant: Quadrant | null; // null = ask the user
	ask?: 'importance' | 'delegable'; // which single question to ask when quadrant is null
	title: string; // cleaned title (date/duration phrases removed)
	urgent: { value: boolean; dueAt?: string; reason: 'due-soon' | 'overdue' | 'due-later' | 'no-date' };
	importance: { p: number | null; matchedGoalId?: string }; // null in rules-only mode
	delegable: { p: number | null; personId?: string };
	durationMin?: number;
	engine: Engine;
	modelVersion?: string;
}

export interface Base {
	id: string;
	createdAt: string;
	updatedAt: string;
	deletedAt?: string;
}

export type QuadrantSource = 'ai' | 'answer' | 'user';
export type TaskStatus = 'open' | 'done' | 'archived';

export interface Task extends Base {
	title: string;
	rawInput: string; // what the user typed, untouched
	quadrant: Quadrant;
	quadrantSource: QuadrantSource; // answer = user answered the doubt; user = picked by hand, never moved automatically
	important?: boolean; // set on save, rules in docs/03; undefined = unknown
	dueAt?: string;
	durationMin?: number;
	scheduledAt?: string; // start date and time in the agenda
	delegatedTo?: string; // Person.id
	followUpAt?: string; // only when delegated
	notes?: string;
	status: TaskStatus;
	doneAt?: string;
	decision?: Decision; // original engine output; editing the task never overwrites it
	movedAt?: string; // set when the passage of time moved it (docs/03); cleared when the user moves it
}

export interface Goal extends Base {
	title: string;
	summary: string;
	active: boolean;
	order: number;
}

export interface Person extends Base {
	name: string;
	aliases: string[];
}

export interface Correction extends Base {
	taskId: string;
	from: Quadrant | null; // null = it was a doubt
	to: Quadrant;
	pImportance: number | null;
	pDelegable: number | null;
	engine: Engine;
}

export type ModelState = 'absent' | 'downloading' | 'ready' | 'error';

export interface Settings extends Base {
	id: 'settings';
	urgencyDays: number;
	workHours: { start: string; end: string };
	workDays: number[]; // 1..7, ISO weekday
	holidays: { national: boolean; extra: string[] };
	thresholds: { low: number; high: number };
	// Device-local fields: never exported, imported or synced.
	theme: 'light' | 'dark' | 'system';
	language: 'en' | 'es'; // interface language and first language for reading tasks
	model: {
		state: ModelState;
		progress?: number;
		sizeBytes?: number;
		version?: string;
		/** Updates and the first download on their own only on Wi-Fi (Settings). */
		wifiOnly: boolean;
		/** The welcome's "Download when on Wi-Fi"; undefined (before phase 2) counts as yes. */
		autoDownload?: boolean;
	};
	server?: { url: string; token: string };
	onboardingDone: boolean;
	/** Agreed to dictate with the browser's service, which sends the audio to Apple or Google. */
	voiceConsent?: boolean;
}

export const DEVICE_LOCAL_SETTINGS = ['theme', 'language', 'model', 'server', 'onboardingDone', 'voiceConsent'] as const;
export type DeviceLocalSettingsKey = (typeof DEVICE_LOCAL_SETTINGS)[number];
export type SharedSettings = Omit<Settings, DeviceLocalSettingsKey>;

/** Calendar occurrence from the own server (phase 3, optional). All-day ones use 'YYYY-MM-DD' dates, end exclusive. */
export interface CalendarEvent {
	id: string;
	start: string;
	end: string;
	title: string;
	allDay: boolean;
}

export interface ClassifyContext {
	now: Date;
	goals: Goal[]; // active goals only
	people: Person[];
	settings: Settings;
}
