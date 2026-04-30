/**
 * Append a string of inline markdown text to `target` as DOM nodes.
 *
 * Supports a small subset suitable for heading text in the TOC and outline:
 *   - `code`            -> <code>code</code>      (backslash-escape with \`)
 *   - **bold**          -> <strong>bold</strong>
 *   - *italic*          -> <em>italic</em>
 *   - ==marked==        -> <mark>marked</mark>
 *
 * Uses textContent on each created element, so nothing is HTML-injected.
 */
export function appendInlineMarkdown(target: HTMLElement, text: string): void {
	const regex = /(\\`)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*|==([^=]+)==/g;
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
		} else if (m[3] !== undefined) {
			const strong = document.createElement("strong");
			strong.textContent = m[3];
			target.appendChild(strong);
		} else if (m[4] !== undefined) {
			const em = document.createElement("em");
			em.textContent = m[4];
			target.appendChild(em);
		} else if (m[5] !== undefined) {
			const mark = document.createElement("mark");
			mark.textContent = m[5];
			target.appendChild(mark);
		}

		lastIndex = regex.lastIndex;
	}

	if (lastIndex < text.length) {
		target.appendChild(document.createTextNode(text.slice(lastIndex)));
	}
}
