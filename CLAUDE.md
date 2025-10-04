# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an extensible MCP (Model Context Protocol) server built with xmcp that provides various tools for Claude. Tools are auto-discovered from `src/tools/` and can be easily added or extended.

**Current Tools:**

- **memory** - Persistent storage for Claude across conversation sessions

**Runtime**: Bun (requires Node.js ≥20.0.0)
**Transport**: STDIO (standard input/output for MCP communication)

## Development Commands

```bash
# Development with hot reload
bun run dev

# Build for production
bun run build

# Run production server
bun run start
```

## Architecture

### xmcp Framework Structure

This project uses the xmcp framework's auto-discovery pattern:

- **Tools**: `src/tools/*.ts` - Auto-discovered tool implementations
- **Prompts**: `src/prompts/*.ts` - Auto-discovered prompt templates (if added)
- **Resources**: `src/resources/*.ts` - Auto-discovered resource handlers (if added)

Each component exports:

1. `schema` - Zod validation schema for parameters
2. `metadata` - Tool/prompt/resource metadata (name, description, annotations)
3. `default` - Implementation function

### Adding New Tools

To add a new tool, create a file in `src/tools/` with:

```typescript
import { z } from "zod";
import { type InferSchema, type ToolMetadata } from "xmcp";

export const schema = {
  param: z.string().describe("Parameter description"),
};

export const metadata: ToolMetadata = {
  name: "tool-name",
  description: "Tool description",
  annotations: {
    title: "Tool Title",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
  },
};

export default async function toolName({ param }: InferSchema<typeof schema>) {
  // Implementation
  return "result";
}
```

The tool will be auto-discovered and registered on server start.

### Example: Memory Tool

**File**: `src/tools/memory.ts`

The memory tool provides 6 commands (view, create, str_replace, insert, delete, rename) operating on a virtual `/memories` filesystem:

- **Path Translation**: `/memories/*` → `$HOME/.mcp/memories/*` (transparent to LLM)
- **Security**: Validates paths to prevent directory traversal
- **Storage**: All files are Markdown (`.md`)
- **File Operations**: Uses Bun's fast file APIs with fs/promises fallbacks
- **Command Pattern**: Separate handler functions per command, dispatched via switch statement
- **Functional Style**: Pure functions, inline assertions, minimal abstraction

### Code Style Principles

When working on this codebase:

1. **Functional over imperative** - Prefer arrow functions, composition, and minimal state
2. **DRY principle** - Eliminate duplicate helper functions; inline where appropriate
3. **Bun APIs preferred** - Use `Bun.file()`, `Bun.write()` for performance
4. **Simple validation** - Use built-in `assert` for runtime checks
5. **No unnecessary wrappers** - Keep code direct and readable
