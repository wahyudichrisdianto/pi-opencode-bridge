import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "fs";
import { homedir } from "os";
import { join } from "path";


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GO_PROVIDER = "oc-sdk-go";
const ZEN_PROVIDER = "oc-sdk-zen";

const GO_BASE_URL = "https://opencode.ai/zen/go/v1";
const ZEN_BASE_URL = "https://opencode.ai/zen/v1";

const REGISTRY_PATHS = [
	join(homedir(), ".cache", "opencode", "models.json"),
	join(homedir(), ".config", "opencode", "models.json"),
];

const AUTH_PATHS = [
	join(homedir(), ".local", "share", "opencode", "auth.json"),
	join(homedir(), ".pi", "agent", "auth.json"),
];
const OPENCODE_AUTH_PATH = join(homedir(), ".local", "share", "opencode", "auth.json");
const PI_AUTH_PATH = join(homedir(), ".pi", "agent", "auth.json");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveRegistryPath(): string {
	for (const p of REGISTRY_PATHS) {
		if (existsSync(p)) return p;
	}
	return "";
}

function resolveApiKey(provider: string): string | undefined {
	// 1. Environment variable (generic)
	if (process.env.OPENCODE_API_KEY) return process.env.OPENCODE_API_KEY;

	// 2. Auth files
	for (const p of AUTH_PATHS) {
		if (!existsSync(p)) continue;
		try {
			const auth = JSON.parse(readFileSync(p, "utf-8"));
			// Try provider-specific key first
			const key = auth?.[provider]?.key;
			if (key) return key;
			// Fallback to opencode-go key
			const fallback = auth?.["opencode-go"]?.key;
			if (fallback) return fallback;
		} catch { /* try next */ }
	}

	return undefined;
}

function setOpencodeGoApiKey(apiKey: string): void {
	const opencodeDir = join(homedir(), ".local", "share", "opencode");
	const piDir = join(homedir(), ".pi", "agent");

	// Save to opencode's auth.json
	if (!existsSync(opencodeDir)) {
		mkdirSync(opencodeDir, { recursive: true, mode: 0o700 });
	}
	let data: Record<string, unknown> = {};
	if (existsSync(OPENCODE_AUTH_PATH)) {
		try {
			data = JSON.parse(readFileSync(OPENCODE_AUTH_PATH, "utf-8"));
		} catch {
			throw new Error(`opencode auth.json is malformed. Fix manually: ${OPENCODE_AUTH_PATH}`);
		}
	}
	data["opencode-go"] = { type: "api", key: apiKey };
	writeFileSync(OPENCODE_AUTH_PATH, JSON.stringify(data, null, 2), { encoding: "utf-8", mode: 0o600 });
	try { chmodSync(OPENCODE_AUTH_PATH, 0o600); } catch { /* best-effort */ }

	// Also sync to Pi's auth.json so Pi's AuthStorage picks it up
	if (!existsSync(piDir)) {
		mkdirSync(piDir, { recursive: true, mode: 0o700 });
	}
	let piData: Record<string, unknown> = {};
	if (existsSync(PI_AUTH_PATH)) {
		try {
			piData = JSON.parse(readFileSync(PI_AUTH_PATH, "utf-8"));
		} catch {
			// corrupt but continue — will overwrite
		}
	}
	piData["opencode-go"] = { type: "api_key", key: apiKey };
	writeFileSync(PI_AUTH_PATH, JSON.stringify(piData, null, 2), { encoding: "utf-8", mode: 0o600 });
	try { chmodSync(PI_AUTH_PATH, 0o600); } catch { /* best-effort */ }
}
function getAuthStatus(): { go: boolean; zen: boolean } {
	return {
		go: !!resolveApiKey("opencode-go"),
		zen: !!resolveApiKey("opencode"),
	};
}


// ---------------------------------------------------------------------------
// Model discovery
// ---------------------------------------------------------------------------

type RawModel = {
	id: string;
	name: string;
	baseUrl: string;
	meta: Record<string, unknown>;
};

function discoverModels(): { go: RawModel[]; zen: RawModel[] } {
	const go: RawModel[] = [];
	const zen: RawModel[] = [];

	const path = resolveRegistryPath();
	if (!path) return { go, zen };

	let raw: string;
	try { raw = readFileSync(path, "utf-8"); } catch { return { go, zen }; }

	let data: Record<string, any>;
	try { data = JSON.parse(raw); } catch { return { go, zen }; }

	for (const [provId, prov] of Object.entries(data)) {
		if (provId !== "opencode-go" && provId !== "opencode") continue;
		if (!prov || typeof prov !== "object") continue;

		const baseUrl: string = provId === "opencode-go" ? GO_BASE_URL : ZEN_BASE_URL;
		const models: Record<string, Record<string, unknown>> = prov.models;
		if (!models || typeof models !== "object") continue;

		for (const [modelId, meta] of Object.entries(models)) {
			if (!meta || typeof meta !== "object") continue;
			const entry = {
				id: modelId,
				name: (meta.name as string) || modelId,
				baseUrl,
				meta,
			};
			if (provId === "opencode-go") go.push(entry);
			else zen.push(entry);
		}
	}

	return { go, zen };
}

