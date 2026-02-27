import { Setting } from "obsidian";
import type TocGeneratorPlugin from "./main";

interface RenderSettingsTabArgs {
	plugin: TocGeneratorPlugin;
	containerEl: HTMLElement;
}

export function renderSettingsTab({ plugin, containerEl }: RenderSettingsTabArgs): void {
	new Setting(containerEl).setName("Table of contents").setHeading();

	// Enabled toggle
	new Setting(containerEl)
		.setName("Enable table of contents generator")
		.setDesc("Toggle the table of contents code block processor. Changing this requires a plugin reload.")
		.addToggle((toggle) => {
			toggle
				.setValue(plugin.settings.enabled)
				.onChange(async (value) => {
					plugin.settings.enabled = value;
					await plugin.saveSettings();
				});
		});

	// Code Block ID
	new Setting(containerEl).setName("Code block").setHeading();

	new Setting(containerEl)
		.setName("Code block language identifier")
		.setDesc("The language identifier for table of contents code blocks. Changing this requires a plugin reload.")
		.addText((text) => {
			text
				.setPlaceholder("My-toc")
				.setValue(plugin.settings.codeBlockId)
				.onChange(async (value) => {
					const trimmed = value.trim();
					if (trimmed.length > 0) {
						plugin.settings.codeBlockId = trimmed;
						await plugin.saveSettings();
					}
				});
			text.inputEl.addClass("tg-input-width");
		});

	// Default Values
	new Setting(containerEl).setName("Default values").setHeading();
	containerEl.createEl("p", {
		text: "These defaults apply when a table of contents code block does not specify its own value.",
		cls: "tg-hint",
	});

	new Setting(containerEl)
		.setName("Default title")
		.setDesc("Title displayed above the table of contents. Leave empty for no title.")
		.addText((text) => {
			text
				.setPlaceholder("(none)")
				.setValue(plugin.settings.defaultTitle)
				.onChange(async (value) => {
					plugin.settings.defaultTitle = value;
					await plugin.saveSettings();
				});
			text.inputEl.addClass("tg-input-width");
		});

	new Setting(containerEl)
		.setName("Default min heading level")
		.setDesc("Minimum heading level to include (1 = h1, 6 = h6)")
		.addDropdown((dropdown) => {
			for (let i = 1; i <= 6; i++) {
				dropdown.addOption(String(i), `H${i}`);
			}
			dropdown
				.setValue(String(plugin.settings.defaultMinLevel))
				.onChange(async (value) => {
					plugin.settings.defaultMinLevel = parseInt(value, 10);
					await plugin.saveSettings();
				});
		});

	new Setting(containerEl)
		.setName("Default max heading level")
		.setDesc("Maximum heading level to include (1 = h1, 6 = h6)")
		.addDropdown((dropdown) => {
			for (let i = 1; i <= 6; i++) {
				dropdown.addOption(String(i), `H${i}`);
			}
			dropdown
				.setValue(String(plugin.settings.defaultMaxLevel))
				.onChange(async (value) => {
					plugin.settings.defaultMaxLevel = parseInt(value, 10);
					await plugin.saveSettings();
				});
		});

	new Setting(containerEl)
		.setName("Default numbered")
		.setDesc("Use hierarchical numbering (1, 1.1, 1.2, 2, ...) by default")
		.addToggle((toggle) => {
			toggle
				.setValue(plugin.settings.defaultNumbered)
				.onChange(async (value) => {
					plugin.settings.defaultNumbered = value;
					await plugin.saveSettings();
				});
		});

	new Setting(containerEl)
		.setName("Default shapes")
		.setDesc("Comma-separated list of shapes to cycle through as bullet markers (e.g. >, -, *). Leave empty for standard bullets.")
		.addText((text) => {
			text
				.setPlaceholder("(none)")
				.setValue(plugin.settings.defaultShapes.join(", "))
				.onChange(async (value) => {
					const shapes = value
						.split(",")
						.map((s) => s.trim())
						.filter((s) => s.length > 0);
					plugin.settings.defaultShapes = shapes;
					await plugin.saveSettings();
				});
			text.inputEl.addClass("tg-input-width");
		});

	// Usage Examples
	const codeBlockId = plugin.settings.codeBlockId;

	new Setting(containerEl).setName("Usage examples").setHeading();
	containerEl.createEl("p", {
		text: `Add a ${codeBlockId} code block to any note to generate a table of contents from that note's headings.`,
		cls: "tg-hint",
	});

	const exampleContainer = containerEl.createDiv("tg-examples");

	const createCopyableExample = (label: string, code: string) => {
		exampleContainer.createEl("p", { text: label, cls: "tg-hint" });
		const wrapper = exampleContainer.createDiv("tg-code-wrapper");
		const pre = wrapper.createEl("pre", { cls: "tg-code-example" });
		pre.createEl("code", { text: code });

		const copyBtn = wrapper.createEl("button", {
			cls: "tg-copy-btn",
			attr: { type: "button", title: "Copy to clipboard" },
		});
		copyBtn.textContent = "Copy";
		copyBtn.addEventListener("click", () => {
			void navigator.clipboard.writeText(code);
			copyBtn.textContent = "Copied!";
			setTimeout(() => {
				copyBtn.textContent = "Copy";
			}, 1500);
		});
	};

	createCopyableExample(
		"Basic TOC (all headings):",
		`\`\`\`${codeBlockId}\n\`\`\``,
	);

	createCopyableExample(
		"TOC with title and level filtering:",
		`\`\`\`${codeBlockId}\ntitle: Table of Contents\nminLevel: 2\nmaxLevel: 4\n\`\`\``,
	);

	createCopyableExample(
		"Numbered TOC:",
		`\`\`\`${codeBlockId}\ntitle: Contents\nnumbered: true\nminLevel: 2\n\`\`\``,
	);

	createCopyableExample(
		"TOC with custom shapes:",
		`\`\`\`${codeBlockId}\nshapes: [">", "-", "*"]\n\`\`\``,
	);

	createCopyableExample(
		"TOC with character removal:",
		`\`\`\`${codeBlockId}\nremove_chars: ["#", "@"]\n\`\`\``,
	);

	createCopyableExample(
		"TOC with Figlet ASCII art title (requires Figlet Generator plugin):",
		`\`\`\`${codeBlockId}\nminLevel: 2\nfiglet-font: Banner\nfiglet-color: rainbow\n---\nContents\n\`\`\``,
	);

	// Options Reference Table
	const optionsTable = containerEl.createDiv("tg-options-table");
	new Setting(optionsTable).setName("Available options").setHeading();
	const table = optionsTable.createEl("table");
	const headerRow = table.createEl("tr");
	headerRow.createEl("th", { text: "Option" });
	headerRow.createEl("th", { text: "Description" });
	headerRow.createEl("th", { text: "Default" });

	const optionsList = [
		["title", "Text displayed above the TOC", plugin.settings.defaultTitle || "(none)"],
		["minLevel", "Minimum heading level to include (1-6)", String(plugin.settings.defaultMinLevel)],
		["maxLevel", "Maximum heading level to include (1-6)", String(plugin.settings.defaultMaxLevel)],
		["numbered", "Use hierarchical numbering (true/false)", String(plugin.settings.defaultNumbered)],
		["shapes", "JSON array of bullet shapes to cycle through", plugin.settings.defaultShapes.length > 0 ? JSON.stringify(plugin.settings.defaultShapes) : "(none)"],
		["remove_chars", "JSON array of characters to strip from headings", "(none)"],
		["figlet-font", "Figlet font name for ASCII art title", "Standard"],
		["figlet-color", "Color for figlet text, or 'rainbow'", "inherit"],
		["figlet-colors", "Space-separated custom gradient colors", "(none)"],
		["figlet-font-size", "Font size in pixels for figlet output", "10"],
		["figlet-line-height", "Line height for figlet output", "1"],
		["figlet-centered", "Center figlet output (true/false)", "true"],
		["figlet-opacity", "Figlet text opacity (0-1)", "1"],
		["figlet-multi-center", "Center each figlet line independently", "false"],
	];

	optionsList.forEach(([opt, desc, def]) => {
		const row = table.createEl("tr");
		row.createEl("td", { text: opt, cls: "tg-code" });
		row.createEl("td", { text: desc });
		row.createEl("td", { text: def, cls: "tg-code" });
	});
}
