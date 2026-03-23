import { App, MarkdownView, Plugin, TFile } from "obsidian";
import type { TocPluginSettings } from "./main";

// Transition duration in ms
const TOC_TRANSITION_MS = 250;

type TocPluginContext = Plugin & {
	app: App;
	settings: TocPluginSettings;
};

// Figlet options for TOC (using figlet- prefix in config)
type TocFigletConfig = {
	font?: string;
	color?: string;
	colors?: string[];
	fontSize?: number;
	lineHeight?: number;
	centered?: boolean;
	opacity?: number;
	multiCenter?: boolean;
	text?: string; // The text to render (after ---)
};

type TocConfig = {
	title?: string;
	minLevel?: number;
	maxLevel?: number;
	numbered?: boolean;
	shapes?: string[];
	remove_chars?: string[];
	backtotop?: boolean;
	figlet?: TocFigletConfig;
};

function getDefaults(plugin: TocPluginContext) {
	const s = plugin.settings;
	return {
		title: s.defaultTitle,
		minLevel: s.defaultMinLevel,
		maxLevel: s.defaultMaxLevel,
		numbered: s.defaultNumbered,
		shapes: [...s.defaultShapes],
		remove_chars: [] as string[],
		figlet: undefined as TocFigletConfig | undefined,
	};
}

function getTocTransitionCss(): string {
	return `
.sf-toc {
	transition: opacity ${TOC_TRANSITION_MS}ms cubic-bezier(0.4, 0, 0.2, 1);
}
.sf-toc.sf-toc-updating {
	opacity: 0;
}
`;
}

let tocStyleSheet: CSSStyleSheet | null = null;

function setStyleContent(css: string): CSSStyleSheet {
	if (!tocStyleSheet) {
		tocStyleSheet = new CSSStyleSheet();
		document.adoptedStyleSheets = [...document.adoptedStyleSheets, tocStyleSheet];
	}
	tocStyleSheet.replaceSync(css);
	return tocStyleSheet;
}


