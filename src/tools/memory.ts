import { access, rename as fsRename, mkdir, readdir, rm } from "fs/promises";
import { strict as assert } from "node:assert";
import { homedir } from "os";
import { dirname, join, relative } from "path";
import { type InferSchema, type ToolMetadata } from "xmcp";
import { z } from "zod";

// Map /memories to $HOME/.mcp/memories
const MEMORIES_ROOT = join(homedir(), ".mcp", "memories");

// Helper to translate /memories path to actual filesystem path
const toFsPath = (virtualPath: string): string => {
  const relativePath = virtualPath.replace(/^\/memories\/?/, "");
  return join(MEMORIES_ROOT, relativePath);
};

// Helper to translate filesystem path back to /memories path
const toVirtualPath = (fsPath: string): string => {
  const rel = relative(MEMORIES_ROOT, fsPath);
  return `/memories/${rel}`;
};

// Path validation schema (used in tool schema)
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

// Helper functions
const pathExists = (fsPath: string): Promise<boolean> =>
  access(fsPath)
    .then(() => true)
    .catch(() => false);

const getStats = (fsPath: string) => Bun.file(fsPath).stat();

const writeFile = async (fsPath: string, content: string): Promise<void> => {
  await mkdir(dirname(fsPath), { recursive: true });
  await Bun.write(fsPath, content);
};

// Recursive directory listing
const listDirectory = async (fsPath: string): Promise<string> => {
  if (!(await pathExists(fsPath))) {
    return "Directory is empty or does not exist.";
  }

  const entries: string[] = [];

  const walk = async (currentPath: string): Promise<void> => {
    const items = await readdir(currentPath, { withFileTypes: true });

    for (const item of items) {
      const fullPath = join(currentPath, item.name);
      const suffix = item.isDirectory() ? "/" : "";
      entries.push(toVirtualPath(fullPath) + suffix);

      if (item.isDirectory()) await walk(fullPath);
    }
  };

  await walk(fsPath);
  return entries.length > 0 ? entries.join("\n") : "No files found.";
};

// Command handlers
const handleView = async (
  path: string | undefined,
  view_range?: [number, number]
): Promise<string> => {
  assert(path, "path is required for view command");

  const fsPath = toFsPath(path!);
  assert(await pathExists(fsPath), `Path does not exist: ${path}`);

  const stats = await getStats(fsPath);
  if (stats.isDirectory()) {
    return await listDirectory(fsPath);
  }

  const content = await Bun.file(fsPath).text();
  if (view_range) {
    const [start, end] = view_range;
    return content
      .split("\n")
      .slice(start - 1, end)
      .join("\n");
  }
  return content;
};

const handleCreate = async (
  path: string | undefined,
  file_text?: string
): Promise<string> => {
  assert(path, "path is required for create command");

  const fsPath = toFsPath(path!);
  await writeFile(fsPath, file_text || "");

  return `Created: ${path}`;
};

const handleStrReplace = async (
  path: string | undefined,
  old_str: string | undefined,
  new_str: string | undefined
): Promise<string> => {
  assert(path, "path is required for str_replace command");
  assert(old_str, "old_str is required for str_replace command");
  assert(new_str, "new_str is required for str_replace command");

  const fsPath = toFsPath(path!);
  assert(await pathExists(fsPath), `File does not exist: ${path}`);

  const content = await Bun.file(fsPath).text();
  assert(content.includes(old_str!), `String not found in file: "${old_str}"`);

  await writeFile(fsPath, content.replace(old_str!, new_str!));
  return `Replaced in ${path}`;
};

const handleInsert = async (
  path: string | undefined,
  insert_line: number | undefined,
  insert_text: string | undefined
): Promise<string> => {
  assert(path, "path is required for insert command");
  assert(insert_line, "insert_line is required for insert command");
  assert(insert_text, "insert_text is required for insert command");

  const fsPath = toFsPath(path!);
  assert(await pathExists(fsPath), `File does not exist: ${path}`);

  const lines = (await Bun.file(fsPath).text()).split("\n");
  lines.splice(insert_line! - 1, 0, insert_text!);

  await writeFile(fsPath, lines.join("\n"));
  return `Inserted at line ${insert_line} in ${path}`;
};

const handleDelete = async (path: string | undefined): Promise<string> => {
  assert(path, "path is required for delete command");

  const fsPath = toFsPath(path!);
  assert(await pathExists(fsPath), `Path does not exist: ${path}`);

  const isDir = (await getStats(fsPath)).isDirectory();
  await rm(fsPath, { recursive: true, force: true });

  return `Deleted ${isDir ? "directory" : "file"}: ${path}`;
};

