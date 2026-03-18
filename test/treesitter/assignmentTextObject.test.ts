import { Mode } from '../../src/mode/mode';
import { newTest } from '../testSimplifier';
import { setupWorkspace } from '../testUtils';

/**
 * Integration tests for the tree-sitter-powered `aal`, `ial`, `aar`, `iar`
 * assignment text objects.
 *
 * These tests require `vim.treeSitter.enable = true`. They use the standard
 * `newTest` helper which drives keystrokes through the full ModeHandler
 * pipeline, exercising the tree-sitter integration end-to-end.
 */
suite('tree-sitter =l/=r assignment text objects', function () {
  // WASM initialization can be slow
  this.timeout(20_000);

  suiteSetup(async () => {
    await setupWorkspace({ fileExtension: '.ts' });
  });

  const cfg = { treeSitter: { enable: true } };

  // ---------------------------------------------------------------------------
  // TypeScript — simple assignment expression
  // ---------------------------------------------------------------------------

  newTest({
    title: 'i=r — select inside RHS of a simple assignment',
    config: cfg,
    start: ['let x = |42;'],
    keysPressed: 'vi=r',
    end: ['let x = 42|;'],
    endMode: Mode.Visual,
  });

  newTest({
    title: 'i=l — select inside LHS of a simple assignment',
    config: cfg,
    start: ['let |x = 42;'],
    keysPressed: 'vi=l',
    end: ['let x| = 42;'],
    endMode: Mode.Visual,
  });

  newTest({
    title: 'a=r — select around RHS (operator + value)',
    config: cfg,
    start: ['let x |= 42;'],
    keysPressed: 'va=r',
    end: ['let x = 42|;'],
    endMode: Mode.Visual,
  });

  newTest({
    title: 'a=l — select around LHS (variable + operator)',
    config: cfg,
    start: ['|let x = 42;'],
    keysPressed: 'va=l',
    end: ['let x =| 42;'],
    endMode: Mode.Visual,
  });

  // ---------------------------------------------------------------------------
  // TypeScript — variable declarator (`const`/`let`/`var`)
  // ---------------------------------------------------------------------------

  newTest({
    title: 'di=r — delete inside RHS of a variable declarator',
    config: cfg,
    start: ['const greeting = |"hello";'],
    keysPressed: 'di=r',
    end: ['const greeting = |;'],
  });

  newTest({
    title: 'di=l — delete inside LHS of a variable declarator',
    config: cfg,
    start: ['const |greeting = "hello";'],
    keysPressed: 'di=l',
    end: ['const | = "hello";'],
  });

  newTest({
    title: 'da=r — delete around RHS (operator + value)',
    config: cfg,
    start: ['const x |= 42;'],
    keysPressed: 'da=r',
    end: ['const x |;'],
  });

  // ---------------------------------------------------------------------------
  // TypeScript — augmented assignment (`+=`, `-=`, etc.)
  // ---------------------------------------------------------------------------

  newTest({
    title: 'i=r — select inside RHS of an augmented assignment',
    config: cfg,
    start: ['count += |1;'],
    keysPressed: 'vi=r',
    end: ['count += 1|;'],
    endMode: Mode.Visual,
  });

  newTest({
    title: 'a=r — select around RHS of an augmented assignment (includes `+=`)',
    config: cfg,
    start: ['count |+= 1;'],
    keysPressed: 'va=r',
    end: ['count += 1|;'],
    endMode: Mode.Visual,
  });

  newTest({
    title: 'a=l — select around LHS of an augmented assignment (includes `+=`)',
    config: cfg,
    start: ['|count += 1;'],
    keysPressed: 'va=l',
    end: ['count +=| 1;'],
    endMode: Mode.Visual,
  });

  // ---------------------------------------------------------------------------
  // TypeScript — object literal property (`pair`)
  // ---------------------------------------------------------------------------

  newTest({
    title: 'i=r — select inside RHS of an object property',
    config: cfg,
    start: ['const obj = { key: |"value" };'],
    keysPressed: 'vi=r',
    end: ['const obj = { key: "value"| };'],
    endMode: Mode.Visual,
  });

  newTest({
    title: 'i=l — select inside LHS (key) of an object property',
    config: cfg,
    start: ['const obj = { |key: "value" };'],
    keysPressed: 'vi=l',
    end: ['const obj = { key|: "value" };'],
    endMode: Mode.Visual,
  });

  newTest({
    title: 'a=r — select around RHS of an object property (includes `:`)',
    config: cfg,
    start: ['const obj = { key|: "value" };'],
    keysPressed: 'va=r',
    end: ['const obj = { key: "value"| };'],
    endMode: Mode.Visual,
  });

  newTest({
    title: 'di=r — delete inside RHS of an object property',
    config: cfg,
    start: ['const obj = { key:| "value" };'],
    keysPressed: 'di=r',
    end: ['const obj = { key:|  };'],
  });

  // ---------------------------------------------------------------------------
  // TypeScript — destructuring LHS
  // ---------------------------------------------------------------------------

  newTest({
    title: 'i=l — select destructuring array pattern as LHS',
    config: cfg,
    start: ['const |[a, b] = |arr;'],
    keysPressed: 'vi=l',
    end: ['const [a, b]| = arr;'],
    endMode: Mode.Visual,
  });

  // ---------------------------------------------------------------------------
  // Python — simple assignment (cursor on value)
  // ---------------------------------------------------------------------------

  newTest({
    title: 'i=r — select inside RHS of a Python assignment',
    config: { treeSitter: { enable: true }, fileExtension: '.py' } as Record<string, unknown>,
    start: ['x = |42'],
    keysPressed: 'vi=r',
    end: ['x = 42|'],
    endMode: Mode.Visual,
  });

  newTest({
    title: 'di=l — delete inside LHS of a Python assignment',
    config: { treeSitter: { enable: true }, fileExtension: '.py' } as Record<string, unknown>,
    start: ['|x = 42'],
    keysPressed: 'di=l',
    end: ['| = 42'],
  });

  // ---------------------------------------------------------------------------
  // Graceful fallback when tree-sitter is disabled
  // ---------------------------------------------------------------------------

  newTest({
    title: 'i=r — does nothing when tree-sitter is disabled',
    config: { treeSitter: { enable: false } },
    start: ['const x = |42;'],
    keysPressed: 'di=r',
    end: ['const x = |42;'],
  });

  newTest({
    title: 'i=l — does nothing when tree-sitter is disabled',
    config: { treeSitter: { enable: false } },
    start: ['const |x = 42;'],
    keysPressed: 'di=l',
    end: ['const |x = 42;'],
  });

  newTest({
    title: 'a=r — does nothing when tree-sitter is disabled',
    config: { treeSitter: { enable: false } },
    start: ['const x |= 42;'],
    keysPressed: 'da=r',
    end: ['const x |= 42;'],
  });
});
