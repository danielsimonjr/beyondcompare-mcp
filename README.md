# Beyond Compare MCP Server

[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-1.0-purple.svg)](https://modelcontextprotocol.io)

Model Context Protocol (MCP) server for [Beyond Compare](https://www.scootersoftware.com/), the powerful file and folder comparison tool for Windows. Enables file comparison, folder diffing, 3-way merging, folder sync, and scripted automation through MCP.

## Features

- **File Comparison**: Compare two files with binary, text, hex, or rules-based analysis
- **Folder Comparison**: Diff entire directory trees with optional file filters
- **3-Way Merge**: Merge files with base/left/right and auto-merge support
- **Folder Sync**: Synchronize directory contents between locations
- **Script Automation**: Run Beyond Compare scripts for batch operations
- **Rich Exit Codes**: Structured results (same, different, similar, conflicts)

## Prerequisites

**Windows Only** - Beyond Compare 5 must be installed:

1. **Install via winget**:
   ```bash
   winget install ScooterSoftware.BeyondCompare.5
   ```
2. **Or download**: https://www.scootersoftware.com/download
3. **Verify BComp.com** is available at the default path or set `BCOMP_PATH`

## Installation

### From Source
```bash
git clone https://github.com/danielsimonjr/beyondcompare-mcp.git
cd beyondcompare-mcp
npm install
```

## Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "beyondcompare-mcp": {
      "command": "node",
      "args": ["C:\\mcp-servers\\beyondcompare-mcp\\index.js"]
    }
  }
}
```

### Claude Code

Add to your `~/.claude/.mcp.json`:

```json
{
  "mcpServers": {
    "beyondcompare-mcp": {
      "command": "node",
      "args": ["C:\\mcp-servers\\beyondcompare-mcp\\index.js"]
    }
  }
}
```

### Custom BComp.com Path

If Beyond Compare is installed in a non-default location, set the `BCOMP_PATH` environment variable:

```json
{
  "mcpServers": {
    "beyondcompare-mcp": {
      "command": "node",
      "args": ["C:\\mcp-servers\\beyondcompare-mcp\\index.js"],
      "env": {
        "BCOMP_PATH": "D:\\Programs\\Beyond Compare 5\\BComp.com"
      }
    }
  }
}
```

### VS Code

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "beyondcompare-mcp": {
      "command": "node",
      "args": ["C:\\mcp-servers\\beyondcompare-mcp\\index.js"]
    }
  }
}
```

## Available Tools

### 1. `compare_files`

Compare two files using Beyond Compare. Returns whether files are identical, similar, or different.

**Parameters:**
- `left` (required): Path to the left (source) file
- `right` (required): Path to the right (target) file
- `fileViewType` (optional): Comparison type — `text`, `hex`, `table`, `mp3`, `picture`, `registry`, `version`
- `silent` (optional): Quick comparison without GUI (default: true)
- `readOnly` (optional): Open files as read-only (default: false)

**Example:**
```json
{
  "left": "C:\\project\\old\\config.json",
  "right": "C:\\project\\new\\config.json",
  "silent": true
}
```

**Returns:** `SAME`, `SIMILAR`, `DIFFERENT`, or `ERROR` with Beyond Compare exit code details.

### 2. `compare_folders`

Compare two folders and report differences in contents.

**Parameters:**
- `left` (required): Path to the left (source) folder
- `right` (required): Path to the right (target) folder
- `filters` (optional): File filter pattern (e.g., `*.js;*.ts` or `-*.log`)
- `silent` (optional): Quick comparison without GUI (default: true)

**Example:**
```json
{
  "left": "C:\\project\\v1\\src",
  "right": "C:\\project\\v2\\src",
  "filters": "*.ts;*.tsx",
  "silent": true
}
```

### 3. `merge_files`

Perform a 3-way merge with base, left, and right files.

**Parameters:**
- `left` (required): Path to the left file
- `right` (required): Path to the right file
- `center` (required): Path to the center (base/ancestor) file
- `output` (required): Path for the merged output file
- `automerge` (optional): Auto-merge non-conflicting changes (default: false)
- `reviewConflicts` (optional): Open GUI if automerge finds conflicts (default: false)
- `favorLeft` (optional): Favor left side for conflicts (default: false)
- `favorRight` (optional): Favor right side for conflicts (default: false)