const handleRename = async (
  old_path: string | undefined,
  new_path: string | undefined
): Promise<string> => {
  assert(old_path, "old_path is required for rename command");
  assert(new_path, "new_path is required for rename command");

  const oldFsPath = toFsPath(old_path!);
  const newFsPath = toFsPath(new_path!);

  assert(
    await pathExists(oldFsPath),
    `Source path does not exist: ${old_path}`
  );
  await mkdir(dirname(newFsPath), { recursive: true });
  await fsRename(oldFsPath, newFsPath);

  return `Renamed: ${old_path} → ${new_path}`;
};

// Tool schema
const schema = {
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

// Tool metadata
const metadata: ToolMetadata = {
  name: "memory",
  description: `Persistent storage for memory across conversation sessions. Use this to remember user preferences, project context, and important facts.

CRITICAL FIRST STEP:
Before responding to ANY new conversation, you MUST view /memories to check for existing context:
    memory("view", path="/memories")

This ensures you don't miss important user preferences or context from previous sessions.

WHEN TO USE THIS TOOL:
✓ At conversation start: ALWAYS check /memories first (see above)
✓ Learning preferences: User mentions coding style, communication preferences, or project details
✓ After milestones: Completing significant tasks or making important decisions
✓ Before context loss: Long conversations where information might be lost
✓ Discovering facts: User reveals persistent information about themselves or their projects

WHAT TO STORE:
✓ User preferences (e.g., "prefers functional programming", "uses Bun for TypeScript projects")
✓ Project context (file paths, architecture decisions, naming conventions)
✓ Persistent facts that help future conversations
✗ Conversation transcripts or message history
✗ Temporary state or throwaway information

ORGANIZATION TIPS:
- Files can be at ANY depth: /memories/file.md, /memories/projects/web/notes.md, etc.
- Use subdirectories to organize: /memories/preferences/, /memories/projects/, etc.
- Use descriptive filenames: user_preferences.md, project_context.md
- REUSE existing files: Always prefer updating existing files over creating new ones
- PROACTIVELY DELETE: Remove outdated or obsolete files to keep memory clean
- Consolidate related information into single files rather than scattering across multiple files
- Keep files organized and coherent

WORKFLOW (IMPORTANT):
- ALWAYS use "view" BEFORE "str_replace" or "insert" to see exact file content
- "str_replace" requires EXACT text from file (use "view" first to get it)
- For new files: use "create"
- For existing files: use "view" then "str_replace" or "insert"

Examples:

Start of conversation - check for context:
    memory("view", path="/memories")

Create new preference file:
    memory("create", path="/memories/user_preferences.md", file_text="# User Preferences\\n\\n- Prefers TypeScript\\n- Uses Bun runtime")

Update existing file (two-step):
    1. memory("view", path="/memories/user_preferences.md")
    2. memory("str_replace", path="/memories/user_preferences.md", old_str="- Uses Bun runtime", new_str="- Uses Bun runtime\\n- Prefers functional style")

View specific file:
    memory("view", path="/memories/project_context.md")

View file with line range (lines 1-10):
    memory("view", path="/memories/project_context.md", view_range=[1, 10])

View file partial (lines 15-25):
    memory("view", path="/memories/notes.md", view_range=[15, 25])

View nested directory:
    memory("view", path="/memories/projects")

View deeply nested file:
    memory("view", path="/memories/projects/web/architecture.md")

Insert at line (after viewing):
    memory("insert", path="/memories/notes.md", insert_line=5, insert_text="## New Section\\n")

Delete outdated file:
    memory("delete", path="/memories/old_notes.md")

Rename for clarity:
    memory("rename", old_path="/memories/temp.md", new_path="/memories/user_info.md")
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
const handler = async (params: InferSchema<typeof schema>) => {
  await mkdir(MEMORIES_ROOT, { recursive: true });

  const {
    command,
    path,
    view_range,
    file_text,
    old_str,
    new_str,
    insert_line,
    insert_text,
    old_path,
    new_path,
  } = params;

  switch (command) {
    case "view":
      return await handleView(path, view_range);
    case "create":
      return await handleCreate(path, file_text);
    case "str_replace":
      return await handleStrReplace(path, old_str, new_str);
    case "insert":
      return await handleInsert(path, insert_line, insert_text);
    case "delete":
      return await handleDelete(path);
    case "rename":
      return await handleRename(old_path, new_path);
  }
};

export { metadata, schema };
export default handler;