// ---------------------------------------------------------------------------
// Build Pi model configs
// ---------------------------------------------------------------------------

function buildPiModels(rawModels: RawModel[], provider: string): any[] {
	return rawModels.map((m) => {
		const limit = (m.meta.limit ?? {}) as Record<string, number>;
		const cost = (m.meta.cost ?? {}) as Record<string, number>;
		const mods = (m.meta.modalities ?? {}) as Record<string, string[]>;
		const family = (m.meta.family as string) || "";

		// Compat: DeepSeek and kimi models need reasoning_content replay
		const needsReasoningCompat =
			family.includes("deepseek") || family.includes("kimi");

		return {
			id: m.id,
			name: m.name,
			api: "openai-completions",
			provider,
			baseUrl: m.baseUrl,
			contextWindow:
				(limit.context as number) ?? (limit.maxInput as number) ?? 204800,
			maxTokens: (limit.output as number) ?? (limit.maxOutput as number) ?? 131072,
			maxOutput: (limit.output as number) ?? (limit.maxOutput as number) ?? 131072,
			reasoning: (m.meta.reasoning as boolean) ?? false,
			cost: {
				input: (cost.input as number) ?? 0,
				output: (cost.output as number) ?? 0,
				cacheRead: (cost.cacheRead as number) ?? 0,
				cacheWrite: (cost.cacheWrite as number) ?? 0,
			},
			input: mods.input ?? ["text"],
			...(needsReasoningCompat
				? {
					compat: {
						requiresReasoningContentOnAssistantMessages: true,
						thinkingFormat: family.includes("deepseek")
							? "deepseek"
							: undefined,
					},
				}
				: {}),
		};
	});
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

const REG_KEY = Symbol.for("pi-oc-sdk:registered");

export default function (pi: ExtensionAPI) {
	const g = globalThis as Record<symbol, any>;
	if (g[REG_KEY]) return; // already registered

	const { go, zen } = discoverModels();

	// Register Go provider (OpenCode Go plan)
	if (go.length > 0) {
		const apiKey = resolveApiKey("opencode-go");
		if (apiKey) {
			pi.registerProvider(GO_PROVIDER, {
				apiKey,
				api: "openai-completions" as const,
				baseUrl: GO_BASE_URL,
				models: buildPiModels(go, GO_PROVIDER),
			});
		}
	}

	// Register Zen provider (OpenCode Zen plan — separate subscription)
	if (zen.length > 0) {
		const apiKey = resolveApiKey("opencode");
		if (apiKey) {
			pi.registerProvider(ZEN_PROVIDER, {
				apiKey,
				api: "openai-completions" as const,
				baseUrl: ZEN_BASE_URL,
				models: buildPiModels(zen, ZEN_PROVIDER),
			});
		}
	}

	g[REG_KEY] = true;



	pi.registerCommand("opencode-go-key", {
		description: "Set your OpenCode Go API key directly (no CLI required)",
		handler: async (args: string, ctx) => {
			let apiKey = args.trim();
			if (!apiKey) {
				apiKey = (await ctx.ui.input("Enter your OpenCode Go API Key", "sk-...")) ?? "";
			}
			if (!apiKey) {
				ctx.ui.notify("No API key provided", "warning");
				return;
			}
			try {
				setOpencodeGoApiKey(apiKey);
			} catch (err: any) {
				ctx.ui.notify(err.message ?? "Failed to save API key", "error");
				return;
			}
			// Re-register provider so current session works immediately
			const { go } = discoverModels();
			if (go.length > 0) {
				pi.registerProvider(GO_PROVIDER, {
					apiKey,
					api: "openai-completions" as const,
					baseUrl: GO_BASE_URL,
					models: buildPiModels(go, GO_PROVIDER),
				});
			}
			ctx.ui.notify("OpenCode Go API key saved and active!", "info");
		},
	});
	pi.registerCommand("opencode-status", {
		description: "Check OpenCode authentication status",
		handler: async (_args, ctx) => {
			const status = getAuthStatus();
			const lines = [
				"OpenCode Auth Status:",
				`  Go plan:  ${status.go ? "✅ authenticated" : "❌ not set — run /oc-login"}`,
				`  Zen plan: ${status.zen ? "✅ authenticated" : "❌ not set — run /oc-login"}`,
			];
			ctx.ui.notify(lines.join("\n"), "info");
		},
	});
}
