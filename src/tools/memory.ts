import { type InferSchema, type ToolMetadata } from "xmcp";
import { z } from "zod";

const pathLike = z
  .string()
  .trim()
  .describe(
    "Filesystem path inside /memories. Must start with /memories and not contain traversal sequences."
  )
  .refine((p) => p.startsWith("/memories"), {
    message: "Path must start with /memories",
  })
  .refine((p) => !p.includes(".."), {
    message: "Path must not contain '..' to prevent directory traversal",
  })
  .refine((p) => !/%2e%2e|%2e%2f|%2e%5c/i.test(p), {
    message:
      "Path must not contain URL-encoded traversal sequences like %2e%2e or %2f",
  });

// Define the schema for tool parameters
export const schema = {
  command: z
    .enum(["view", "create", "str_replace", "insert", "delete", "rename"])
    .describe(
      `The sub-command to execute. Supported commands:
-  "view": List memory blocks or view specific block content
-  "create": Create a new memory block
-  "str_replace": Replace text in a memory block
-  "insert": Insert text at a specific line in a memory block
-  "delete": Delete a memory block
-  "rename": Rename a memory block`
    ),
  path: pathLike
    .optional()
    .describe(
      "Target filesystem path for single-path commands (applicable to: view, create, str_replace, insert, delete). Must be inside /memories. For rename use old_path/new_path."
    ),
  view_range: z
    .tuple([z.number().int().min(1), z.number().int().min(1)])
    .optional()
    .describe(
      "Optional inclusive line range to view: [startLine, endLine] (1-based). Applicable to: view. end must be >= start."
    ),
  file_text: z
    .string()
    .optional()
    .describe(
      "File content to write for create (will create or overwrite). Applicable to: create."
    ),
  old_str: z
    .string()
    .optional()
    .describe("Substring to search for (applicable to: str_replace)."),
  new_str: z
    .string()
    .optional()
    .describe("Replacement string (applicable to: str_replace)."),
  insert_line: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      "1-based line number at which to insert text (applicable to: insert)."
    ),
  insert_text: z
    .string()
    .optional()
    .describe(
      "Text to insert at insert_line (applicable to: insert). Include trailing newline if desired."
    ),
  old_path: pathLike
    .optional()
    .describe(
      "Source path for rename/move operations (applicable to: rename). Must be inside /memories."
    ),
  new_path: pathLike
    .optional()
    .describe(
      "Destination path for rename/move operations (applicable to: rename). Must be inside /memories."
    ),
};

// Define tool metadata
export const metadata: ToolMetadata = {
  name: "memory",
  description: `Memory management tool with various sub-commands for memory block operations.

Examples:
-   List all memory blocks:
    memory("view", path="/memories")

-   View specific memory block content:
    memory("view", path="/memories/user_preferences")

-   View first 10 lines of a memory block:
    memory("view", path="/memories/user_preferences", view_range=[1,10])

-   Replace text in a memory block:
    memory("str_replace", path="/memories/user_preferences", old_str="theme: dark", new_str="theme: light")

-   Insert text at line 5:
    memory("insert", path="/memories/notes", insert_line=5, insert_text="New note here")

-   Delete a memory block:
    memory("delete", path="/memories/old_notes")

-   Rename a memory block:
    memory("rename", old_path="/memories/temp", new_path="/memories/permanent")

-   Create a memory block with starting text:
    memory("create", path="/memories/coding_preferences", file_text="The user's coding preferences.")

-   Create an empty memory block:
    memory("create", path="/memories/coding_preferences")
`,
  annotations: {
    title: "Memory Management Tool",
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
};

// Tool implementation
export default function memory({ command }: InferSchema<typeof schema>) {
  return `Executing command: ${command}`;
}
