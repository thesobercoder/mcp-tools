# MCP Tools Server

An extensible MCP (Model Context Protocol) server providing various tools for Claude. Built with [xmcp](https://xmcp.dev) and optimized for Bun runtime.

## Current Tools

- **memory** - Persistent storage system for Claude across conversation sessions
  - Store user preferences, project context, and facts
  - Six commands: view, create, str_replace, insert, delete, rename
  - Operates on virtual `/memories` filesystem mapped to `$HOME/.mcp/memories`

## Getting Started

```bash
# Development with hot reload
bun run dev

# Build for production
bun run build

# Run production server
bun run start
```

## Requirements

- Bun runtime
- Node.js ≥20.0.0

## Project Structure

```
src/
├── tools/        # Tool implementations (auto-discovered)
│   └── memory.ts # Memory tool implementation
├── prompts/      # Prompt templates (auto-discovered)
└── resources/    # Resource handlers (auto-discovered)
```

## Adding New Tools

Create a new file in `src/tools/`:

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

The tool will be automatically discovered and registered on server start.

## Configuration

This server uses STDIO transport for MCP communication. The built server runs via:

```bash
bun dist/stdio.js
```

## Learn More

- [xmcp Documentation](https://xmcp.dev/docs)
- [MCP Protocol](https://modelcontextprotocol.io)
