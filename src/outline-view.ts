import { ItemView, MarkdownView, TFile, WorkspaceLeaf } from "obsidian";
import type { App } from "obsidian";

export const OUTLINE_VIEW_TYPE = "sf-outline";

interface HeadingItem {
	heading: string;
	level: number;
	position: { start: { line: number } };
}

interface ScrollableMode {
	applyScroll?: (line: number) => void;
}

export class OutlineView extends ItemView {
	private listEl: HTMLElement | null = null;
	private lastMarkdownLeaf: WorkspaceLeaf | null = null;
	private lastFile: TFile | null = null;
	private isScrolling = false;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return OUTLINE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Outline";
	}

	getIcon(): string {
		return "list";
	}

	async onOpen(): Promise<void> {
		await Promise.resolve();
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass("sf-outline-container");

		this.listEl = container.createDiv("sf-outline-list");

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (this.isScrolling) return;
				if (!leaf) return;
				if (leaf.view instanceof MarkdownView) {
					this.lastMarkdownLeaf = leaf;
					this.lastFile = leaf.view.file;
					this.refresh();
				}
			}),
		);

		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => {
				if (this.isScrolling) return;
				if (this.lastFile && file.path === this.lastFile.path) {
					this.refresh();
				}
			}),
		);

		this.registerEvent(
			this.app.workspace.on("file-open", () => {
				if (this.isScrolling) return;
				this.findMarkdownLeaf();
				this.refresh();
			}),
		);

		this.findMarkdownLeaf();
		this.refresh();
	}

	async onClose(): Promise<void> {
		await Promise.resolve();
		this.listEl = null;
		this.lastMarkdownLeaf = null;
		this.lastFile = null;
	}

	private findMarkdownLeaf(): void {
		const active = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (active) {
			const leaves = this.app.workspace.getLeavesOfType("markdown");
			const leaf = leaves.find((l) => l.view === active);
			if (leaf) {
				this.lastMarkdownLeaf = leaf;
				this.lastFile = active.file;
				return;
			}
		}
		if (!this.lastMarkdownLeaf) {
			const leaves = this.app.workspace.getLeavesOfType("markdown");
			if (leaves.length > 0) {
				this.lastMarkdownLeaf = leaves[0];
				this.lastFile = (leaves[0].view as MarkdownView).file;
			}
		}
	}

	private getView(): MarkdownView | null {
		if (this.lastMarkdownLeaf && this.lastMarkdownLeaf.view instanceof MarkdownView) {
			return this.lastMarkdownLeaf.view;
		}
		this.findMarkdownLeaf();
		if (this.lastMarkdownLeaf && this.lastMarkdownLeaf.view instanceof MarkdownView) {
			return this.lastMarkdownLeaf.view;
		}
		return null;
	}

	refresh(): void {
		if (!this.listEl) return;
		const view = this.getView();
		if (!view?.file) {
			this.listEl.empty();
			return;
		}
		this.lastFile = view.file;
		const cache = this.app.metadataCache.getFileCache(view.file);
		const headings = (cache?.headings ?? []) as HeadingItem[];
		this.renderHeadings(headings);
	}

	private renderHeadings(headings: HeadingItem[]): void {
		if (!this.listEl) return;
		this.listEl.empty();

		if (headings.length === 0) {
			this.listEl.createDiv({ text: "No headings found", cls: "sf-outline-empty" });
			return;
		}

		const minLevel = Math.min(...headings.map((h) => h.level));

		for (const heading of headings) {
			const indent = heading.level - minLevel;
			const item = this.listEl.createDiv({
				cls: `sf-outline-item sf-outline-level-${heading.level}`,
			});
			item.setCssStyles({ paddingLeft: `${indent * 16}px` });

			const linkEl = item.createEl("span", { cls: "sf-outline-link" });
			linkEl.innerHTML = heading.heading;

			const line = heading.position.start.line;
			item.addEventListener("click", () => {
				this.scrollTo(line);
			});
		}
	}

	private scrollTo(line: number): void {
		const view = this.getView();
		if (!view) return;

		this.isScrolling = true;

		const mode = view.getMode();
		if (mode === "source") {
			view.editor.setCursor(line, 0);
			view.editor.scrollIntoView(
				{ from: { line, ch: 0 }, to: { line, ch: 0 } },
				true,
			);
		} else {
			const currentMode = view.currentMode as unknown as ScrollableMode;
			if (typeof currentMode.applyScroll === "function") {
				currentMode.applyScroll(line);
			}
		}

		setTimeout(() => {
			this.isScrolling = false;
		}, 300);
	}
}

export function registerOutlineView(app: App, plugin: import("obsidian").Plugin): void {
	plugin.registerView(OUTLINE_VIEW_TYPE, (leaf) => new OutlineView(leaf));

	plugin.addCommand({
		id: "open-outline",
		name: "Open outline panel",
		callback: () => {
			void activateOutlineView(app);
		},
	});
}

async function activateOutlineView(app: App): Promise<void> {
	const existing = app.workspace.getLeavesOfType(OUTLINE_VIEW_TYPE);
	if (existing.length > 0) {
		void app.workspace.revealLeaf(existing[0]);
		return;
	}

	const rightLeaf = app.workspace.getRightLeaf(false);
	if (rightLeaf) {
		await rightLeaf.setViewState({ type: OUTLINE_VIEW_TYPE, active: true });
		void app.workspace.revealLeaf(rightLeaf);
	}
}
