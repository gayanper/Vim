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
  findNearestEnclosingOfType,
  pointToPosition,
  positionToOffset,
} from './nodeFinder';

/**
 * Tree-sitter node type names that represent class-like constructs:
 * class declarations, object literals, interfaces, enums, structs, traits, etc.
 *
 * This list covers the most common grammars. For any language not listed here
 * the text object will gracefully fall back to `failedMovement`.
 */
const CLASS_NODE_TYPES = new Set([
  // JavaScript / TypeScript — class syntax
  'class_declaration',
  'class_expression',
  'class', // class expression used as a value (e.g. `x = class Foo {}`)
  'abstract_class_declaration',

  // JavaScript / TypeScript — object literals: { key: value }
  'object',

  // TypeScript — structural types
  'interface_declaration',
  'enum_declaration',

  // Python
  'class_definition',
  'decorated_definition', // @decorator\nclass Foo: — cursor on decorator line

  // Go — type declarations (wraps struct_type, interface_type, etc.)
  'type_declaration',

  // Rust
  'struct_item',
  'enum_item',
  'trait_item',
  'impl_item',

  // Java
  // class_declaration, interface_declaration, enum_declaration — already listed above
  'annotation_type_declaration',
  'record_declaration',
]);

/**
 * Node type names that represent the body of a class-like construct.
 * Used by `SelectInsideClass` to find the content node within the matched
 * class node.
 */
const CLASS_BODY_NODE_TYPES = new Set([
  'class_body', // JS/TS class, Java class / interface / record
  'enum_body', // TypeScript enum, Java enum
  'block', // Python class body
  'field_declaration_list', // Rust struct fields, Go struct body
  'declaration_list', // Rust impl body
  'enum_variant_list', // Rust enum variants
  'interface_body', // Java interface body
  'method_spec_list', // Go interface method list
]);

/**
 * Recursively searches `node`'s descendants (up to `maxDepth` levels) for a
 * node whose type is in `types`. Handles deep nesting such as Go's
 * `type_declaration → type_spec → struct_type → field_declaration_list`.
 */
function findDescendantOfType(
  node: TreeSitter.Node,
  types: Set<string>,
  maxDepth: number,
): TreeSitter.Node | undefined {
  if (maxDepth === 0) {
    return undefined;
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) {
      continue;
    }
    if (types.has(child.type)) {
      return child;
    }
    const found = findDescendantOfType(child, types, maxDepth - 1);
    if (found) {
      return found;
    }
  }
  return undefined;
}

/**
 * Returns the body node within `classNode` (e.g. `class_body`, `enum_body`).
 * For JS/TS object literals the node itself is the body.
 */
function findClassBodyNode(classNode: TreeSitter.Node): TreeSitter.Node | undefined {
  if (classNode.type === 'object') {
    return classNode;
  }
  return findDescendantOfType(classNode, CLASS_BODY_NODE_TYPES, 3);
}

/**
 * `ac` — Select **around** the class/object/struct under the cursor.
 *
 * Selects the entire construct including its keyword, name, and body.
 * For operators (e.g. `dac`) the selection is extended to include the
 * trailing newline so the whole "line block" is removed.
 *
 * Falls back gracefully when tree-sitter is disabled or no syntax tree is
 * available for the current document.
 */
@RegisterAction
export class SelectAroundClass extends BaseMovement {
  override modes = [Mode.Normal, Mode.Visual, Mode.VisualBlock, Mode.VisualLine];
  keys = ['a', 'c'];

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
    let classNode = findNearestEnclosingOfType(tree.rootNode, offset, CLASS_NODE_TYPES);
    if (!classNode) {
      return failedMovement(vimState);
    }

    // When the cursor is on the `class` keyword, class name, or inside the
    // body of a decorated Python class, `findAncestorOfType` stops at the
    // inner `class_definition` node (which is in CLASS_NODE_TYPES) before
    // reaching the outer `decorated_definition`.  Promote to the parent so
    // that `vac` includes the decorator line(s).
    if (
      classNode.type === 'class_definition' &&
      classNode.parent?.type === 'decorated_definition'
    ) {
      classNode = classNode.parent;
    }

    return {
      start: pointToPosition(classNode.startPosition),
      stop: pointToPosition(classNode.endPosition).getLeft(),
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
 * `ic` — Select **inside** the class/object/struct body under the cursor.
 *
 * Selects the content between the opening and closing delimiters (`{`/`}`
 * for most languages, or the indented block for Python), excluding the
 * delimiters themselves.
 *
 * For empty bodies the movement fails gracefully.
 *
 * Falls back gracefully when tree-sitter is disabled or no syntax tree is
 * available for the current document.
 */
@RegisterAction
export class SelectInsideClass extends BaseMovement {
  override modes = [Mode.Normal, Mode.Visual, Mode.VisualBlock, Mode.VisualLine];
  keys = ['i', 'c'];

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
    const classNode = findNearestEnclosingOfType(tree.rootNode, offset, CLASS_NODE_TYPES);
    if (!classNode) {
      return failedMovement(vimState);
    }

    const bodyNode = findClassBodyNode(classNode);
    if (!bodyNode) {
      return failedMovement(vimState);
    }

    // Select from first named child to last named child (excludes `{` / `}`)
    const firstChild = bodyNode.firstNamedChild;
    const lastChild = bodyNode.lastNamedChild;

    if (firstChild && lastChild) {
      // For JS/TS object literals the `object` node itself is the body, and
      // commas between pairs are anonymous children (not part of any `pair`
      // node).  Using `lastNamedChild.endPosition` would land after the last
      // pair value, one position before any trailing comma.  Instead, find the
      // last child before the closing `}` so trailing commas are included.
      let stopNode: TreeSitter.Node = lastChild;
      if (bodyNode.type === 'object') {
        for (let i = bodyNode.childCount - 1; i >= 0; i--) {
          const child = bodyNode.child(i);
          if (child && child.type !== '}') {
            stopNode = child;
            break;
          }
        }
      }

      return {
        start: pointToPosition(firstChild.startPosition),
        stop: pointToPosition(stopNode.endPosition).getLeft(),
      };
    }

    // Empty body — fail gracefully
    return {
      start: pointToPosition(bodyNode.startPosition),
      stop: pointToPosition(bodyNode.startPosition),
      failed: true,
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
