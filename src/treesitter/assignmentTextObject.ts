import { SUPPORT_TREESITTER } from 'platform/constants';
import * as vscode from 'vscode';
import * as TreeSitter from 'web-tree-sitter';
import { RegisterAction } from '../actions/base';
import { BaseMovement, IMovement, failedMovement } from '../actions/baseMotion';
import { configuration } from '../configuration/configuration';
import { Mode } from '../mode/mode';
import { VimState } from '../state/vimState';
import {
  findAncestorOfType,
  firstNonWhitespaceAtOrAfter,
  lastNonWhitespaceBefore,
  pointToPosition,
  positionToOffset,
} from './nodeFinder';

/**
 * Tree-sitter node type names that represent assignment-like constructs across
 * all supported grammars. Includes regular assignments, augmented assignments,
 * variable declarators, and object/dict/map property pairs.
 */
const ASSIGNMENT_NODE_TYPES = new Set([
  // JavaScript / TypeScript — assignments
  'assignment_expression',
  'augmented_assignment_expression',
  'variable_declarator',
  // JavaScript / TypeScript — object literal properties and class fields
  'pair',
  'field_definition',
  'public_field_definition',
  // Python — assignments and dict literal pairs
  'assignment',
  'augmented_assignment',
  'named_expression', // walrus operator :=
  // Go — assignments, short declarations, var/const specs, map/struct pairs
  'assignment_statement',
  'short_var_declaration',
  'var_spec',
  'const_spec',
  'keyed_element',
  // Rust — assignments and let bindings
  'compound_assignment_expr',
  'let_declaration',
  // Java — assignment expression and variable declarator (shared with JS/TS above)
]);

/** LHS field names tried in order across all supported node types. */
const LHS_FIELDS = ['left', 'name', 'pattern', 'key'] as const;

/** RHS field names tried in order across all supported node types. */
const RHS_FIELDS = ['right', 'value'] as const;

/**
 * Extract the LHS and RHS child nodes from an assignment node.
 *
 * For nodes with named fields (the majority), we try each field name in order.
 * `keyed_element` in Go has no named fields, so we fall back to the first and
 * last named children.
 */
function extractLhsRhs(
  node: TreeSitter.Node,
): { lhs: TreeSitter.Node; rhs: TreeSitter.Node } | undefined {
  let lhs: TreeSitter.Node | null = null;
  let rhs: TreeSitter.Node | null = null;

  for (const field of LHS_FIELDS) {
    lhs = node.childForFieldName(field);
    if (lhs) break;
  }
  for (const field of RHS_FIELDS) {
    rhs = node.childForFieldName(field);
    if (rhs) break;
  }

  // Fallback for nodes without named fields (e.g. Go keyed_element)
  if (!lhs) lhs = node.firstNamedChild;
  if (!rhs) rhs = node.lastNamedChild;

  // Sanity check: LHS and RHS must be distinct nodes
  if (!lhs || !rhs || lhs.id === rhs.id) {
    return undefined;
  }
  return { lhs, rhs };
}

// ---------------------------------------------------------------------------
// Shared guard used by all four text objects
// ---------------------------------------------------------------------------

function getAssignmentParts(
  position: vscode.Position,
  vimState: VimState,
): { lhs: TreeSitter.Node; rhs: TreeSitter.Node; docText: string } | undefined {
  if (!SUPPORT_TREESITTER || !configuration.treeSitter.enable) {
    return undefined;
  }
  const tree = vimState.syntaxTree;
  if (!tree) {
    return undefined;
  }
  const offset = positionToOffset(vimState.document, position);
  const assignNode = findAncestorOfType(tree.rootNode, offset, ASSIGNMENT_NODE_TYPES);
  if (!assignNode) {
    return undefined;
  }
  const parts = extractLhsRhs(assignNode);
  if (!parts) {
    return undefined;
  }
  return { ...parts, docText: vimState.document.getText() };
}

// ---------------------------------------------------------------------------
// ial — select inside the LHS (the variable / key / pattern only)
// ---------------------------------------------------------------------------

/**
 * `ial` — Select **inside** the left-hand side of the assignment under the
 * cursor (the variable name, destructuring pattern, or object key).
 *
 * Example: `x = 42` → selects `x`
 * Example: `{ key: value }` → selects `key`
 */
@RegisterAction
export class SelectInsideLhs extends BaseMovement {
  override modes = [Mode.Normal, Mode.Visual, Mode.VisualBlock, Mode.VisualLine];
  keys = ['i', '=', 'l'];

  public override async execAction(
    position: vscode.Position,
    vimState: VimState,
  ): Promise<IMovement> {
    const parts = getAssignmentParts(position, vimState);
    if (!parts) {
      return failedMovement(vimState);
    }
    const { lhs } = parts;
    return {
      start: pointToPosition(lhs.startPosition),
      stop: pointToPosition(lhs.endPosition).getLeft(),
    };
  }

