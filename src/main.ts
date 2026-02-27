import { Plugin, PluginSettingTab, App } from "obsidian";
import { registerToc } from "./processor";
import { renderSettingsTab } from "./settings-ui";

export interface TocPluginSettings {
	enabled: boolean;
	codeBlockId: string;
	defaultTitle: string;
	defaultMinLevel: number;
	defaultMaxLevel: number;
	defaultNumbered: boolean;
	defaultShapes: string[];
}

const DEFAULT_SETTINGS: TocPluginSettings = {
	enabled: true,
	codeBlockId: "my-toc",
	defaultTitle: "",
	defaultMinLevel: 1,
	defaultMaxLevel: 6,
	defaultNumbered: false,
	defaultShapes: [],
};

export default class TocGeneratorPlugin extends Plugin {
	settings!: TocPluginSettings;

	async onload() {
		await this.loadSettings();

		if (this.settings.enabled) {
			registerToc(this as unknown as Parameters<typeof registerToc>[0]);
		}

		this.addSettingTab(new TocSettingTab(this.app, this));
	}

	async loadSettings() {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- loadData returns any
		const data = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data as Partial<TocPluginSettings>);
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
