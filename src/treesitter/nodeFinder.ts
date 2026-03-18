import * as vscode from 'vscode';
import * as TreeSitter from 'web-tree-sitter';

/**
 * Returns the byte offset of a VS Code position in the document.
 */
export function positionToOffset(document: vscode.TextDocument, pos: vscode.Position): number {
  return document.offsetAt(pos);
}

/**
 * Converts a tree-sitter Point (0-based row/column) to a VS Code Position.
 */
export function pointToPosition(point: TreeSitter.Point): vscode.Position {
  return new vscode.Position(point.row, point.column);
}

/**
 * Walk the tree from the cursor upward, returning the nearest named ancestor
 * (or self) whose type is in `nodeTypes`. Anonymous keyword tokens (e.g. the
 * bare `class` token) are skipped.
 *
 * Use this when you want strictly the innermost enclosing node — no sibling
 * scanning.
 */
export function findNearestEnclosingOfType(
  rootNode: TreeSitter.Node,
  offset: number,
  nodeTypes: Set<string>,
): TreeSitter.Node | undefined {
  let node: TreeSitter.Node | null = rootNode.descendantForIndex(offset);
  while (node) {
    if (node.isNamed && nodeTypes.has(node.type)) {
      return node;
    }
    node = node.parent;
  }
  return undefined;
}

/**
 * Walk the tree from the cursor upward, returning the nearest ancestor (or
 * self) whose type is in `nodeTypes`.
 *
 * Also handles the case where the cursor lands on a keyword sibling of the
 * target node — e.g. the `let`/`const`/`var` keyword in a
 * `lexical_declaration` is a sibling of `variable_declarator`, not an
 * ancestor.  For each non-matching ancestor, named children are scanned:
 * a child that contains the cursor is preferred; otherwise the first match
 * is returned.
 */
export function findAncestorOfType(
  rootNode: TreeSitter.Node,
  offset: number,
  nodeTypes: Set<string>,
): TreeSitter.Node | undefined {
  let node: TreeSitter.Node | null = rootNode.descendantForIndex(offset);

  while (node) {
    if (nodeTypes.has(node.type)) {
      return node;
    }

    let firstMatch: TreeSitter.Node | null = null;
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child && nodeTypes.has(child.type)) {
        if (offset >= child.startIndex && offset < child.endIndex) {
          return child;
        }
        firstMatch ??= child;
      }
    }
    if (firstMatch) {
      return firstMatch;
    }

    node = node.parent;
  }
  return undefined;
}

/**
 * Extends `stop` to consume the trailing newline when used with an operator
 * (e.g. `dac`, `dam`), so the whole "line block" is deleted.
 */
export function advanceStopForOperator(
  stop: vscode.Position,
  document: vscode.TextDocument,
): vscode.Position {
  const lineText = document.lineAt(stop.line).text;
  if (stop.character === lineText.length - 1 && stop.line < document.lineCount - 1) {
    return new vscode.Position(stop.line + 1, 0);
  }
  return stop.getRight();
}

/**
 * Returns the offset of the last non-whitespace character strictly before
 * `endOffset` in `text` (i.e. the trailing edge of an operator like `=`).
 */
export function lastNonWhitespaceBefore(text: string, endOffset: number): number {
  const trimmed = text.slice(0, endOffset).trimEnd();
  return trimmed.length > 0 ? trimmed.length - 1 : endOffset - 1;
}

/**
 * Returns the offset of the first non-whitespace character at or after
 * `startOffset` in `text` (i.e. the leading edge of an operator like `=`).
 */
export function firstNonWhitespaceAtOrAfter(text: string, startOffset: number): number {
  const match = text.slice(startOffset).search(/\S/);
  return match >= 0 ? startOffset + match : startOffset;
}
