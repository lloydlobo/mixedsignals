#!/usr/bin/env node
// NOTE:
//     Invoke with the experimental flag until you add it to package.json:
//         node --experimental-strip-types scripts/non-unicode-scanner.mts
//         node --experimental-strip-types scripts/non-unicode-scanner.mts main.js index.html style.css
//     Or, in package.json:
//         "scripts": {
//           "scan": "node --experimental-strip-types scripts/non-unicode-scanner.mts"
//         }
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";

type Finding =
	| {
			kind: "invalid-utf8";
			file: string;
			line: number;
			col: number;
			detail: string;
	  }
	| {
			kind: "char";
			file: string;
			line: number;
			col: number;
			cp: number;
			ch: string;
			detail: string;
	  };

const args = process.argv.slice(2);

const FLAGS = new Set(args.filter(x => x.startsWith("--")));

const INPUT_FILES = args.filter(x => !x.startsWith("--"));

const ASCII_ONLY = FLAGS.has("--ascii-only");
const JSON_MODE = FLAGS.has("--json");

const decoder = new TextDecoder("utf-8", { fatal: true });

const IGNORE_NAMES = new Set([".DS_Store"]);

const IGNORE_EXTS = new Set([".swp", ".swo", ".tmp", ".bak", ".cache", ".pyc", ".lock"]);

const BINARY_EXTS = new Set([
	".png",
	".jpg",
	".jpeg",
	".gif",
	".webp",
	".avif",
	".ico",
	".mp3",
	".wav",
	".ogg",
	".flac",
	".m4a",
	".mp4",
	".mov",
	".webm",
	".woff",
	".woff2",
	".ttf",
	".otf",
	".zip",
	".gz",
	".bz2",
	".7z",
	".rar",
	".pdf",
	".exe",
	".dll",
	".so",
]);

function shouldScan(file: string) {
	const name = basename(file);
	const ext = extname(file).toLowerCase();

	if (IGNORE_NAMES.has(name)) return false;

	if (IGNORE_EXTS.has(ext)) return false;

	if (BINARY_EXTS.has(ext)) return false;

	if (name.startsWith(".") && name.endsWith(".swp")) return false;

	return true;
}

function collectFiles(): string[] {
	if (INPUT_FILES.length) return INPUT_FILES.filter(shouldScan);

	const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
		encoding: "buffer",
	});

	return out.toString().split("\0").filter(Boolean).filter(shouldScan);
}

function hex(cp: number) {
	return cp
		.toString(16)
		.toUpperCase()
		.padStart(cp <= 0xffff ? 4 : 6, "0");
}

function escaped(ch: string, cp: number) {
	if (cp === 9) return "\\t";
	if (cp === 10) return "\\n";
	if (cp === 13) return "\\r";
	if (cp === 32) return "␠";

	if (cp >= 0x21 && cp <= 0x7e) return ch;

	if (cp <= 0xffff) return `\\u${hex(cp)}`;

	return `\\u{${hex(cp)}}`;
}

function isAsciiControl(cp: number) {
	return (cp <= 0x1f || cp === 0x7f) && cp !== 9 && cp !== 10 && cp !== 13;
}

function suspicious(cp: number) {
	if (ASCII_ONLY) return cp > 127;

	if (isAsciiControl(cp)) return true;

	if (cp >= 0x80 && cp <= 0x9f) return true;

	if (cp === 0xa0 || cp === 0xad) return true;

	// zero-width, bidi,
	// invisible formatting
	if ((cp >= 0x200b && cp <= 0x200f) || (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2060 && cp <= 0x206f) || cp === 0xfeff || cp === 0x061c || cp === 0x034f)
		return true;

	// private use
	if (cp >= 0xe000 && cp <= 0xf8ff) return true;

	// noncharacters
	if ((cp >= 0xfdd0 && cp <= 0xfdef) || (cp & 0xfffe) === 0xfffe) return true;

	// surrogate range
	if (cp >= 0xd800 && cp <= 0xdfff) return true;

	return false;
}

function scan(file: string): Finding[] {
	let buf: Buffer;

	try {
		buf = readFileSync(file);
	} catch {
		return [];
	}

	let text: string;

	try {
		text = decoder.decode(buf);
	} catch {
		return [
			{
				kind: "invalid-utf8",
				file,
				line: 1,
				col: 1,
				detail: "file is not valid UTF-8",
			},
		];
	}

	const out: Finding[] = [];

	let line = 1;
	let col = 1;

	for (let i = 0; i < text.length; ) {
		const cp = text.codePointAt(i)!;

		const width = cp > 0xffff ? 2 : 1;

		if (cp === 13) {
			if (text.codePointAt(i + 1) === 10) i += 2;
			else i += 1;

			line++;
			col = 1;

			continue;
		}

		if (cp === 10) {
			i++;

			line++;
			col = 1;

			continue;
		}

		if (suspicious(cp)) {
			out.push({
				kind: "char",

				file,

				line,

				col,

				cp,

				ch: text.slice(i, i + width),

				detail: ASCII_ONLY ? "non-ASCII" : "suspicious Unicode",
			});
		}

		i += width;
		col++;
	}

	return out;
}

const files = collectFiles();

const findings: Finding[] = [];

for (const f of files) findings.push(...scan(f));

if (JSON_MODE) {
	console.log(JSON.stringify(findings, null, 2));
} else {
	for (const f of findings) {
		if (f.kind === "invalid-utf8") {
			console.log(`${f.file}:${f.line}:${f.col} [INVALID UTF-8] ${f.detail}`);

			continue;
		}

		console.log(`${f.file}:${f.line}:${f.col} ${escaped(f.ch, f.cp)} U+${hex(f.cp)} ${f.detail}`);
	}

	console.log(`\nScanned ${files.length} files, found ${findings.length} issue(s).`);

	console.log(ASCII_ONLY ? "Mode: ASCII only" : "Mode: suspicious Unicode only");
}

process.exit(findings.length ? 1 : 0);
