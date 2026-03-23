import { MarkdownView, TFile } from "obsidian";
import type { App, Plugin } from "obsidian";

const FRONTMATTER_KEY = "prerender";

function shouldPrerender(app: App, file: TFile): boolean {
	const cache = app.metadataCache.getFileCache(file);
	const value: unknown = cache?.frontmatter?.[FRONTMATTER_KEY];
	return value === true || value === "true";
}

function getScrollElement(view: MarkdownView): HTMLElement | null {
	const mode = view.getMode();
	if (mode === "preview") {
		return view.contentEl.querySelector<HTMLElement>(".markdown-preview-view");
	}
	// Live preview / source mode uses cm-scroller
	return view.contentEl.querySelector<HTMLElement>(".cm-scroller");
}

function prerenderView(view: MarkdownView): void {
	const scrollEl = getScrollElement(view);
	if (!scrollEl) return;

	const originalScroll = scrollEl.scrollTop;
	const scrollHeight = scrollEl.scrollHeight;
	const step = scrollEl.clientHeight;

	if (scrollHeight <= step) return;

	let position = 0;

	const scrollStep = () => {
		position += step;
		if (position < scrollHeight) {
			scrollEl.scrollTop = position;
			requestAnimationFrame(scrollStep);
		} else {
			requestAnimationFrame(() => {
				scrollEl.scrollTop = originalScroll;
			});
		}
	};

	requestAnimationFrame(scrollStep);
}

export function registerPrerender(app: App, plugin: Plugin): void {
	plugin.registerEvent(
		app.workspace.on("file-open", (file) => {
			if (!file) return;
			if (!shouldPrerender(app, file)) return;

			setTimeout(() => {
				const view = app.workspace.getActiveViewOfType(MarkdownView);
				if (view?.file?.path === file.path) {
					prerenderView(view);
				}
			}, 200);
		}),
	);

	plugin.addCommand({
		id: "prerender-current-note",
		name: "Force render all content in current note",
		checkCallback: (checking) => {
			const view = app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) return false;
			if (!checking) {
				prerenderView(view);
			}
			return true;
		},
	});
}