export function registerToc(plugin: TocPluginContext) {
	// Inject transition styles
	setStyleContent(getTocTransitionCss());

	plugin.registerMarkdownCodeBlockProcessor(
		plugin.settings.codeBlockId,
		async (source, el, ctx) => {
			try {
				const config = parseTocConfig(source, plugin);
				const sourcePath = ctx.sourcePath;
				el.empty();
				el.addClass("sf-toc-block");
				const wrapper = el.createDiv({ cls: "sf-toc" });
				if (sourcePath) {
					wrapper.dataset.sfTocPath = sourcePath;
				}
				wrapper.dataset.sfTocConfig = JSON.stringify(config);
				await renderToc(wrapper, plugin, config, sourcePath);

				if (config.backtotop) {
					const normalized = normalizeConfig(config, plugin);
					wrapper.dataset.sfTocBacktotop = "true";
					wrapper.dataset.sfTocBttMin = String(normalized.minLevel);
					wrapper.dataset.sfTocBttMax = String(normalized.maxLevel);

					// Add class to persistent parent so CSS works even when TOC is lazy-unloaded
					// Use workspace API since el isn't in DOM yet
					const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
					if (view) {
						view.contentEl.classList.add("sf-has-backtotop");
						view.contentEl.setAttribute("data-sf-btt-min", String(normalized.minLevel));
						view.contentEl.setAttribute("data-sf-btt-max", String(normalized.maxLevel));
					}
				}
			} catch (err: unknown) {
				console.error("TOC render error:", err);
				el.empty();
				el.createDiv({ cls: "sf-toc-error", text: `TOC Error: ${String(err)}` });
			}
		},
	);

	// Clean up backtotop class when switching files
	plugin.registerEvent(
		plugin.app.workspace.on("active-leaf-change", () => {
			document.querySelectorAll(".sf-has-backtotop").forEach((el) => {
				el.classList.remove("sf-has-backtotop");
				el.removeAttribute("data-sf-btt-min");
				el.removeAttribute("data-sf-btt-max");
			});
		}),
	);

	plugin.registerEvent(
		plugin.app.metadataCache.on("changed", (file) => {
			if (!file) return;
			refreshTocForPath(plugin, file.path);
		}),
	);

	plugin.registerEvent(
		plugin.app.workspace.on("file-open", (file) => {
			if (!file) return;
			refreshTocForPath(plugin, file.path);
		}),
	);

	// Back-to-top: MutationObserver adds hidden buttons to ALL headings as they appear.
	// Visibility is controlled via CSS :has() based on .sf-toc[data-sf-toc-backtotop].
	// This catches lazy-rendered headings that appear on scroll.
	const addButtonToHeading = (headingEl: Element) => {
		if (headingEl.querySelector(".sf-back-to-toc")) return;
		if (headingEl.closest(".sf-toc")) return;

		const btn = document.createElement("span");
		btn.className = "sf-back-to-toc";
		btn.setAttribute("aria-label", "Back to table of contents");
		btn.textContent = "\u2191";
		btn.addEventListener("click", (e) => {
			e.preventDefault();
			e.stopPropagation();

			const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) return;
			scrollInView(view, 0);
		});
		headingEl.appendChild(btn);
	};

	const processNode = (node: Node) => {
		if (!(node instanceof HTMLElement)) return;
		// Check if the node itself is a heading
		if (/^H[1-6]$/.test(node.tagName)) {
			addButtonToHeading(node);
		}
		// Check children for headings
		const headings = node.querySelectorAll("h1, h2, h3, h4, h5, h6");
		headings.forEach(addButtonToHeading);
	};

	const headingObserver = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			for (const added of Array.from(mutation.addedNodes)) {
				processNode(added);
			}
		}
	});

	headingObserver.observe(document.body, { childList: true, subtree: true });

	// Process any headings already in the DOM
	document.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach(addButtonToHeading);

	plugin.register(() => {
		headingObserver.disconnect();
	});

	plugin.addCommand({
		id: "debug-backtotop",
		name: "Debug: count back-to-top buttons",
		callback: () => {
			const allHeadings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
			const withBtn = document.querySelectorAll("h1 .sf-back-to-toc, h2 .sf-back-to-toc, h3 .sf-back-to-toc, h4 .sf-back-to-toc, h5 .sf-back-to-toc, h6 .sf-back-to-toc");
			const parents = document.querySelectorAll(".sf-has-backtotop");
			const visibleBtns = document.querySelectorAll(".sf-back-to-toc");
			let visibleCount = 0;
			visibleBtns.forEach((b) => {
				const style = getComputedStyle(b);
				if (style.display !== "none") visibleCount++;
			});
			console.debug(`[BTT Debug] Total headings: ${allHeadings.length}, With button: ${withBtn.length}, Visible buttons: ${visibleCount}, Parents with sf-has-backtotop: ${parents.length}`);
			parents.forEach((p, i) => {
				console.debug(`[BTT Debug] Parent ${i}: min=${p.getAttribute("data-sf-btt-min")} max=${p.getAttribute("data-sf-btt-max")} class=${p.className.substring(0, 80)}`);
			});
		},
	});

	// Cleanup transition styles on unload
	plugin.register(() => {
		if (tocStyleSheet) {
			document.adoptedStyleSheets = document.adoptedStyleSheets.filter(s => s !== tocStyleSheet);
			tocStyleSheet = null;
		}
	});
}

function refreshTocForPath(plugin: TocPluginContext, path: string) {
	if (!path) return;
	const selector = `.sf-toc[data-sf-toc-path="${CSS.escape(path)}"]`;
	const tocBlocks = document.querySelectorAll<HTMLElement>(selector);
	tocBlocks.forEach((block) => {
		const config = parseConfigFromEl(block);

		// Get current headings and create a signature to detect changes
		const headings = getHeadings(plugin, path);
		const normalizedConfig = normalizeConfig(config, plugin);
		const filtered = headings.filter(
			(h) => h.level >= normalizedConfig.minLevel && h.level <= normalizedConfig.maxLevel,
		);
		const headingsSignature = JSON.stringify(filtered.map((h) => `${h.level}:${h.heading}`));

		// Compare with stored signature - skip render if unchanged
		const storedSignature = block.dataset.sfTocHeadings;
		if (storedSignature === headingsSignature) {
			return; // No changes, skip re-render
		}

		// Store new signature and animate the update
		block.dataset.sfTocHeadings = headingsSignature;

		// Fade out, re-render, then fade in
		block.classList.add("sf-toc-updating");
		setTimeout(() => {
			void renderToc(block, plugin, config, path).then(() => {
				block.classList.remove("sf-toc-updating");
			});
		}, TOC_TRANSITION_MS);
	});
}

