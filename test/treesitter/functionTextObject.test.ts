import { Mode } from '../../src/mode/mode';
import { newTest } from '../testSimplifier';
import { setupWorkspace } from '../testUtils';

/**
 * Integration tests for the tree-sitter-powered `am`/`im` function text objects.
 *
 * These tests require `vim.treeSitter.enable = true`. They use the standard
 * `newTest` helper which drives keystrokes through the full ModeHandler
 * pipeline, exercising the tree-sitter integration end-to-end.
 */
suite('tree-sitter am/im text objects', function () {
  // WASM initialisation can be slow
  this.timeout(20_000);

  suiteSetup(async () => {
    await setupWorkspace({ fileExtension: '.ts' });
  });

  const treeSitterConfig = { treeSitter: { enable: true } };

  // ---------------------------------------------------------------------------
  // TypeScript — arrow functions
  // ---------------------------------------------------------------------------

  newTest({
    title: 'vam — select around a TypeScript arrow function (single line)',
    config: treeSitterConfig,
    start: ['const greet = (name: string) => {', '  return "Hello, " + |name;', '};'],
    keysPressed: 'vam',
    end: ['const greet = (name: string) => {', '  return "Hello, " + name;', '}|;'],
  });

  newTest({
    title: 'dim — delete inside a TypeScript function body',
    config: treeSitterConfig,
    start: ['function add(a: number, b: number): number {', '  |return a + b;', '}'],
    keysPressed: 'dim',
    end: ['function add(a: number, b: number): number {', ' | ', '}'],
  });

  newTest({
    title: 'vam — visually select around a TypeScript function',
    config: treeSitterConfig,
    start: ['|function hello() {', '  console.log("hi");', '}'],
    keysPressed: 'vam',
    end: ['function hello() {', '  console.log("hi");', '}|'],
    endMode: Mode.Visual,
  });

  // ---------------------------------------------------------------------------
  // TypeScript — nested functions
  // ---------------------------------------------------------------------------

  newTest({
    title: 'am — selects the immediately enclosing function for nested functions',
    config: treeSitterConfig,
    start: ['function outer() {', '  function inner() {', '    |const x = 1;', '  }', '}'],
    keysPressed: 'vam',
    end: ['function outer() {', '  function inner() {', '    const x = 1;', '  }|', '}'],
  });

  newTest({
    title: 'dam — deletes a multi-line function including its trailing newline',
    config: treeSitterConfig,
    start: ['function first() {', '  const value = |1;', '}', 'const after = 2;'],
    keysPressed: 'dam',
    end: ['|const after = 2;'],
  });

  // ---------------------------------------------------------------------------
  // Python — def functions
  // ---------------------------------------------------------------------------

  newTest({
    title: 'am — selects a Python function definition (including def line)',
    config: treeSitterConfig,
    start: ['def greet(name):', '    |return f"Hello, {name}"'],
    keysPressed: 'yam',
    end: ['def greet(name):', '    |return f"Hello, {name}"'],
  });

  // ---------------------------------------------------------------------------
  // Graceful fallback when tree-sitter is disabled
  // ---------------------------------------------------------------------------

  newTest({
    title: 'am — does nothing when tree-sitter is disabled',
    config: { treeSitter: { enable: false } },
    start: ['function hello() {', '  |console.log("hi");', '}'],
    keysPressed: 'dam',
    // Movement failed, no deletion should happen
    end: ['function hello() {', '  |console.log("hi");', '}'],
  });
});