**Example:**
```json
{
  "left": "C:\\merge\\mine.txt",
  "right": "C:\\merge\\theirs.txt",
  "center": "C:\\merge\\base.txt",
  "output": "C:\\merge\\result.txt",
  "automerge": true,
  "reviewConflicts": true
}
```

**Returns:** `SUCCESS`, `CONFLICTS`, or `ERROR`.

### 4. `sync_folders`

Open a Folder Sync session to synchronize two directories.

**Parameters:**
- `left` (required): Path to the left (source) folder
- `right` (required): Path to the right (target) folder
- `filters` (optional): File filter pattern (e.g., `-node_modules;-.git`)

**Example:**
```json
{
  "left": "C:\\source\\project",
  "right": "D:\\backup\\project",
  "filters": "-node_modules;-.git;-dist"
}
```

### 5. `run_script`

Run a Beyond Compare script file for automated batch operations.

**Parameters:**
- `scriptPath` (required): Path to the Beyond Compare script file
- `silent` (optional): Run without showing a window (default: true)
- `closeWhenDone` (optional): Close script window when finished (default: true)

**Example:**
```json
{
  "scriptPath": "C:\\scripts\\nightly-backup-compare.txt"
}
```

**Sample script file** (`nightly-backup-compare.txt`):
```
folder-report layout:side-by-side &
  options:display-mismatches &
  output-to:"C:\reports\diff-report.html" output-options:html-color &
  "C:\source" "C:\backup"
```

## Exit Codes

Beyond Compare returns meaningful exit codes that the MCP server translates:

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Binary same |
| 2 | Rules-based same |
| 11 | Binary differences |
| 12 | Similar |
| 13 | Rules-based differences |
| 14 | Conflicts detected |
| 100 | Error |
| 101 | Conflicts detected, merge output not saved |

## Usage Examples

### Example 1: Check if Two Config Files Match

Tell Claude:
```
Compare my dev and prod config files to see if they're in sync
```

### Example 2: Diff Two Project Versions

Tell Claude:
```
Compare the src folders between v1 and v2 of my project, only looking at TypeScript files
```

### Example 3: Auto-Merge a Git Conflict

Tell Claude:
```
Merge these three versions of the file — base, mine, and theirs — and auto-resolve what you can
```

### Example 4: Run a Backup Comparison Script

Tell Claude:
```
Run my nightly backup comparison script at C:\scripts\backup-check.txt
```

## How It Works

1. **Beyond Compare CLI**: BC exposes `BComp.com` (console) and `BComp.exe` (GUI) for command-line operations
2. **MCP Server**: Wraps `BComp.com` and translates arguments into CLI calls
3. **Exit Code Parsing**: Rich exit codes are mapped to human-readable verdicts (SAME, DIFFERENT, SIMILAR, CONFLICTS)
4. **Timeout Management**: Operations have appropriate timeouts (60s files, 120s folders, 300s merge/sync, 600s scripts)

## Troubleshooting

### Beyond Compare Not Found

**Error:** `Failed to execute BComp.com`

**Solutions:**
1. Verify Beyond Compare 5 is installed: `winget list ScooterSoftware.BeyondCompare.5`
2. Check the default path: `C:\Users\<username>\AppData\Local\Programs\Beyond Compare 5\BComp.com`
3. Set `BCOMP_PATH` environment variable in your MCP config

### Timeout on Large Comparisons

**Issue:** Folder comparisons or syncs time out

**Solution:** For very large directory trees, use `filters` to narrow the scope, or use `run_script` with a Beyond Compare script that has more control over the operation.

### License Required

Beyond Compare requires a license for full functionality. A 30-day trial is available. Without a license, some features may be limited.

## Development

```bash
# Clone repository
git clone https://github.com/danielsimonjr/beyondcompare-mcp.git
cd beyondcompare-mcp

# Install dependencies
npm install

# Test locally
node index.js
```

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Beyond Compare](https://www.scootersoftware.com/) by Scooter Software
- [Model Context Protocol](https://modelcontextprotocol.io) by Anthropic

## Links

- **GitHub Repository:** https://github.com/danielsimonjr/beyondcompare-mcp
- **Beyond Compare:** https://www.scootersoftware.com/
- **MCP Documentation:** https://modelcontextprotocol.io

---

**Made with care for the MCP community**