function parseConfigFromEl(el: HTMLElement): TocConfig {
	const raw = el.dataset.sfTocConfig;
	if (!raw) return {};
	try {
		return JSON.parse(raw) as TocConfig;
	} catch {
		return {};
	}
}

async function renderToc(
	container: HTMLElement,
	plugin: TocPluginContext,
	rawConfig: TocConfig,
	sourcePath?: string,
) {
	container.empty();
	const config = normalizeConfig(rawConfig, plugin);

	// Render figlet text above the title if configured
	if (config.figlet?.text) {
		const figletContainer = container.createDiv({ cls: "sf-toc-figlet" });
		await renderFigletForToc(figletContainer, config.figlet);
	}

	if (config.title) {
		container.createDiv({ cls: "sf-toc-title", text: config.title });
	}

	const headings = getHeadings(plugin, sourcePath);
	const filtered = headings.filter(
		(heading) =>
			heading.level >= config.minLevel &&
			heading.level <= config.maxLevel,
	);

	// Store headings signature for change detection (prevents unnecessary re-renders)
	const headingsSignature = JSON.stringify(filtered.map((h) => `${h.level}:${h.heading}`));
	container.dataset.sfTocHeadings = headingsSignature;

	if (filtered.length === 0) {
		container.createDiv({
			cls: "sf-toc-empty",
			text: "No headings found.",
		});
		return;
	}

	const listTag: "ul" | "ol" = "ul";
	const hideMarkers = config.numbered || config.shapes.length > 0;
	const rootList = createTocList(container, listTag, hideMarkers);

	const stack: {
		level: number;
		list: HTMLOListElement | HTMLUListElement;
	}[] = [{ level: config.minLevel, list: rootList }];

	let currentLevel = config.minLevel;
	let lastItem: HTMLLIElement | null = null;
	let shapeCounter = 0;
	const counters: number[] = [];

	for (const heading of filtered) {
		while (heading.level > currentLevel) {
			if (!lastItem) break;
			const nested = createTocList(lastItem, listTag, hideMarkers);
			stack.push({ level: currentLevel + 1, list: nested });
			currentLevel += 1;
		}

		while (heading.level < currentLevel && stack.length > 1) {
			stack.pop();
			currentLevel -= 1;
		}

		const currentList = stack[stack.length - 1];
		if (!currentList) {
			continue;
		}
		const targetList = currentList.list;
		const item = targetList.createEl("li", { cls: "sf-toc-item" });
		item.dataset.level = String(heading.level);

		if (config.numbered) {
			const levelIndex = Math.max(0, heading.level - config.minLevel);
			while (counters.length <= levelIndex) {
				counters.push(0);
			}
			counters.splice(levelIndex + 1);
			counters[levelIndex] = (counters[levelIndex] ?? 0) + 1;
			const numberText = counters.join(".");
			item.createSpan({ cls: "sf-toc-number", text: `${numberText} ` });
		} else if (config.shapes.length > 0) {
			const shapeIndex = shapeCounter % config.shapes.length;
			item.dataset.shape = config.shapes[shapeIndex];
			shapeCounter += 1;
		}

		const displayHeading = stripChars(heading.heading, config.remove_chars);
		const headingLine = heading.position?.start?.line ?? -1;
		const tocSourcePath = sourcePath;

		const link = item.createEl("a", {
			cls: "sf-toc-link",
			text: displayHeading,
		});
		const headingText = heading.heading;
		link.addEventListener("click", (e: MouseEvent) => {
			e.preventDefault();

			const activeView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
			const isEmbed = tocSourcePath && activeView?.file?.path !== tocSourcePath;

			if (isEmbed) {
				// Find the heading inside the embed container in the parent DOM
				const tocEl = link.closest(".sf-toc-block");
				const embedEl = tocEl?.closest(".internal-embed") ?? tocEl?.closest(".markdown-embed");
				const searchRoot = embedEl?.parentElement ?? activeView?.contentEl;
				if (searchRoot) {
					const headingEls = searchRoot.querySelectorAll("h1, h2, h3, h4, h5, h6");
					for (const el of Array.from(headingEls)) {
						const dh = el.getAttribute("data-heading");
						const tc = el.textContent?.trim() ?? "";
						if (dh === headingText || tc === headingText) {
							el.scrollIntoView({ behavior: "smooth", block: "start" });
							return;
						}
					}
				}
				return;
			}

			if (!activeView || headingLine < 0) return;
			scrollInView(activeView, headingLine);
		});

		lastItem = item;
	}
}

