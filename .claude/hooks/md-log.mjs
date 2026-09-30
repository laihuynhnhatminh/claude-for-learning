#!/usr/bin/env node
/**
 * md-log — mirror the session to a markdown file for comfortable reading.
 *
 * Claude Code port of the original pi `md-log` extension. pi exposed a rich
 * extension API (session_start, message_end, tool_call, tool_result events)
 * that could observe a session directly. Claude Code doesn't expose that to
 * scripts — the equivalent primitive is a `Stop` hook, which fires after every
 * assistant turn and hands us `transcript_path`: the session's JSONL transcript
 * on disk. This script re-derives the same behavior by reading that file.
 *
 * Designed for long teaching/learning sessions where the terminal is hard on
 * the eyes and markdown/math/code don't render. The linked .md file is meant
 * to be viewed rendered (e.g. in Obsidian), so assistant text with $...$ math,
 * code blocks, and markdown all render natively — no rendering work here.
 *
 * Captures only reading-relevant content:
 *   - user prompts (typed prose only — tool_result-only turns are skipped)
 *   - assistant text (lesson prose)
 *   - AskUserQuestion questions + answers (covers both plain questions and
 *     "quiz" style graded questions — see skills/teach/SKILL.md)
 * Other tools (Bash, Read, Write, Edit, ...) are omitted.
 *
 * State is a flat JSON file next to this script (gitignored): the linked
 * target file, plus a per-transcript line cursor so relinking in a fresh
 * session (a new transcript_path) doesn't silently skip everything, and an
 * old stale link doesn't replay history that's already been written.
 *
 * Modes:
 *   node md-log.mjs --link <filepath>   — used by /md-log
 *   node md-log.mjs --unlink            — used by /md-unlog
 *   node md-log.mjs   (stdin: hook JSON) — used by the Stop hook in settings.json
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(SCRIPT_DIR, "state", "md-log.json");

function readState() {
	try {
		const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
		if (!s.sessions || typeof s.sessions !== "object") s.sessions = {};
		return s;
	} catch {
		return { file: null, sessions: {} };
	}
}

function writeState(state) {
	fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
	fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

function appendToFile(file, text) {
	let current = "";
	if (fs.existsSync(file)) current = fs.readFileSync(file, "utf8");
	const prefix = current.trim().length > 0 ? "\n\n" : "";
	fs.writeFileSync(file, current + prefix + text + "\n", "utf8");
}

// --- Formatting ---

function callout(type, title, bodyLines) {
	const lines = [`> [!${type}] ${title}`];
	for (const line of bodyLines) lines.push(line.length === 0 ? ">" : `> ${line}`);
	return lines.join("\n");
}

function userBlock(text) {
	return `> [!quote] YOU\n\n${text}`;
}

function assistantBlock(text) {
	return `> [!abstract] CLAUDE\n\n${text}`;
}

// Strip harness-injected wrapper blocks that aren't things the user actually
// typed (system reminders, slash-command scaffolding). Best-effort: harmless
// no-op if a tag doesn't match.
function stripInjected(text) {
	return text
		.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
		.replace(/<command-message>[\s\S]*?<\/command-message>/g, "")
		.replace(/<command-name>[\s\S]*?<\/command-name>/g, "")
		.replace(/<command-args>[\s\S]*?<\/command-args>/g, "")
		.replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g, "")
		.trim();
}

function extractText(content) {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((c) => c && c.type === "text")
		.map((c) => c.text)
		.join("\n");
}

function questionCallout(question, options) {
	const body = [question];
	if (Array.isArray(options) && options.length > 0) {
		body.push("");
		options.forEach((o, i) => {
			body.push(`${i + 1}. ${o.label}${o.description ? ` — ${o.description}` : ""}`);
		});
	}
	return callout("question", "Question", body);
}

function answerCallout(answer) {
	const text = Array.isArray(answer) ? answer.join(", ") : String(answer ?? "(no answer)");
	return callout("example", "Answer", [text]);
}

// --- Stop-hook mode: read the hook payload, walk new transcript lines ---

function processTranscript(transcriptPath) {
	const state = readState();
	if (!state.file) return; // nothing linked

	let raw;
	try {
		raw = fs.readFileSync(transcriptPath, "utf8");
	} catch {
		return;
	}
	const lines = raw.split("\n").filter((l) => l.trim().length > 0);
	const startLine = state.sessions[transcriptPath] || 0;
	if (startLine >= lines.length) return; // nothing new

	// Map tool_use id -> {name, input} from the WHOLE transcript, so a
	// tool_result pairs correctly even across the startLine boundary.
	const toolCalls = new Map();
	for (const line of lines) {
		let entry;
		try {
			entry = JSON.parse(line);
		} catch {
			continue;
		}
		if (entry.type !== "assistant" || !entry.message || !Array.isArray(entry.message.content)) continue;
		for (const c of entry.message.content) {
			if (c.type === "tool_use") toolCalls.set(c.id, { name: c.name, input: c.input });
		}
	}

	const blocks = [];
	for (let i = startLine; i < lines.length; i++) {
		let entry;
		try {
			entry = JSON.parse(lines[i]);
		} catch {
			continue;
		}
		const msg = entry.message;
		if (!msg || !msg.role) continue;

		if (msg.role === "user") {
			const text = stripInjected(extractText(msg.content));
			if (text) {
				blocks.push(userBlock(text));
				continue;
			}
			// Not typed prose — check for an AskUserQuestion tool_result to log as Q&A.
			if (Array.isArray(msg.content)) {
				for (const c of msg.content) {
					if (c.type !== "tool_result") continue;
					const call = toolCalls.get(c.tool_use_id);
					if (!call || call.name !== "AskUserQuestion") continue;
					const questions = call.input?.questions || [];
					const answers = (entry.toolUseResult && entry.toolUseResult.answers) || {};
					for (const q of questions) {
						blocks.push(questionCallout(q.question, q.options));
						blocks.push(answerCallout(answers[q.question]));
					}
				}
			}
			continue;
		}

		if (msg.role === "assistant") {
			const text = extractText(msg.content).trim();
			if (text) blocks.push(assistantBlock(text));
			continue;
		}
	}

	if (blocks.length > 0) appendToFile(state.file, blocks.join("\n\n"));
	state.sessions[transcriptPath] = lines.length;
	writeState(state);
}

function runStopHook() {
	let payload = "";
	try {
		payload = fs.readFileSync(0, "utf8");
	} catch {
		return;
	}
	let hook;
	try {
		hook = JSON.parse(payload);
	} catch {
		return;
	}
	if (!hook.transcript_path) return;
	processTranscript(hook.transcript_path);
}

// --- CLI: --link / --unlink for the /md-log and /md-unlog commands ---

function main() {
	const args = process.argv.slice(2);

	if (args[0] === "--link") {
		const target = args[1];
		if (!target) {
			console.error("Usage: md-log.mjs --link <filepath>");
			process.exitCode = 1;
			return;
		}
		const resolved = path.resolve(target);
		if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
			console.error(`File does not exist: ${resolved}`);
			process.exitCode = 1;
			return;
		}
		// Fresh cursors: a relink always starts a clean backfill of the current session.
		writeState({ file: resolved, sessions: {} });
		console.log(`Linked: ${resolved}`);
		return;
	}

	if (args[0] === "--unlink") {
		const state = readState();
		writeState({ file: null, sessions: {} });
		console.log(state.file ? `Unlinked: ${state.file}` : "No file was linked.");
		return;
	}

	// No args: Stop-hook mode. Never let a logging feature break the session.
	try {
		runStopHook();
	} catch {
		// ignore
	}
}

main();
