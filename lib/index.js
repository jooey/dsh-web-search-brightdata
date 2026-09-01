/**
 * dsh-web-search-brightdata
 *
 * A Bright Data SERP API search provider for the DSH web capability seam
 * (`ctx.web`), with multi-key rotation managed from the Settings UI — the
 * same treatment as the tavily pool:
 *
 * - keys live in ~/.dsh/.dsh-web-search-brightdata.json (authoritative once
 *   it exists; the settings gateway writes it) with per-key disabled flags,
 *   falling back to BRIGHTDATA_API_KEYS / BRIGHTDATA_API_KEY via the
 *   credentials service and then ~/.dsh/.credentials.yaml directly
 * - the SERP zone (default serp_api_dsh) is pool-wide and editable in
 *   Settings; every request is `POST /request` with format raw
 * - a key that answers with an auth/quota/rate/server error is cooled down
 *   (401/403 invalid credentials for 30 minutes; 429 for 1 minute; other
 *   retryable codes for 5 minutes) and the next active key retries
 * - results: `data_format: html` parses the organic anchors (`<a …><h3>`)
 *   with exact URLs; `data_format: markdown` parses `### title` blocks and
 *   reconstructs breadcrumb URLs (›-joined) — html is the default because
 *   its URLs are exact; a page that yields zero parsed results fails loudly
 *
 * A real (non-sandboxed) host plugin: uses native fetch directly.
 */

import z from "@deepseek-ai/schemastery";

/** Cordis plugin name used by loader diagnostics. */
export const name = "web-search-brightdata";
/** The web seam this provider registers into. */
export const inject = ["web"];

const BRIGHTDATA_DEFAULT_BASE_URL = "https://api.brightdata.com/request";
const GOOGLE_BASE = "https://www.google.com/search";
const KEY_REFS = ["BRIGHTDATA_API_KEYS", "BRIGHTDATA_API_KEY"];
const RETRYABLE = /^(401|402|403|408|429|500|502|503|504)$/;
/** Hosts that never carry organic results. */
const INTERNAL_HOST = /(^|\.)(google|gstatic|googleapis|googleusercontent|googleadservices|schema|w3)\./i;

/** All live provider instances (the strategy child and the standalone
 *  registration share this module). */
const INSTANCES = new Set();

/** Re-warm every live provider after a pool mutation. */
async function rewarmAllBrightdataInstances() {
	await Promise.allSettled([...INSTANCES].map((provider) => provider.warmKeys()));
}

/** Pool state file (authoritative once it exists). */
function stateFile() {
	const os = globalThis.process?.getBuiltinModule?.("node:os");
	const path = globalThis.process?.getBuiltinModule?.("node:path");
	if (os === undefined || path === undefined) return undefined;
	return path.join(os.homedir(), ".dsh", ".dsh-web-search-brightdata.json");
}

/** Read managed state {zone, keys:[{key, disabled}]}; undefined when absent. */
function readKeyState() {
	const fs = globalThis.process?.getBuiltinModule?.("node:fs");
	const file = stateFile();
	if (fs === undefined || file === undefined || !fs.existsSync(file)) return undefined;
	try {
		const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
		if (!Array.isArray(parsed?.keys)) return undefined;
		const entries = parsed.keys
			.map((entry) => (typeof entry === "string" ? { key: entry, disabled: false } : {
				key: typeof entry?.key === "string" ? entry.key : "",
				disabled: entry?.disabled === true
			}))
			.filter((entry) => entry.key !== "");
		const zone = typeof parsed?.zone === "string" && parsed.zone.trim() !== "" ? parsed.zone.trim() : undefined;
		if (entries.length === 0 && zone === undefined) return undefined;
		return { zone, keys: entries };
	} catch {
		return undefined;
	}
}

/** Persist managed state, then re-warm every live provider. */
function writeKeyState(zone, entries) {
	const fs = globalThis.process?.getBuiltinModule?.("node:fs");
	const file = stateFile();
	if (fs === undefined || file === undefined) throw new Error("node fs unavailable");
	fs.writeFileSync(file, `${JSON.stringify({ zone, keys: entries }, null, 2)}\n`, "utf8");
}

