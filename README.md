# pi-opencode-bridge

OpenCode provider for Pi Agent. Auto-discovers models from OpenCode registry and uses Pi's native OpenAI-compatible handler.

## Install

```bash
pi install /path/to/pi-opencode-bridge
```

Then restart Pi.

## Authentication

### Quick setup (recommended)

```
/opencode-go-key <your-api-key>   # Set OpenCode Go API key directly
/opencode-go-key                   # Interactive prompt if no key provided
/opencode-status                   # Check authentication status
```

### Manual setup

Keys are saved to two locations:
- `~/.local/share/opencode/auth.json` — shared with OpenCode CLI
- `~/.pi/agent/auth.json` — Pi's AuthStorage format

## Available Models

After setup, select a model via `/model`. Models are split into two providers:

**Go plan** (`oc-sdk-go/`):
- `oc-sdk-go/deepseek-v4-pro`
- `oc-sdk-go/deepseek-v4-flash`
- `oc-sdk-go/kimi-k2.6`
- `oc-sdk-go/mimo-v2.5-pro`
- `oc-sdk-go/glm-5.1`
- `oc-sdk-go/qwen3.6-plus`

**Zen plan** (`oc-sdk-zen/`):
- `oc-sdk-zen/claude-opus-4.7`
- `oc-sdk-zen/gpt-5.2`

## How It Works

1. At startup, reads `~/.cache/opencode/models.json` (OpenCode's model registry)
2. Models registered in Pi with context windows, costs, and capabilities
3. Pi's native `openai-completions` handler bridges requests to OpenCode's API
4. Message conversion, tool calls, thinking/reasoning, and SSE streaming handled by Pi

## Architecture

```
Pi Agent
  ├─ oc-sdk-go  → https://opencode.ai/zen/go/v1  (OpenAI-compatible)
  └─ oc-sdk-zen → https://opencode.ai/zen/v1     (OpenAI-compatible)
```

## Commands

| Command | Description |
|---------|-------------|
| `/opencode-go-key [key]` | Set OpenCode Go API key (direct or interactive) |
| `/opencode-status` | Check auth status for Go and Zen plans |

## Upcoming (v0.3.0)

- `/opencode-connect` — CLI-based login via `opencode auth login`
- `/opencode-zen-key` — Set Zen plan API key directly