  public override async execActionForOperator(
    position: vscode.Position,
    vimState: VimState,
  ): Promise<IMovement> {
    const res = await this.execAction(position, vimState);
    if ('failed' in res) return res;
    res.stop = res.stop.getRight();
    return res;
  }
}

// ---------------------------------------------------------------------------
// aal — select around the LHS (LHS + operator, e.g. "x =" or "key:")
// ---------------------------------------------------------------------------

/**
 * `aal` — Select **around** the left-hand side: the LHS plus the assignment
 * operator (and any surrounding whitespace up to the operator).
 *
 * Example: `x = 42`       → selects `x =`
 * Example: `count += 1`   → selects `count +=`
 * Example: `{ key: val }` → selects `key:`
 */
@RegisterAction
export class SelectAroundLhs extends BaseMovement {
  override modes = [Mode.Normal, Mode.Visual, Mode.VisualBlock, Mode.VisualLine];
  keys = ['a', '=', 'l'];

  public override async execAction(
    position: vscode.Position,
    vimState: VimState,
  ): Promise<IMovement> {
    const parts = getAssignmentParts(position, vimState);
    if (!parts) {
      return failedMovement(vimState);
    }
    const { lhs, rhs, docText } = parts;
    const rhsStartOffset = vimState.document.offsetAt(pointToPosition(rhs.startPosition));
    // Walk backward from the RHS start to find the last non-whitespace char
    // (that is the end of the operator, e.g. the `=` or `:`)
    const stopOffset = lastNonWhitespaceBefore(docText, rhsStartOffset);
    return {
      start: pointToPosition(lhs.startPosition),
      stop: vimState.document.positionAt(stopOffset),
    };
  }

  public override async execActionForOperator(
    position: vscode.Position,
    vimState: VimState,
  ): Promise<IMovement> {
    const res = await this.execAction(position, vimState);
    if ('failed' in res) return res;
    res.stop = res.stop.getRight();
    return res;
  }
}

// ---------------------------------------------------------------------------
// iar — select inside the RHS (the value expression only)
// ---------------------------------------------------------------------------

/**
 * `iar` — Select **inside** the right-hand side of the assignment under the
 * cursor (the value expression).
 *
 * Example: `x = 42`       → selects `42`
 * Example: `{ key: val }` → selects `val`
 */
@RegisterAction
export class SelectInsideRhs extends BaseMovement {
  override modes = [Mode.Normal, Mode.Visual, Mode.VisualBlock, Mode.VisualLine];
  keys = ['i', '=', 'r'];

  public override async execAction(
    position: vscode.Position,
    vimState: VimState,
  ): Promise<IMovement> {
    const parts = getAssignmentParts(position, vimState);
    if (!parts) {
      return failedMovement(vimState);
    }
    const { rhs } = parts;
    return {
      start: pointToPosition(rhs.startPosition),
      stop: pointToPosition(rhs.endPosition).getLeft(),
    };
  }

  public override async execActionForOperator(
    position: vscode.Position,
    vimState: VimState,
  ): Promise<IMovement> {
    const res = await this.execAction(position, vimState);
    if ('failed' in res) return res;
    res.stop = res.stop.getRight();
    return res;
  }
}

// ---------------------------------------------------------------------------
// aar — select around the RHS (operator + RHS, e.g. "= 42" or ": val")
// ---------------------------------------------------------------------------

/**
 * `aar` — Select **around** the right-hand side: the assignment operator (and
 * any surrounding whitespace after the LHS) plus the value expression.
 *
 * Example: `x = 42`       → selects `= 42`
 * Example: `count += 1`   → selects `+= 1`
 * Example: `{ key: val }` → selects `: val`
 */
@RegisterAction
export class SelectAroundRhs extends BaseMovement {
  override modes = [Mode.Normal, Mode.Visual, Mode.VisualBlock, Mode.VisualLine];
  keys = ['a', '=', 'r'];

  public override async execAction(
    position: vscode.Position,
    vimState: VimState,
  ): Promise<IMovement> {
    const parts = getAssignmentParts(position, vimState);
    if (!parts) {
      return failedMovement(vimState);
    }
    const { lhs, rhs, docText } = parts;
    const lhsEndOffset = vimState.document.offsetAt(pointToPosition(lhs.endPosition));
    // Walk forward from LHS end to find the first non-whitespace char
    // (that is the start of the operator, e.g. `=`, `+=`, or `:`)
    const startOffset = firstNonWhitespaceAtOrAfter(docText, lhsEndOffset);
    return {
      start: vimState.document.positionAt(startOffset),
      stop: pointToPosition(rhs.endPosition).getLeft(),
    };
  }

  public override async execActionForOperator(
    position: vscode.Position,
    vimState: VimState,
  ): Promise<IMovement> {
    const res = await this.execAction(position, vimState);
    if ('failed' in res) return res;
    res.stop = res.stop.getRight();
    return res;
  }
}