export const Config = z.object({
	baseURL: z.string().default(BRIGHTDATA_DEFAULT_BASE_URL),
	/** SERP zone on the Bright Data account (pool-wide). */
	zone: z.string().default("serp_api_dsh"),
	timeoutMs: z.number().step(1).min(1000).default(30000),
	/** Google's html SERP no longer pairs absolute hrefs with <h3> titles, so markdown (server-side extraction) is the reliable default. */
	dataFormat: z.string().default("markdown"),
	/** Google interface language hint. */
	hl: z.string().default("zh-CN"),
	maxResults: z.number().step(1).min(1).default(8)
});

/** Split a raw credential into deduped non-empty keys. */
function parseKeys(raw) {
	const seen = new Set();
	const keys = [];
	for (const part of String(raw).split(/[\s,;]+/)) {
		const key = part.trim();
		if (key === "" || seen.has(key)) continue;
		seen.add(key);
		keys.push(key);
	}
	return keys;
}

/** Minimal HTML entity decoding for titles and snippets. */
function decodeEntities(text) {
	let s = String(text);
	s = s.replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCodePoint(parseInt(h, 16)));
	s = s.replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)));
	const named = { quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", amp: "&" };
	return s.replace(/&([a-zA-Z]+);/g, (m, name) => (Object.hasOwn(named, name) ? named[name] : m));
}

