---
name: wmux-agent-profile
description: Safely inspect, plan, apply, and troubleshoot wmux agent profiles across local, SSH, and Windows machines. Use when synchronizing root agent instructions, adding or updating an Agent Skill in a profile, provisioning an explicit profile tool prerequisite, or distributing narrowly scoped Claude/Codex settings without overwriting machine-local configuration.
---

# wmux Agent Profile

Use `wmux-agent-profile` to make an explicit, reviewable layer of agent configuration available on wmux machines. The default operation is a read-only plan; applying uses ownership records and refuses unmanaged or locally changed content.

## Workflow

1. Locate the profile. Prefer `WMUX_AGENT_PROFILE_PATH`; otherwise wmux discovers `../wmux-agent-profile` beside its checkout, then `~/.wmux/agent-profile`.
2. Read `profile.json` and the format reference before changing a profile.
3. When asked to add a skill, run `scripts/wmux-agent-profile add-skill /path/to/skill --profile /path/to/profile`. Review `skills.lock.json`, especially source, revision, license, and hash. A changed destination requires the explicit `--replace` flag after comparing it.
4. Run `scripts/wmux-agent-profile plan --profile /path/to/profile` locally. Review every `create`, `update`, `blocked`, and `conflict` result.
5. If an item is blocked on a declared tool, inspect its pinned artifact and checksum. Run `scripts/wmux-agent-profile bootstrap --tool <id> --profile /path/to/profile` only when the user has approved installation. Automatic workspace apply never bootstraps tools.
6. Use `apply` only after reviewing the plan. Never resolve a conflict by deleting or replacing the target wholesale.
7. Open a new wmux pane on each target to exercise the automatic remote fetch/apply path, then run `wmux-agent-profile status` there.

For a server-hosted profile, omit `--profile`; the helper fetches the authenticated `/api/agent-profile` bundle. Use `--json` when another tool needs structured output.

## Safety Rules

- Keep personal profiles outside the public wmux repository. Use `examples/wmux-agent-profile` only as a sanitized template.
- Do not include OAuth state, API keys, bearer tokens, trust databases, histories, caches, or entire Claude/Codex configuration files.
- Prefer `managedText` for root instruction files, `trees` for skills, and small `jsonMerges` or claimed `tomlBlocks` for explicit settings.
- Preserve conflicts for human review. The state file proves ownership; it is not permission to overwrite a locally modified value.
- Keep platform selectors narrow. Do not apply POSIX command requirements to Windows unless the command is installed there.
- Keep bootstrap artifacts version-pinned and SHA-256-pinned. Do not use a moving release URL, `curl | sh`, or silent provisioning during workspace creation.
- `add-skill` rejects symlinks, common secret files, private-key material, and generated dependency/cache trees. An unspecified license is a warning that must be resolved or accepted before committing.
- Treat a profile served by wmux as sensitive even if it contains no secrets; it describes agent behavior and tooling.

Read [references/profile-format.md](references/profile-format.md) for the manifest fields and conflict semantics.
