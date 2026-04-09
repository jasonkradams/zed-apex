# zed-apex

Zed editor extension providing syntax highlighting for Apex, SOQL, and SOSL via tree-sitter-sfapex grammars.

## Commands

- `npm install` — install test dependencies (tree-sitter, tree-sitter-sfapex)
- `npm test` — run query compilation validation + highlight annotation tests
- `node tests/annotate.js soql "SELECT Id FROM Account"` — generate test annotation lines for a source string (also works with `sosl`)

## Testing

Tests live in `tests/soql/*.soql` and `tests/sosl/*.sosl`. Each file contains source code with `///`-prefixed annotation lines that assert capture scopes at specific columns.

The test runner (`tests/run-tests.js`) does two things:
1. Validates that every `.scm` file in `languages/*/` compiles against its grammar
2. Checks highlight annotations against actual tree-sitter captures

Always use `annotate.js` to generate annotation lines rather than hand-counting columns. It produces output you can paste directly into test files.

## Bumping the tree-sitter-sfapex commit

When updating the grammar commit in `extension.toml`, node types can change between versions. Common breakage patterns:

- **Node type removed or renamed** — e.g. `catch_formal_parameter` was unified into `formal_parameter`
- **Anonymous nodes become named** — e.g. modifier keywords like `"final"` became `(final)`; use parenthesized form in queries
- **Node restructured with wrapper** — e.g. `++`/`--` moved inside `update_operator`, `=>` moved inside `map_key_initializer`
- **Keywords removed** — e.g. `"default"` was removed from the grammar entirely

After bumping, run `npm test`. The query compilation check will catch invalid node types. To diagnose failures, inspect grammar node types:

```js
node -e "const s = require('tree-sitter-sfapex'); console.log(s.apex.nodeTypeInfo.find(n => n.type === 'some_node'))"
```

## Zed extension specifics

- `highlights.scm` must be a single merged file per language. Zed does not support multi-file highlight queries like tree-sitter's `inherits` mechanism. For SOQL and SOSL, upstream queries are combined into one file.
- `brackets.scm` node types must exist in the grammar. The SOQL and SOSL grammars only have `(` and `)` as punctuation nodes — no `[]` or `{}`.
- `config.toml` bracket entries control editor auto-close behavior and are independent of `brackets.scm` grammar node types.

## Git and issue workflow

- Use atomic, conventional commits (`feat:`, `fix:`, `test:`, `docs:`, etc.)
- Create feature branches named `feat/<description>` or `fix/<description>`
- PRs should reference issues with `Closes #N` in the body
- Assign PRs and issues to `jasonkradams`
- Apply relevant labels from: `enhancement`, `grammar`, `lsp`, `bug`, `documentation`
- Merge PRs with `--merge --delete-branch`