/** Collapse an HTML fragment to plain text. */
function stripTags(html) {
	return decodeEntities(String(html).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

/** True when a URL is an organic target (not a google/internal link). */
function isOrganicUrl(rawUrl) {
	let url;
	try {
		url = new URL(rawUrl);
	} catch {
		return false;
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") return false;
	return !INTERNAL_HOST.test(url.hostname);
}

/**
 * Parse the Google SERP HTML into seam sources. Organic results are anchors
 * that wrap an <h3> title; snippets pair by SERP order from VwiC3b blocks.
 */
export function parseGoogleHtml(html) {
	const text = String(html);
	const snippets = [];
	for (const m of text.matchAll(/<div[^>]*class="[^"]*\bVwiC3b\b[^"]*"[^>]*>([\s\S]*?)<\/div>/g)) {
		const snippet = stripTags(m[1]);
		if (snippet !== "") snippets.push(snippet.slice(0, 320));
	}
	const sources = [];
	const seen = new Set();
	const re = /<a\s[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
	let match;
	while ((match = re.exec(text)) !== null) {
		const url = decodeEntities(match[1]);
		const h3 = /<h3[^>]*>([\s\S]*?)<\/h3>/.exec(match[2]);
		if (h3 === null) continue;
		if (!isOrganicUrl(url)) continue;
		const title = stripTags(h3[1]);
		if (title === "") continue;
		let normalized = "";
		try {
			const u = new URL(url);
			normalized = `${u.hostname}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
		} catch {
			normalized = url.toLowerCase();
		}
		if (seen.has(normalized)) continue;
		seen.add(normalized);
		sources.push({
			url,
			title,
			...(snippets.length > sources.length ? { snippet: snippets[sources.length] } : {})
		});
		if (sources.length >= 25) break;
	}
	return sources;
}

/**
 * Parse the Google SERP markdown into seam sources. Blocks start at
 * `### title`; the following `https://host › a › b` breadcrumb line is
 * reconstructed as host/a/b (best effort — html keeps exact URLs).
 */
export function parseGoogleMarkdown(markdown) {
	const sources = [];
	const seen = new Set();
	const blocks = String(markdown).split(/^### /m).slice(1);
	for (const block of blocks) {
		const lines = block.split("\n").map((line) => line.trim());
		const title = decodeEntities(lines[0] ?? "").trim();
		if (title === "") continue;
		const crumbIndex = lines.findIndex((line) => /^https?:\/\/\S*(?:›|\bu2022\b)/.test(line) || /^https?:\/\/\S+ › /.test(line));
		const crumb = crumbIndex >= 0 ? lines[crumbIndex] : /https?:\/\/[^\s)]+/.exec(block)?.[0];
		if (crumb === undefined) continue;
		const url = decodeEntities(crumb)
			.split(/\s*›\s*/)
			.map((part) => part.trim())
			.filter((part) => part !== "")
			.join("/");
		if (!isOrganicUrl(url)) continue;
		let normalized = "";
		try {
			const u = new URL(url);
			normalized = `${u.hostname}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
		} catch {
			continue;
		}
		if (seen.has(normalized)) continue;
		seen.add(normalized);
		const snippetLines = lines.slice((crumbIndex >= 0 ? crumbIndex : 1) + 1).filter((line) => line !== "" && !/^!\[/.test(line));
		const snippet = snippetLines.join(" ").slice(0, 320);
		sources.push({ url, title, ...(snippet !== "" ? { snippet } : {}) });
		if (sources.length >= 25) break;
	}
	return sources;
}

/**
 * The Bright Data SERP-backed search provider. Rotation state (key pool,
 * cursor, cooldowns, disabled flags, zone) is provider-private; the options
 * thunk is snapshotted per operation so a settings change never mixes into
 * one search.
 */
class BrightdataSearchProvider {
	constructor(resolveOptions) {
		this.resolveOptions = resolveOptions;
		this.id = "brightdata";
		this.keys = [];
		this.zone = undefined;
		this.cursor = 0;
		this.cooldown = new Map();
		this.disabled = new Set();
		this.warmed = false;
		INSTANCES.add(this);
	}

	/** Always usable when configured: a missing key surfaces as a clear search error. */
	available() {
		return true;
	}

	/** Re-read the key pool. Priority: managed JSON state (per-key disabled
	 *  flags + zone, written by the settings UI) → credentials service → the
	 *  credentials file directly. Cooldowns and disabled flags survive. */
	async warmKeys() {
		let zone;
		let entries = readKeyState();
		if (entries !== undefined) {
			zone = entries.zone;
		} else {
			entries = undefined;
		}
		let raw = "";
		if (entries === undefined) {
			const credentials = this.resolveOptions().credentials;
			if (credentials !== undefined) {
				for (const ref of KEY_REFS) {
					try {
						const resolved = await credentials.resolve(ref);
						if (resolved !== undefined && resolved !== null && typeof resolved.value === "string" && resolved.value.length > 0) {
							raw = resolved.value;
							break;
						}
					} catch {
						// unreadable refs fall through to the next source
					}
				}
			}
			if (raw === "") {
				try {
					const fs = globalThis.process?.getBuiltinModule?.("node:fs");
					const os = globalThis.process?.getBuiltinModule?.("node:os");
					const path = globalThis.process?.getBuiltinModule?.("node:path");
					if (fs !== undefined && os !== undefined && path !== undefined) {
						const file = path.join(os.homedir(), ".dsh", ".credentials.yaml");
						const text = fs.readFileSync(file, "utf8");
						for (const ref of KEY_REFS) {
							const m = new RegExp(`^${ref}:[ \\t]*(.+)$`, "m").exec(text);
							if (m !== null) {
								raw = m[1].replace(/^['"]|['"]$/g, "");
								break;
							}
						}
					}
				} catch {
					// file fallback is best-effort
				}
			}
		}
		const keys = entries !== undefined ? entries.keys : parseKeys(raw).map((key) => ({ key, disabled: false }));
		if (zone === undefined) zone = this.zone ?? this.resolveOptions().zone;
		const cooldown = new Map();
		for (const { key } of keys) if (this.cooldown.has(key)) cooldown.set(key, this.cooldown.get(key));
		this.cooldown = cooldown;
		const disabled = new Set([...this.disabled].filter((key) => keys.some((entry) => entry.key === key)));
		for (const entry of keys) if (entry.disabled) disabled.add(entry.key);
		this.disabled = disabled;
		if (keys.length !== this.keys.length || zone !== this.zone) console.log(`[web-search-brightdata] configured keys: ${keys.length} · zone: ${zone}`);
		this.keys = keys.map((entry) => entry.key);
		this.zone = zone;
		this.warmed = true;
		return this.keys;
	}

	/** Keys eligible for rotation: not disabled and not cooling down. */
	activeKeys() {
		const now = Date.now();
		return this.keys.filter((key) => {
			if (this.disabled.has(key)) return false;
			const until = this.cooldown.get(key);
			return until === undefined || until <= now;
		});
	}

	/** Build the Google SERP URL for one request. */
	buildTargetUrl(request, options) {
		const params = new URLSearchParams({ q: request.query });
		const count = Math.min(Math.max((request.maxResults ?? options.maxResults) * 2, 10), 30);
		params.set("num", String(count));
		if (options.hl !== undefined && options.hl !== "") params.set("hl", options.hl);
		return `${GOOGLE_BASE}?${params.toString()}`;
	}

	/** One search attempt against one key. */
	async searchOnce(key, request, options, signal) {
		const zone = this.zone ?? options.zone;
		const payload = {
			zone,
			url: this.buildTargetUrl(request, options),
			format: "raw",
			data_format: options.dataFormat
		};
		const response = await fetch(options.baseURL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${key}`
			},
			body: JSON.stringify(payload),
			signal: signal !== undefined ? signal : AbortSignal.timeout(options.timeoutMs)
		});
		if (!response.ok) {
			let detail = "";
			try {
				const parsed = await response.json();
				detail = typeof parsed?.error === "string" ? parsed.error.slice(0, 160) : JSON.stringify(parsed).slice(0, 160);
			} catch {
				// non-JSON error bodies keep the status line only
			}
			throw new Error(`HTTP ${response.status}${detail !== "" ? `: ${detail}` : ""}`);
		}
		const body = await response.text();
		if (options.dataFormat === "markdown") {
			const sources = parseGoogleMarkdown(body);
			if (sources.length === 0) throw new Error("brightdata: parsed 0 results from markdown SERP");
			return { sources, truncated: false };
		}
		const sources = parseGoogleHtml(body);
		if (sources.length === 0) throw new Error("brightdata: parsed 0 results from html SERP — google markup may have changed");
		return { sources, truncated: false };
	}

	/** Run one search with rotation and cooldown failover. */
	async search(request, signal) {
		const options = this.resolveOptions();
		if (this.keys.length === 0) await this.warmKeys();
		if (this.keys.length === 0) {
			throw new Error('brightdata: no API keys configured — add one in Settings (Bright Data SERP) or store BRIGHTDATA_API_KEYS in ~/.dsh/.credentials.yaml');
		}
		let lastError = "";
		for (let attempt = 0; attempt < this.keys.length; attempt++) {
			const pool = this.activeKeys();
			if (pool.length === 0) {
				const disabledCount = this.disabled.size;
				throw new Error(`brightdata: no active key (${this.keys.length} configured, ${disabledCount} disabled, rest cooling down); last error: ${lastError}`);
			}
			const key = pool[this.cursor % pool.length];
			this.cursor = (this.cursor + 1) % pool.length;
			try {
				return await this.searchOnce(key, request, options, signal);
			} catch (error) {
				lastError = error instanceof Error ? error.message : String(error);
				const status = /^HTTP (\d+)/.exec(lastError);
				const code = status !== null ? status[1] : "";
				if (code !== "" && RETRYABLE.test(code)) {
					const ms = code === "429" ? 60000 : code === "401" || code === "403" ? 1800000 : 300000;
					this.cooldown.set(key, Date.now() + ms);
					const index = this.keys.indexOf(key) + 1;
					console.log(`[web-search-brightdata] key #${index} failed (${lastError.slice(0, 90)}); cooling ${ms / 1000}s, rotating`);
					continue;
				}
				throw error;
			}
		}
		throw new Error(`brightdata: every configured key failed; last error: ${lastError}`);
	}
}

/**
 * Build a brightdata provider from one options snapshot.
 * `options.credentials` may be the service itself or a () => service getter —
 * a getter keeps apply-time snapshots valid when the credentials service
 * activates after this provider was constructed.
 */
export function createBrightdataProvider(options = {}) {
	return new BrightdataSearchProvider(() => ({
		baseURL: options.baseURL ?? BRIGHTDATA_DEFAULT_BASE_URL,
		zone: options.zone ?? "serp_api_dsh",
		timeoutMs: options.timeoutMs ?? 30000,
		dataFormat: options.dataFormat ?? "markdown",
		hl: options.hl ?? "zh-CN",
		maxResults: options.maxResults ?? 8,
		credentials: typeof options.credentials === "function" ? options.credentials() : options.credentials
	}));
}

/** Register the brightdata search provider and the admin gateway with `ctx.web`. */
export async function apply(ctx, config = {}) {
	const provider = createBrightdataProvider({ ...config, credentials: () => ctx.get("credentials") });
	provider.warmKeys();
	ctx.web.registerSearchProvider(provider);
	ctx.on("credentials/updated", (ref) => {
		if (ref === "BRIGHTDATA_API_KEYS" || ref === "BRIGHTDATA_API_KEY") {
			console.log("[web-search-brightdata] credentials updated, re-warming keys");
			provider.warmKeys();
		}
	});
	await ctx.plugin(BrightdataAdminGateway, { provider });
	console.log("[web-search-brightdata] registered brightdata search provider (multi-key rotation) + admin gateway");
}

// ── admin gateway (browser settings UI bridge) ────────────────────────────

import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

/** Mask one key for display: keep the head and tail only. */
function maskKey(key) {
	return key.length <= 14 ? `${key.slice(0, 4)}…` : `${key.slice(0, 8)}…${key.slice(-4)}`;
}

/**
 * Host-side remote service for the settings UI: per-key list/add/remove/
 * toggle/test operations, the zone editor, pool-wide test, and cooldown
 * reset. Every mutation persists to ~/.dsh/.dsh-web-search-brightdata.json
 * and re-warms ALL live provider instances (including the strategy
 * package's child), so changes apply immediately without a restart.
 */
class BrightdataAdminGateway extends TypertRemoteService {
	constructor(ctx, options) {
		super(ctx, "brightdataAdmin");
		this.provider = options.provider;
	}

	/** Managed entries snapshot derived from the live pool. */
	entries() {
		return this.provider.keys.map((key) => ({ key, disabled: this.provider.disabled.has(key) }));
	}

	/** Persist entries and re-warm every live provider instance. */
	async persist(entries) {
		writeKeyState(this.provider.zone ?? this.provider.resolveOptions().zone, entries);
		await rewarmAllBrightdataInstances();
	}

	/** Pool snapshot: masked keys with status + the live zone. */
	async listKeys() {
		const now = Date.now();
		const keys = this.provider.keys.map((key, index) => {
			const until = this.provider.cooldown.get(key);
			const cooling = until !== undefined && until > now;
			const disabled = this.provider.disabled.has(key);
			return {
				index: index + 1,
				masked: maskKey(key),
				status: disabled ? "disabled" : cooling ? "cooling" : "active",
				cooldownSecondsLeft: cooling ? Math.ceil((until - now) / 1000) : 0
			};
		});
		return { keys, total: keys.length, active: keys.filter((k) => k.status === "active").length, zone: this.provider.zone ?? this.provider.resolveOptions().zone };
	}

	/** Replace the SERP zone (pool-wide, applies immediately). */
	async setZone(zone) {
		if (typeof zone !== "string" || zone.trim() === "") throw new Error("zone must be a non-empty string");
		const cleaned = zone.trim();
		this.provider.zone = cleaned;
		await this.persist(this.entries());
		return this.listKeys();
	}

	/** Append one new key (deduped). */
	async addKey(key) {
		if (typeof key !== "string" || key.trim() === "") throw new Error("key must be a non-empty string");
		const cleaned = key.trim();
		const entries = this.entries();
		if (entries.some((entry) => entry.key === cleaned)) throw new Error("这把 key 已在池中");
		entries.push({ key: cleaned, disabled: false });
		await this.persist(entries);
		return this.listKeys();
	}

	/** Remove one key by its 1-based index. */
	async removeKey(index) {
		const entries = this.entries();
		if (!Number.isInteger(index) || index < 1 || index > entries.length) throw new Error(`invalid key index ${index}`);
		entries.splice(index - 1, 1);
		await this.persist(entries);
		return this.listKeys();
	}

	/** Flip the disabled flag of one key by its 1-based index. */
	async toggleKey(index) {
		const entries = this.entries();
		if (!Number.isInteger(index) || index < 1 || index > entries.length) throw new Error(`invalid key index ${index}`);
		entries[index - 1].disabled = !entries[index - 1].disabled;
		await this.persist(entries);
		return this.listKeys();
	}

	/** Probe one key by its 1-based index with a real 1-result search. */
	async testKey(index) {
		if (!Number.isInteger(index) || index < 1 || index > this.provider.keys.length) throw new Error(`invalid key index ${index}`);
		const key = this.provider.keys[index - 1];
		const startedAt = Date.now();
		try {
			await this.provider.searchOnce(key, { query: "brightdata key health check", maxResults: 1 }, this.provider.resolveOptions(), undefined);
			return { index, masked: maskKey(key), ok: true, ms: Date.now() - startedAt };
		} catch (error) {
			return { index, masked: maskKey(key), ok: false, ms: Date.now() - startedAt, error: String(error?.message ?? error).slice(0, 140) };
		}
	}

	/** Probe every configured key. */
	async testAll() {
		const results = [];
		for (let i = 1; i <= this.provider.keys.length; i++) results.push(await this.testKey(i));
		return { results, at: new Date().toISOString() };
	}

	/** Drop all cooldowns on every live instance so keys retry now. */
	async resetCooldowns() {
		for (const provider of INSTANCES) provider.cooldown.clear();
		return this.listKeys();
	}
}
