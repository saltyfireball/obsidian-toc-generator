import { MarkdownView, Plugin, PluginSettingTab, App } from "obsidian";
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
	private outlineClickHandler: ((e: MouseEvent) => void) | null = null;

	async onload() {
		await this.loadSettings();

		if (this.settings.enabled) {
			registerToc(this as unknown as Parameters<typeof registerToc>[0]);
		}

		this.addSettingTab(new TocSettingTab(this.app, this));

		this.patchOutlineScroll();

		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.patchOutlineScroll();
			}),
		);
	}

	onunload() {
		this.removeOutlinePatch();
	}

	private patchOutlineScroll(): void {
		const outlineLeaves = this.app.workspace.getLeavesOfType("outline");
		if (outlineLeaves.length === 0) return;

		for (const leaf of outlineLeaves) {
			const container = leaf.view.containerEl;
			if (container.dataset.sfTocPatched) continue;
			container.dataset.sfTocPatched = "true";

			const handler = (e: MouseEvent) => {
				const target = e.target as HTMLElement;
				const treeItem = target.closest(".tree-item-inner");
				if (!treeItem) return;

				const headingText = treeItem.textContent?.trim();
				if (!headingText) return;

				e.preventDefault();
				e.stopPropagation();

				this.scrollToHeadingFromOutline(headingText);
			};

			container.addEventListener("click", handler, true);
			this.outlineClickHandler = handler;
		}
	}

	private removeOutlinePatch(): void {
		if (!this.outlineClickHandler) return;
		const outlineLeaves = this.app.workspace.getLeavesOfType("outline");
		for (const leaf of outlineLeaves) {
			const container = leaf.view.containerEl;
			container.removeEventListener("click", this.outlineClickHandler, true);
			delete container.dataset.sfTocPatched;
		}
		this.outlineClickHandler = null;
	}

	private scrollToHeadingFromOutline(headingText: string): void {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view?.file) return;

		const cache = this.app.metadataCache.getFileCache(view.file);
		if (!cache?.headings) return;

		const match = cache.headings.find((h) => h.heading === headingText);
		if (!match?.position) return;

		const mode = view.getMode();

		if (mode === "source") {
			const line = match.position.start.line;
			view.editor.setCursor(line, 0);
			view.editor.scrollIntoView(
				{ from: { line, ch: 0 }, to: { line, ch: 0 } },
				true,
			);
		} else {
			const previewEl = view.previewMode?.containerEl;
			if (!previewEl) return;

			const headingEls = previewEl.querySelectorAll("h1, h2, h3, h4, h5, h6");
			for (const el of Array.from(headingEls)) {
				if (el.textContent?.trim() === headingText.trim()) {
					el.scrollIntoView({ behavior: "smooth", block: "start" });
					return;
				}
			}
		}
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
