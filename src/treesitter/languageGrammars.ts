/**
 * Maps VS Code language identifiers to their corresponding tree-sitter WASM grammar file names.
 * Grammar files are bundled from the `@vscode/tree-sitter-wasm` package into `out/wasm/`.
 *
 * Only languages for which @vscode/tree-sitter-wasm ships a pre-built grammar are listed here.
 */
export const LANGUAGE_GRAMMAR_MAP: Readonly<Record<string, string>> = {
  typescript: 'tree-sitter-typescript.wasm',
  typescriptreact: 'tree-sitter-tsx.wasm',
  javascript: 'tree-sitter-javascript.wasm',
  javascriptreact: 'tree-sitter-javascript.wasm',
  python: 'tree-sitter-python.wasm',
  go: 'tree-sitter-go.wasm',
  rust: 'tree-sitter-rust.wasm',
  java: 'tree-sitter-java.wasm',
};
