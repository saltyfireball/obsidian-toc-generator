import { Plugin, PluginSettingTab, App } from "obsidian";
import { registerToc, applyGlobalBacktotop } from "./processor";
import { registerOutlineView } from "./outline-view";
import { registerPrerender } from "./prerender";
import { createBackToTopExtension } from "./backtotop-extension";
import { renderSettingsTab } from "./settings-ui";

export interface TocPluginSettings {
	enabled: boolean;
	codeBlockId: string;
	defaultTitle: string;
	defaultMinLevel: number;
	defaultMaxLevel: number;
	defaultNumbered: boolean;
	defaultShapes: string[];
	// When true, every heading in every note gets a back-to-top button without
	// needing a TOC code block with `backtotop: true`. Per-block opt-in still
	// works alongside this.
	backtotopGlobal: boolean;
	backtotopGlobalMinLevel: number;
	backtotopGlobalMaxLevel: number;
}

const DEFAULT_SETTINGS: TocPluginSettings = {
	enabled: true,
	codeBlockId: "my-toc",
	defaultTitle: "",
	defaultMinLevel: 1,
	defaultMaxLevel: 6,
	defaultNumbered: false,
	defaultShapes: [],
	backtotopGlobal: false,
	backtotopGlobalMinLevel: 1,
	backtotopGlobalMaxLevel: 6,
};

export default class TocGeneratorPlugin extends Plugin {
	settings!: TocPluginSettings;

	async onload() {
		await this.loadSettings();

		if (this.settings.enabled) {
			registerToc(this as unknown as Parameters<typeof registerToc>[0]);
		}

		this.addSettingTab(new TocSettingTab(this.app, this));

		this.registerEditorExtension(createBackToTopExtension());
		registerOutlineView(this.app, this);
		registerPrerender(this.app, this);

		this.app.workspace.onLayoutReady(() => {
			applyGlobalBacktotop(this as unknown as Parameters<typeof applyGlobalBacktotop>[0]);
		});
	}

	async loadSettings() {
		const data = (await this.loadData()) as Partial<TocPluginSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
		// Ensure defaultShapes is always an array
		if (!Array.isArray(this.settings.defaultShapes)) {
			this.settings.defaultShapes = [];
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class TocSettingTab extends PluginSettingTab {
	plugin: TocGeneratorPlugin;

	constructor(app: App, plugin: TocGeneratorPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();
		renderSettingsTab({ plugin: this.plugin, containerEl });
	}
}
