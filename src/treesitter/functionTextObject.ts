import { SUPPORT_TREESITTER } from 'platform/constants';
import * as vscode from 'vscode';
import * as TreeSitter from 'web-tree-sitter';
import { RegisterAction } from '../actions/base';
import { BaseMovement, IMovement, failedMovement } from '../actions/baseMotion';
import { configuration } from '../configuration/configuration';
import { Mode } from '../mode/mode';
import { VimState } from '../state/vimState';
import {
  advanceStopForOperator,
  findAncestorOfType,
  pointToPosition,
  positionToOffset,
} from './nodeFinder';

/**
 * Tree-sitter node type names that represent callable/function-like constructs.
 * This list covers the most common grammars. For any language not listed here
 * the text object will gracefully fall back to `failedMovement`.
 */
const FUNCTION_NODE_TYPES = new Set([
  // Shared / generic
  'function_declaration',
  'function_definition',
  'function_item', // Rust
  'method_declaration',
  'method_definition',
  'arrow_function',
  'function_expression',
  'generator_function',
  'generator_function_declaration',
  'generator_function_expression',
  // Python
  'decorated_definition', // includes the decorator(s) for `af`
  // Go
  'func_literal',
  // Ruby
  'method',
  'singleton_method',
  // Java / C# / Kotlin / Scala
  'constructor_declaration',
  'local_function_statement',
  // Lua
  'function_statement',
  'local_function',
  // PHP
  'function_static_variable',
  // Swift
  'function_declaration',
  'init_declaration',
  // Zig
  'fn_decl',
]);

/**
 * Node types that represent the body of a function (used for `im`).
 */
const BODY_NODE_TYPES = new Set([
  'block',
  'statement_block', // JS/TS
  'body', // Python
  'compound_statement', // C, C++, Kotlin
  'block_node',
]);

/**
 * `am` — Select **around** the function under the cursor (including any
 * leading decorators / annotations and trailing newline).
 *
 * Falls back gracefully when tree-sitter is disabled or no syntax tree is
 * available for the current document.
 */
@RegisterAction
export class SelectAroundFunction extends BaseMovement {
  override modes = [Mode.Normal, Mode.Visual, Mode.VisualBlock, Mode.VisualLine];
  keys = ['a', 'm'];

  public override async execAction(
    position: vscode.Position,
    vimState: VimState,
  ): Promise<IMovement> {
    if (!SUPPORT_TREESITTER || !configuration.treeSitter.enable) {
      return failedMovement(vimState);
    }

    const tree = vimState.syntaxTree;
    if (!tree) {
      return failedMovement(vimState);
    }

    const offset = positionToOffset(vimState.document, position);
    const funcNode = findAncestorOfType(tree.rootNode, offset, FUNCTION_NODE_TYPES);
    if (!funcNode) {
      return failedMovement(vimState);
    }

    return {
      start: pointToPosition(funcNode.startPosition),
      stop: pointToPosition(funcNode.endPosition).getLeft(),
    };
  }

  public override async execActionForOperator(
    position: vscode.Position,
    vimState: VimState,
  ): Promise<IMovement> {
    const res = await this.execAction(position, vimState);
    if ('failed' in res) {
      return res;
    }
    res.stop = advanceStopForOperator(res.stop, vimState.document);
    return res;
  }
}

/**
 * `im` — Select **inside** the function body under the cursor (excluding the
 * function signature).
 *
 * Falls back gracefully when tree-sitter is disabled or no syntax tree is
 * available for the current document.
 */
@RegisterAction
export class SelectInsideFunction extends BaseMovement {
  override modes = [Mode.Normal, Mode.Visual, Mode.VisualBlock, Mode.VisualLine];
  keys = ['i', 'm'];

  public override async execAction(
    position: vscode.Position,
    vimState: VimState,
  ): Promise<IMovement> {
    if (!SUPPORT_TREESITTER || !configuration.treeSitter.enable) {
      return failedMovement(vimState);
    }

    const tree = vimState.syntaxTree;
    if (!tree) {
      return failedMovement(vimState);
    }

    const offset = positionToOffset(vimState.document, position);
    const funcNode = findAncestorOfType(tree.rootNode, offset, FUNCTION_NODE_TYPES);
    if (!funcNode) {
      return failedMovement(vimState);
    }

    // Try to find an explicit body child node first
    const bodyNode = funcNode.children.find(
      (child: TreeSitter.Node | null): child is TreeSitter.Node =>
        !!child && BODY_NODE_TYPES.has(child.type),
    );
    const targetNode = bodyNode ?? funcNode;

    // If we found a body node, select its contents (inside the braces)
    if (bodyNode) {
      // Select from first named child to last named child (excludes `{` and `}`)
      const firstChild = bodyNode.firstNamedChild;
      const lastChild = bodyNode.lastNamedChild;
      if (firstChild && lastChild) {
        return {
          start: pointToPosition(firstChild.startPosition),
          stop: pointToPosition(lastChild.endPosition).getLeft(),
        };
      }
      // Empty body — place cursor at the opening position
      return {
        start: pointToPosition(bodyNode.startPosition),
        stop: pointToPosition(bodyNode.startPosition),
        failed: true,
      };
    }

    // No explicit body node (e.g. arrow functions with expression bodies)
    return {
      start: pointToPosition(targetNode.startPosition),
      stop: pointToPosition(targetNode.endPosition).getLeft(),
    };
  }

  public override async execActionForOperator(
    position: vscode.Position,
    vimState: VimState,
  ): Promise<IMovement> {
    const res = await this.execAction(position, vimState);
    if ('failed' in res) {
      return res;
    }
    res.stop = res.stop.getRight();
    return res;
  }
}
