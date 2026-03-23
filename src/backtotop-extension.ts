import {
	ViewPlugin,
	WidgetType,
	Decoration,
	EditorView,
} from "@codemirror/view";
import type { DecorationSet, ViewUpdate } from "@codemirror/view";
import { StateField, StateEffect, RangeSetBuilder } from "@codemirror/state";
import type { Extension } from "@codemirror/state";

interface BackToTopConfig {
	enabled: boolean;
	minLevel: number;
	maxLevel: number;
}

export const setBackToTopConfig = StateEffect.define<BackToTopConfig>();

class BackToTopWidget extends WidgetType {
	toDOM(view: EditorView): HTMLElement {
		const btn = document.createElement("span");
		btn.className = "sf-back-to-toc sf-back-to-toc-cm";
		btn.textContent = "\u2191";
		btn.setAttribute("aria-label", "Back to table of contents");
		btn.addEventListener("mousedown", (e) => {
			e.preventDefault();
			e.stopPropagation();
			view.dispatch({
				effects: EditorView.scrollIntoView(0, { y: "start" }),
			});
		});
		return btn;
	}

	eq(): boolean {
		return true;
	}
}

const backToTopWidgetInstance = new BackToTopWidget();

const configField = StateField.define<BackToTopConfig>({
	create() {
		return { enabled: false, minLevel: 1, maxLevel: 6 };
	},
	update(value, tr) {
		for (const effect of tr.effects) {
			if (effect.is(setBackToTopConfig)) {
				return effect.value;
			}
		}
		return value;
	},
});

const HEADING_RE = /^(#{1,6})\s/;

function buildDecorations(view: EditorView): DecorationSet {
	const config = view.state.field(configField);
	if (!config.enabled) return Decoration.none;

	const builder = new RangeSetBuilder<Decoration>();
	const doc = view.state.doc;

	for (let i = 1; i <= doc.lines; i++) {
		const line = doc.line(i);
		const match = HEADING_RE.exec(line.text);
		if (!match) continue;

		const level = match[1].length;
		if (level < config.minLevel || level > config.maxLevel) continue;

		builder.add(
			line.to,
			line.to,
			Decoration.widget({ widget: backToTopWidgetInstance, side: 1 }),
		);
	}

	return builder.finish();
}

export function createBackToTopExtension(): Extension {
	const plugin = ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;

			constructor(view: EditorView) {
				this.decorations = buildDecorations(view);
			}

			update(update: ViewUpdate): void {
				if (
					update.docChanged ||
					update.viewportChanged ||
					update.transactions.some((tr) =>
						tr.effects.some((e) => e.is(setBackToTopConfig)),
					)
				) {
					this.decorations = buildDecorations(update.view);
				}
			}
		},
		{
			decorations: (v) => v.decorations,
		},
	);

	return [configField, plugin];
}
