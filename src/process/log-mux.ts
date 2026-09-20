/**
 * Splits a child process stream into whole lines.
 *
 * A child writes in chunks that do not respect line boundaries: a single TypeScript
 * diagnostic can arrive split across two `data` events. Prefixing raw chunks
 * would tear messages in half and interleave them with other tasks, which is
 * exactly what makes unified logs unreadable.
 */
export function createLineSplitter(onLine: (line: string) => void): {
	push(chunk: Buffer | string): void;
	flush(): void;
} {
	let buffer = "";

	return {
		push(chunk) {
			buffer += chunk.toString();

			let newline = buffer.indexOf("\n");
			while (newline !== -1) {
				const line = buffer.slice(0, newline).replace(/\r$/, "");
				buffer = buffer.slice(newline + 1);
				onLine(line);
				newline = buffer.indexOf("\n");
			}
		},
		flush() {
			if (buffer.length === 0) return;
			const line = buffer.replace(/\r$/, "");
			buffer = "";
			onLine(line);
		},
	};
}
