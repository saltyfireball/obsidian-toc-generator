import { MarkdownView, TFile } from "obsidian";
import type { App, Plugin } from "obsidian";

const FRONTMATTER_KEY = "prerender";

function shouldPrerender(app: App, file: TFile): boolean {
	const cache = app.metadataCache.getFileCache(file);
	const value: unknown = cache?.frontmatter?.[FRONTMATTER_KEY];
	return value === true || value === "true";
}

export function registerPrerender(app: App, plugin: Plugin): void {
	// Apply/remove prerender class on file open
	plugin.registerEvent(
		app.workspace.on("file-open", (file) => {
			const view = app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) return;

			if (file && shouldPrerender(app, file)) {
				view.contentEl.classList.add("sf-prerender");
			} else {
				view.contentEl.classList.remove("sf-prerender");
			}
		}),
	);

	plugin.addCommand({
		id: "prerender-current-note",
		name: "Force render all content in current note",
		checkCallback: (checking) => {
			const view = app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) return false;
			if (!checking) {
				view.contentEl.classList.toggle("sf-prerender");
			}
			return true;
		},
	});
}
