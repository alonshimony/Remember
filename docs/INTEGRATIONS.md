# Connect a second brain

1. In Settings → Connections, explicitly select spaces. Work is the initial selection; Private Inbox and Personal are not preselected.
2. Create a token, copy it once, and store it in the consuming system's secret manager. All No-external-AI notes remain excluded.
3. Set `REMEMBER_URL` to the HTTPS application origin and `REMEMBER_TOKEN` to that token in the local process environment. Never put the token into a URL.

## HTTP

Authenticated `GET /api/v1/{memories,timeline,events,entities,search,context,changes,commitments}` endpoints return `{data, next_cursor}`. `GET /api/v1/memories/{UUID}` retrieves one allowed original. Search/context accept `q`; page sizes are limited to 100. Context never causes a paid AI call. OpenAPI is in openapi.json.

Pass `Authorization: Bearer ...`. Reuse the opaque next cursor verbatim. Tokens have immutable scope; revoke and issue a new token for scope changes. A cursor from another token is invalid. The change feed retains tombstones indefinitely in this version. A deletion entry contains only an object ID/version/operation and null memory, never the former private body.

## Folder sync

```sh
npm run sync -- --folder /path/to/second-brain/remember --dry-run
npm run sync -- --folder /path/to/second-brain/remember
npm run sync -- --folder /path/to/second-brain/remember --full-resync
```

Windows paths are supported, for example `--folder "C:\\Notes\\Remember"`. The first run checks for unmanaged filename collisions. Only UUID Markdown/JSON files listed in `.remember-sync.json` may be replaced/deleted. Ownership is journaled before writes; the cursor advances only after successful writes. Keep the manifest with the folder. Use one sync process per destination. Schedule this command in the owner's chosen local scheduler; this repository does not install a recurring job automatically.

## Local read-only MCP

Start with `npm run mcp`. For a compatible stdio host, configure the executable as `node` and arguments as `--import`, `tsx`, `tools/mcp/index.ts`, with the repository as working directory. Supply REMEMBER_URL and REMEMBER_TOKEN through that host's environment/secret configuration.

Tools: `search_memories`, `get_memory`, `get_timeline`, `get_entity_context`, `get_open_commitments`. No write/delete/send tools exist. Diagnostics go to stderr. The bridge uses the scoped HTTP API, never database admin credentials. Responses are bounded and preserve source IDs. It is not a hosted MCP server and cannot be used by a hosted-only client that cannot launch local processes.

The automated test uses the real SDK client and stdio handshake; live external second-brain connection is unverified.
