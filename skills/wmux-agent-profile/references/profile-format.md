# Profile format

`profile.json` is a versioned manifest. Paths under `source` are profile-relative. Target paths expand `~` and environment variables on the receiving machine. Each item may include `platforms` with any of `linux`, `darwin`, or `windows`.

```json
{
  "version": 1,
  "name": "personal",
  "tools": [
    {
      "id": "example-tool",
      "command": "example-tool",
      "versionArgs": ["--version"],
      "versionPattern": "^example-tool 1\\.2\\.3$",
      "installTarget": "~/.local/bin/example-tool",
      "platforms": ["linux", "darwin"],
      "artifacts": {
        "linux-x86_64": {
          "url": "https://example.invalid/example-tool-1.2.3-linux.tar.gz",
          "sha256": "<64 hexadecimal characters>",
          "format": "tar.gz",
          "binary": "example-tool"
        }
      }
    }
  ],
  "managedText": [
    {
      "id": "shared-policy",
      "source": "instructions/shared.md",
      "target": "~/.codex/AGENTS.md",
      "comment": "html",
      "requires": ["example-tool"]
    }
  ],
  "trees": [
    { "source": "skills", "target": "~/.agents/skills" }
  ],
  "jsonMerges": [
    { "source": "settings/claude.json", "target": "~/.claude/settings.json" }
  ],
  "tomlBlocks": [
    {
      "id": "codex-tools",
      "source": "settings/codex-tools.toml",
      "target": "~/.codex/config.toml",
      "claims": [{ "kind": "section", "name": "mcp_servers.example" }]
    }
  ]
}
```

- `files` copies individual files. Existing files are changed only when their bytes equal the last profile-owned version.
- `trees` applies the same rule recursively. Empty directories and symlinks are not distributed.
- `managedText` owns only its marked block inside a text file, preserving all text outside the markers.
- `jsonMerges` owns individual leaf values. Existing unequal leaves remain conflicts unless they still equal the last applied value.
- `tomlBlocks` appends a marked TOML fragment. `claims` prevents adding a duplicate scalar key or table already present outside the managed block.
- `tools` declares optional, platform-specific prerequisites. Every artifact must be a fixed HTTPS URL with a SHA-256 digest. Supported artifact formats are `raw`, `tar.gz`, and `zip`; Linux/macOS bootstrap installs one binary atomically at `installTarget`.
- `requires` may be added to any managed item. A missing or wrong-version tool reports `blocked` and leaves that item untouched. Run `bootstrap --tool <id>` explicitly to install a pinned artifact; automatic apply never installs tools.

`add-skill <directory> --profile <directory>` validates a skill and copies it under the profile's `skills/` tree. It records source, revision, license, and a content hash in `skills.lock.json`. Existing changed skills require `--replace`; the command does not commit or push the profile repository.

`plan` never writes targets, logs, or ownership state. `apply` backs up changed existing files under `~/.wmux/agent-profile-backups`, uses atomic file replacement, and records hashes plus the latest backup paths in `~/.wmux/agent-profile-state.json`. It never deletes targets. Applied runs append a summary to `~/.wmux/logs/agent-profile.log`. `status` includes declared prerequisite health.
