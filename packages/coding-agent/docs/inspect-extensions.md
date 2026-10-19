# Inspect Loaded Extensions

Pi loads extensions from the user directory, the project, packages, and `-e` paths. Any of them can change what the terminal draws, what a key does, and which commands and tools exist, so the repository you are working in often cannot explain what you are looking at.

The `extensions` tool reports what is actually loaded, and where each one came from.

## Enable it

`extensions` is built in but off by default, like `grep`, `find`, and `ls`. Add it to your default tools:

```json
{
  "defaultTools": ["+extensions"]
}
```

Or enable it for one run with `--tools`:

```sh
pi --tools read,bash,edit,write,extensions
```

## List what is loaded

Called with no arguments, the tool returns one line per loaded extension: the file name, the source it resolves to, and what it registers.

```
4 extensions loaded, each resolving to its own source:
- andon.ts -> ~/work/andon/extensions/andon.ts · /andon ctrl+shift+a · 1 tool
- zen.ts -> ~/work/zen/extensions/zen.ts · /zen
- notes.ts -> this file
- builtin:mcp -> built in · /mcp · 17 tools
```

Commands appear as `/name`, shortcuts as their key, and tools and flags as counts.

## Describe one

Name an extension — its file name, or any command, shortcut, flag, or tool it registers — to get its paths and everything it adds.

```
zen.ts (user, top-level)
  loaded from: ~/.pi/agent/extensions/zen.ts
  source: ~/work/zen/extensions/zen.ts
  commands: /zen — Toggle zen mode (one row per run)
```

`loaded from` is where Pi found the file, usually a symlink in the extensions directory. `source` is what that symlink resolves to: the extension's own checkout, which is the answer to "which repository owns this behaviour". A file that is not a symlink reports `this file`, and a built-in extension such as `builtin:mcp` reports `built in`.

## When to use it

Reach for it when the terminal does something the working repository does not explain: a blank row you did not write, a key that runs something else, a status line or command that appears from nowhere. Check the loaded extensions before searching the codebase, and read the `source` path rather than guessing which checkout is rendering.
