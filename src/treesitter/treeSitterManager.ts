import { existsSync } from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Edit, Language, Parser, Tree, type Point } from 'web-tree-sitter';
import { Logger } from '../util/logger';
import { LANGUAGE_GRAMMAR_MAP } from './languageGrammars';

interface DocumentParseState {
  parser: Parser;
  tree: Tree;
}

/**
 * Manages one tree-sitter Parser and Tree per open document.
 *
 * Call `TreeSitterManager.initDocument()` when a document opens (or when
 * tree-sitter is enabled), `applyEdit()` on every content change to keep the
 * tree incrementally updated, and `deleteDocument()` when the document closes.
 */
class TreeSitterManagerImpl implements vscode.Disposable {
  private readonly documentStates = new Map<string, DocumentParseState>();
  private runtimeInitialized = false;
  private wasmDir: string | undefined;

  private async initParser(): Promise<void> {
    if (this.runtimeInitialized) {
      return;
    }
    await Parser.init({
      locateFile: (scriptName: string, scriptDirectory: string) => {
        return path.join(scriptDirectory, scriptName);
      },
    });
    this.runtimeInitialized = true;
  }

  /**
   * Returns the directory containing tree-sitter WASM files.
   */
  private getWasmDir(): string {
    if (this.wasmDir) {
      return this.wasmDir;
    }

    // in extension runtime the wasm dir is at 'out/wasm' and __dirname is 'out'
    let p = path.join(__dirname, 'wasm');
    if (existsSync(p)) {
      this.wasmDir = p;
    } else {
      // in test runtime the wasm dir is at 'out/wasm' and __dirname is 'out/src/treesitter'
      p = path.join(__dirname, '../../wasm');
      this.wasmDir = p;
    }
    return this.wasmDir;
  }

  /**
   * Parses the full text of a document and stores the resulting tree.
   * Safe to call multiple times for the same URI; re-parses from scratch.
   */
  async initDocument(uri: vscode.Uri, languageId: string, text: string): Promise<void> {
    const grammarFile = LANGUAGE_GRAMMAR_MAP[languageId];
    if (!grammarFile) {
      return; // No grammar available for this language — silently skip
    }

    try {
      await this.initParser();

      const wasmPath = path.join(this.getWasmDir(), grammarFile);
      const language = await Language.load(wasmPath);
      const parser = new Parser();
      parser.setLanguage(language);

      const tree = parser.parse(text);
      if (!tree) {
        Logger.warn(`TreeSitterManager: parse returned null for ${uri.toString()}`);
        return;
      }

      // Clean up previous state for this document
      this.deleteDocument(uri);
      this.documentStates.set(uri.toString(), { parser, tree });
    } catch (err) {
      Logger.warn(`TreeSitterManager: failed to init document ${uri.toString()}: ${err}`);
    }
  }

  /**
   * Applies a batch of VS Code content changes incrementally to the stored tree,
   * then re-parses. Edits are applied in the order they arrive.
   */
  applyEdit(
    uri: vscode.Uri,
    contentChanges: readonly vscode.TextDocumentContentChangeEvent[],
    newText: string,
  ): void {
    const state = this.documentStates.get(uri.toString());
    if (!state) {
      return;
    }

    for (const change of contentChanges) {
      const startIndex = change.rangeOffset;
      const oldEndIndex = change.rangeOffset + change.rangeLength;
      const newEndIndex = change.rangeOffset + change.text.length;

      const startPosition: Point = {
        row: change.range.start.line,
        column: change.range.start.character,
      };
      const oldEndPosition: Point = {
        row: change.range.end.line,
        column: change.range.end.character,
      };
      const newEndPosition = computeNewEndPosition(change.range.start, change.text);

      const edit: Edit = new Edit({
        startIndex,
        oldEndIndex,
        newEndIndex,
        startPosition,
        oldEndPosition,
        newEndPosition,
      });

      state.tree.edit(edit);
    }

    const newTree = state.parser.parse(newText, state.tree);
    if (newTree) {
      state.tree.delete();
      state.tree = newTree;
    } else {
      Logger.warn(`TreeSitterManager: incremental parse returned null for ${uri.toString()}`);
    }
  }

  /**
   * Returns the current syntax tree for a document, or `undefined` if no tree
   * is available (document not open, language not supported, or tree-sitter
   * disabled).
   */
  getTree(uri: vscode.Uri): Tree | undefined {
    return this.documentStates.get(uri.toString())?.tree;
  }

  /**
   * Frees the parser and tree for a closed document.
   */
  deleteDocument(uri: vscode.Uri): void {
    const state = this.documentStates.get(uri.toString());
    if (state) {
      state.tree.delete();
      state.parser.delete();
      this.documentStates.delete(uri.toString());
    }
  }

  dispose(): void {
    for (const state of this.documentStates.values()) {
      state.tree.delete();
      state.parser.delete();
    }
    this.documentStates.clear();
  }
}

/**
 * Computes the end position of inserted text given its start position.
 */
function computeNewEndPosition(startPosition: vscode.Position, insertedText: string): Point {
  if (insertedText.length === 0) {
    return { row: startPosition.line, column: startPosition.character };
  }

  const lines = insertedText.split('\n');
  if (lines.length === 1) {
    return {
      row: startPosition.line,
      column: startPosition.character + insertedText.length,
    };
  }

  return {
    row: startPosition.line + lines.length - 1,
    column: lines[lines.length - 1].length,
  };
}

export const TreeSitterManager = new TreeSitterManagerImpl();