function scrollInView(view: MarkdownView, line: number): void {
	const mode = view.getMode();
	if (mode === "source") {
		view.editor.setCursor(line, 0);
		view.editor.scrollIntoView(
			{ from: { line, ch: 0 }, to: { line, ch: 0 } },
			true,
		);
	} else {
		const currentMode = view.currentMode as unknown as { applyScroll?: (line: number) => void };
		if (typeof currentMode.applyScroll === "function") {
			currentMode.applyScroll(line);
		}
	}
}

/**
 * Render figlet text for TOC (fills the provided container)
 */
async function renderFigletForToc(
	container: HTMLElement,
	figletConfig: TocFigletConfig,
): Promise<void> {
	if (!figletConfig.text) return;

	const figletAPI = (window as unknown as Record<string, unknown>).figletAPI as {
		generateText(text: string, font: string): Promise<string>;
		createHtml(text: string, options: Record<string, unknown>): string;
		defaultGradientColors: string[];
	} | undefined;
	if (!figletAPI) return;

	const font = figletConfig.font || "Standard";

	// Handle color/colors - support "rainbow" keyword
	let colors: string[] | undefined;
	if (figletConfig.colors && figletConfig.colors.length > 0) {
		colors = figletConfig.colors;
	} else if (figletConfig.color === "rainbow" || figletConfig.color === "gradient") {
		colors = figletAPI.defaultGradientColors;
	}

	const styleOptions: Record<string, unknown> = {
		color: colors ? undefined : figletConfig.color,
		colors: colors,
		fontSize: figletConfig.fontSize ?? 10,
		lineHeight: figletConfig.lineHeight ?? 1,
		centered: figletConfig.centered ?? true,
		opacity: figletConfig.opacity,
	};

	try {
		// Multi-center mode: each line rendered and centered independently
		if (figletConfig.multiCenter) {
			const textLines = figletConfig.text.split("\n").filter((line) => line.trim().length > 0);
			const htmlParts: string[] = [];

			for (const line of textLines) {
				const figletText = await figletAPI.generateText(line.trim(), font);
				const html = figletAPI.createHtml(figletText, styleOptions);
				htmlParts.push(html);
			}

			container.empty();
			const parsed = new DOMParser().parseFromString(
				`<div class="sfb-figlet-multi-center">${htmlParts.join("")}</div>`,
				"text/html",
			);
			const wrapper = parsed.body.firstElementChild;
			if (wrapper) {
				container.appendChild(document.importNode(wrapper, true));
			}
		} else {
			const figletText = await figletAPI.generateText(figletConfig.text, font);
			const html = figletAPI.createHtml(figletText, styleOptions);
			container.empty();
			const parsed = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
			const nodes = parsed.body.firstElementChild?.childNodes;
			if (nodes) {
				for (const node of Array.from(nodes)) {
					container.appendChild(document.importNode(node, true));
				}
			}
		}
	} catch (err) {
		console.error("Error rendering figlet for TOC:", err);
	}
}

function createTocList(
	parent: HTMLElement,
	tag: "ol" | "ul",
	hideMarkers: boolean,
) {
	const list = parent.createEl(tag, { cls: "sf-toc-list" });
	if (hideMarkers) {
		list.addClass("sf-toc-list-unmarked");
	}
	return list;
}

interface HeadingEntry {
	heading: string;
	level: number;
	position?: { start: { line: number; col: number; offset: number } };
}

function getHeadings(plugin: TocPluginContext, sourcePath?: string): HeadingEntry[] {
	if (!sourcePath) return [];
	const file = plugin.app.vault.getAbstractFileByPath(sourcePath);
	if (!(file instanceof TFile)) return [];
	const cache = plugin.app.metadataCache.getFileCache(file);
	return (cache?.headings ?? []) as HeadingEntry[];
}

type NormalizedTocConfig = Required<Omit<TocConfig, "figlet">> & {
	figlet?: TocFigletConfig;
};

