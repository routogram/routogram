# next-pc-ecommerce

A complete Next.js App Router example for a small PC-parts and custom-build shop.

## Run

From this directory:

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000 — it redirects to `/en`.

Routes:

- `/en` — storefront home
- `/en/products/aurora-rtx-4070` — product detail
- `/en/auth/login` — login
- `/en/auth/sign-up` — sign-up
- `/en/console` — shop dashboard
- `/en/console/products` — product management
- `/en/black-friday` — campaign landing page

The example uses mock data and a small in-process `graphql-yoga` schema. No database is required.

## Architecture notes

- Every file and folder in `src/` is kebab-case; React identifiers remain PascalCase.
- Widgets under `_components/` and `_shared/` follow `template.tsx` + `server.tsx` or `client.tsx` + `skeleton.tsx`.
- `locale-switcher` is the complete four-file contract example (server + client + template + skeleton).
- `proxy.ts` owns the `next-intl` middleware; `middleware.ts` is the Next.js entry point.
- GraphQL query constants live in `src/lib/apis/graphql/queries.ts`; request types live in `src/lib/apis/models/`.
- Route-level `_handlers/index.ts` files map GraphQL payloads into page view models.


## Routogram

From this directory:

```bash
pnpm routogram:static
```

The command is workspace-aware and scans this example via `INIT_CWD`, producing `routogram-report/index.html` and `routogram-report/topology.json`.

- Route groups `(site)`, `(entry)`, `(console)`, `(landing)` are removed from URL paths.
- `[locale]` remains the dynamic locale segment.
- `server.tsx` / `client.tsx` widget entries are named from their parent folder and tagged with `componentType`.
- Imports of `template.tsx` are folded into the entry node for class/CSS analysis.
- Imports of `@/lib/apis/graphql` or route `_handlers` are linked to the `/api/graphql` boundary.

### AI assistant settings

AI is configured directly in the Canvas Ask AI drawer, not in `.routogramrc.json`.

- Choose a model from the model selector.
- Choose reasoning effort: Low, Medium, or High.
- Paste the provider API key when prompted.
- Settings and provider keys are persisted in browser `localStorage` (`routogram-ai-settings`).

`.routogramrc.json` remains limited to code-analysis configuration: framework, aliases, tokens, and maxDepth. Its `$schema` points to the locally installed `node_modules/routogram/configuration_schema.json`.

### Environment variables

The CLI loads `.env` from its current working directory and resolves `${ENV_VAR}`
placeholders in `.routogramrc.json` before parsing:

```dotenv
# .env
DEEPSEEK_API_KEY=sk-...
```

Missing variables resolve to an empty string and emit:

```text
[Routogram] Warning: Environment variable KEY is not defined
```

`GET /api/config` returns the resolved project config with secret fields such as
`apiKey`, `secret`, `password`, and access tokens masked. For example:

```json
{
  "integration": {
    "apiKey": "sk-...abcd"
  }
}
```
