# pi-provider-opencode

OpenCode provider for Pi Agent. Uses Pi's native OpenAI-compatible handler for reliable message formatting, tool calls, and streaming.

## Setup

```bash
pi install /path/to/pi-provider-opencode
```

Then restart Pi.

## Authentication

### Via Pi command (recommended)

```
/opencode-go-key <api-key>  # Set OpenCode Go API key directly (no CLI needed)
/opencode-go-key            # Interactive prompt if no key provided
/oc-login                   # Runs `opencode auth login` — authenticates all plans at once
/oc-status                  # Check which plans are authenticated
```

### Via OpenCode CLI

```bash
opencode auth login
```

Keys are saved to:
- `~/.local/share/opencode/auth.json` — shared with OpenCode CLI
- `~/.pi/agent/auth.json` — Pi's AuthStorage format (used by Pi's internal auth system)

## Usage

`/model` → select any model under the `oc-sdk-go/` or `oc-sdk-zen/` provider:

**Go plan** (your subscription):
- `oc-sdk-go/deepseek-v4-pro`
- `oc-sdk-go/deepseek-v4-flash`
- `oc-sdk-go/kimi-k2.6`
- `oc-sdk-go/mimo-v2.5-pro`
- `oc-sdk-go/glm-5.1`
- `oc-sdk-go/qwen3.6-plus`

**Zen plan** (separate subscription):
- `oc-sdk-zen/claude-opus-4.7`
- `oc-sdk-zen/gpt-5.2`

## How It Works

1. At startup, the plugin reads `~/.cache/opencode/models.json` (OpenCode's model registry)
2. Models are split into two providers: `oc-sdk-go` and `oc-sdk-zen`
3. Each model is registered in Pi with accurate context windows, costs, and capabilities
4. Pi's native `openai-completions` handler bridges requests to OpenCode's API
5. All message conversion, tool calls, thinking/reasoning, and SSE streaming are handled by Pi

## Architecture

```
Pi Agent
  ├─ oc-sdk-go  → https://opencode.ai/zen/go/v1  (OpenAI-compatible)
  └─ oc-sdk-zen → https://opencode.ai/zen/v1     (OpenAI-compatible)
```