function normalizeConfig(config: TocConfig, plugin: TocPluginContext): NormalizedTocConfig {
	const defaults = getDefaults(plugin);
	const normalized: NormalizedTocConfig = {
		title: config.title ?? defaults.title,
		minLevel: clampLevel(config.minLevel ?? defaults.minLevel),
		maxLevel: clampLevel(config.maxLevel ?? defaults.maxLevel),
		numbered: config.numbered ?? defaults.numbered,
		shapes: Array.isArray(config.shapes)
			? config.shapes
			: defaults.shapes,
		remove_chars: Array.isArray(config.remove_chars)
			? config.remove_chars
			: defaults.remove_chars,
		backtotop: config.backtotop ?? false,
		figlet: config.figlet,
	};

	if (normalized.minLevel > normalized.maxLevel) {
		const temp = normalized.minLevel;
		normalized.minLevel = normalized.maxLevel;
		normalized.maxLevel = temp;
	}

	return normalized;
}

function stripChars(text: string, chars: string[]) {
	if (!chars || chars.length === 0) return text;
	const escaped = chars
		.filter((char) => char.length > 0)
		.map((char) => char.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&"));
	if (escaped.length === 0) return text;
	const pattern = new RegExp(`[${escaped.join("")}]`, "g");
	return text.replace(pattern, "");
}

function clampLevel(level: number) {
	if (level < 1) return 1;
	if (level > 6) return 6;
	return level;
}

/**
 * Parse color list from string (space or comma separated)
 */
function parseColors(value: string): string[] {
	return value
		.split(/[,\s]+/)
		.map((c) => c.trim())
		.filter((c) => c.length > 0);
}

function parseTocConfig(source: string, plugin: TocPluginContext): TocConfig {
	const config: TocConfig = {};
	const figletConfig: TocFigletConfig = {};
	const lines = source.split(/\r?\n/);

	// Find the --- separator for figlet text
	const separatorLineIndex = lines.findIndex((line) => line.trim() === "---");
	const configLines = separatorLineIndex > 0 ? lines.slice(0, separatorLineIndex) : lines;

	for (const line of configLines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const separatorIndex = trimmed.indexOf(":");
		if (separatorIndex === -1) continue;
		const key = trimmed.slice(0, separatorIndex).trim();
		const rawValue = trimmed.slice(separatorIndex + 1).trim();
		if (!key || !rawValue) continue;

		// Handle figlet-* prefixed options
		if (key.startsWith("figlet-")) {
			const figletKey = key.slice(7).toLowerCase().replace(/-/g, ""); // Remove "figlet-" prefix and normalize
			const value = parseConfigValue(rawValue);

			switch (figletKey) {
				case "font":
					figletConfig.font = String(value);
					break;
				case "color":
					figletConfig.color = String(value);
					break;
				case "colors":
					figletConfig.colors = typeof value === "string" ? parseColors(value) : value as string[];
					break;
				case "fontsize":
					figletConfig.fontSize = typeof value === "number" ? value : parseFloat(String(value));
					break;
				case "lineheight":
					figletConfig.lineHeight = typeof value === "number" ? value : parseFloat(String(value));
					break;
				case "centered":
					figletConfig.centered = value === true || String(value).toLowerCase() === "true";
					break;
				case "opacity":
					figletConfig.opacity = typeof value === "number" ? value : parseFloat(String(value));
					break;
				case "multicenter":
					figletConfig.multiCenter = value === true || String(value).toLowerCase() === "true";
					break;
			}
		} else {
			// Regular TOC config
			(config as Record<string, unknown>)[key] = parseConfigValue(rawValue);
		}
	}

	// Extract figlet text after ---
	if (separatorLineIndex > 0 && separatorLineIndex < lines.length - 1) {
		const figletText = lines.slice(separatorLineIndex + 1).join("\n").trim();
		if (figletText) {
			figletConfig.text = figletText;
		}
	}

	// Only add figlet config if there's text to render
	if (figletConfig.text) {
		config.figlet = figletConfig;
	}

	return config;
}

function parseConfigValue(raw: string): string | number | boolean | string[] {
	if (raw.startsWith("[") || raw.startsWith("{")) {
		try {
			return JSON.parse(raw) as string | number | boolean | string[];
		} catch {
			return raw;
		}
	}
	const lowered = raw.toLowerCase();
	if (lowered === "true") return true;
	if (lowered === "false") return false;
	if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
	return raw.replace(/^['"]|['"]$/g, "");
}
