# Apex for Zed

Apex, SOQL, and SOSL language support for the [Zed](https://zed.dev) editor.

## Features

- Syntax highlighting for Apex (`.cls`, `.trigger`), SOQL (`.soql`), and SOSL (`.sosl`) files
- Code folding, indentation, and bracket matching
- Symbol outline via `tags.scm` (classes, interfaces, enums, methods)
- SOQL/SOSL injected inside Apex string literals
- Apex Language Server support via [apex-jorje-lsp](https://github.com/forcedotcom/salesforcedx-vscode/tree/develop/packages/salesforcedx-vscode-apex)
- 50+ code snippets for common Apex patterns

## Installation

Search for **Apex** in Zed's extension panel (`zed: extensions`) and install.

Or add it manually to your `~/.config/zed/settings.json`:

```json
{
  "auto_install_extensions": {
    "apex": true
  }
}
```

## Language Server

This extension includes support for the Apex Language Server (`apex-jorje-lsp`), which provides diagnostics, go-to-definition, and hover documentation.

The extension automatically downloads and manages both the language server jar (from [salesforcedx-vscode](https://github.com/forcedotcom/salesforcedx-vscode)) and a bundled Amazon Corretto 21 JDK. No Java installation required.

## Snippets

The extension ships snippets for common Apex patterns. Trigger them by typing the prefix and selecting from completions.

| Prefix         | Description         |
| -------------- | ------------------- |
| `class`        | Class declaration   |
| `trigger`      | Trigger declaration |
| `method`       | Method              |
| `staticmethod` | Static method       |
| `constructor`  | Constructor         |
| `prop`         | Property            |
| `for`          | For-each loop       |
| `fors`         | For SOQL loop       |
| `soql`         | SOQL query          |
| `soqllist`     | SOQL to List        |
| `soqlmap`      | SOQL to Map         |
| `try`          | Try/catch           |
| `testmethod`   | Test method         |
| `runas`        | System.runAs block  |
| `auraenabled`  | AuraEnabled method  |
| `future`       | Future method       |
| `invocable`    | Invocable method    |
| `debug`        | System.debug        |

## Grammar

Syntax highlighting is powered by the [tree-sitter-sfapex](https://github.com/aheber/tree-sitter-sfapex) grammar.
