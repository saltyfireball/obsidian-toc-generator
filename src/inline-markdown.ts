/**
 * Append a string of inline markdown text to `target` as DOM nodes.
 *
 * Supports a small subset suitable for heading text in the TOC and outline:
 *   - `code`                   -> <code>code</code>      (backslash-escape with \`)
 *   - **bold**                 -> <strong>bold</strong>
 *   - *italic*                 -> <em>italic</em>
 *   - ==marked==               -> <mark>marked</mark>
 *   - <mark class="...">x</mark> -> <mark class="...">x</mark>
 *     (attributes other than `class` are dropped; class is allow-listed to
 *     plain word/dash tokens to keep injection paths minimal)
 *
 * Uses textContent on created elements, so the inner content cannot
 * inject HTML.
 */

const CLASS_ATTR_RE = /\bclass\s*=\s*"([^"]*)"|\bclass\s*=\s*'([^']*)'/i;
const SAFE_CLASS_RE = /^[\w-]+(\s+[\w-]+)*$/;

function extractSafeClass(attrs: string): string | null {
	const match = CLASS_ATTR_RE.exec(attrs);
	if (!match) return null;
	const value = (match[1] ?? match[2] ?? "").trim();
	if (!value || !SAFE_CLASS_RE.test(value)) return null;
	return value;
}

export function appendInlineMarkdown(target: HTMLElement, text: string): void {
	// Order matters in the alternation: longer/more-specific patterns must
	// come first or they get partially consumed by shorter ones (e.g. ** vs *).
	const regex = /(\\`)|`([^`]+)`|<mark\b([^>]*)>([\s\S]*?)<\/mark>|\*\*([^*]+)\*\*|\*([^*]+)\*|==([^=]+)==/gi;
	let lastIndex = 0;
	let m: RegExpExecArray | null;

	while ((m = regex.exec(text)) !== null) {
		if (m.index > lastIndex) {
			target.appendChild(
				document.createTextNode(text.slice(lastIndex, m.index)),
			);
		}

		if (m[1]) {
			target.appendChild(document.createTextNode("`"));
		} else if (m[2] !== undefined) {
			const code = document.createElement("code");
			code.textContent = m[2];
			target.appendChild(code);
		} else if (m[3] !== undefined && m[4] !== undefined) {
			const mark = document.createElement("mark");
			const safeClass = extractSafeClass(m[3]);
			if (safeClass) mark.className = safeClass;
			// Recurse into the inner content so nested **bold** etc. inside
			// a <mark> still renders.
			appendInlineMarkdown(mark, m[4]);
			target.appendChild(mark);
		} else if (m[5] !== undefined) {
			const strong = document.createElement("strong");
			strong.textContent = m[5];
			target.appendChild(strong);
		} else if (m[6] !== undefined) {
			const em = document.createElement("em");
			em.textContent = m[6];
			target.appendChild(em);
		} else if (m[7] !== undefined) {
			const mark = document.createElement("mark");
			mark.textContent = m[7];
			target.appendChild(mark);
		}

		lastIndex = regex.lastIndex;
	}

	if (lastIndex < text.length) {
		target.appendChild(document.createTextNode(text.slice(lastIndex)));
	}
}
