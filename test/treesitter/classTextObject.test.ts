import { Mode } from '../../src/mode/mode';
import { newTest } from '../testSimplifier';
import { setupWorkspace } from '../testUtils';

/**
 * Integration tests for the tree-sitter-powered `ac`/`ic` class text objects.
 *
 * These tests require `vim.treeSitter.enable = true`. They use the standard
 * `newTest` helper which drives keystrokes through the full ModeHandler
 * pipeline, exercising the tree-sitter integration end-to-end.
 */
suite('tree-sitter ac/ic text objects', function () {
  // WASM initialisation can be slow
  this.timeout(20_000);

  suiteSetup(async () => {
    await setupWorkspace({ fileExtension: '.ts' });
  });

  const treeSitterConfig = { treeSitter: { enable: true } };

  // ---------------------------------------------------------------------------
  // TypeScript — class declarations
  // ---------------------------------------------------------------------------

  newTest({
    title: 'vac — visually select around a TypeScript class declaration',
    config: treeSitterConfig,
    start: ['|class Greeter {', '  greet() {', '    return "Hello";', '  }', '}'],
    keysPressed: 'vac',
    end: ['class Greeter {', '  greet() {', '    return "Hello";', '  }', '}|'],
    endMode: Mode.Visual,
  });

  newTest({
    title: 'vic — visually select inside a TypeScript class body',
    config: treeSitterConfig,
    start: ['class Greeter {', '|  greet() {', '    return "Hello";', '  }', '}'],
    keysPressed: 'vic',
    end: ['class Greeter {', '  greet() {', '    return "Hello";', '  }|', '}'],
    endMode: Mode.Visual,
  });

  newTest({
    title: 'dac — delete a TypeScript class including trailing newline',
    config: treeSitterConfig,
    start: ['class Greeter {', '  |greet() { return "hi"; }', '}', 'const x = 1;'],
    keysPressed: 'dac',
    end: ['|const x = 1;'],
  });

  newTest({
    title: 'dic — delete inside a TypeScript class body',
    config: treeSitterConfig,
    start: ['class Greeter {', '  |greet() { return "hi"; }', '}'],
    keysPressed: 'dic',
    end: ['class Greeter {', ' | ', '}'],
  });

  // ---------------------------------------------------------------------------
  // TypeScript — interface declarations
  // ---------------------------------------------------------------------------

  newTest({
    title: 'vac — visually select around a TypeScript interface',
    config: treeSitterConfig,
    start: ['|interface Animal {', '  name: string;', '  sound(): string;', '}'],
    keysPressed: 'vac',
    end: ['interface Animal {', '  name: string;', '  sound(): string;', '}|'],
    endMode: Mode.Visual,
  });

  newTest({
    title: 'vic — visually select inside a TypeScript interface body',
    config: treeSitterConfig,
    start: ['interface Animal {', '  |name: string;', '  sound(): string;', '}'],
    keysPressed: 'vic',
    end: ['interface Animal {', '  name: string;', '  sound(): string|;', '}'],
    endMode: Mode.Visual,
  });

  // ---------------------------------------------------------------------------
  // TypeScript — enum declarations
  // ---------------------------------------------------------------------------

  newTest({
    title: 'vac — visually select around a TypeScript enum',
    config: treeSitterConfig,
    start: ['|enum Direction {', '  Up,', '  Down,', '}'],
    keysPressed: 'vac',
    end: ['enum Direction {', '  Up,', '  Down,', '}|'],
    endMode: Mode.Visual,
  });

  newTest({
    title: 'vic — visually select inside a TypeScript enum body',
    config: treeSitterConfig,
    start: ['enum Direction {', '|  Up,', '  Down,', '}'],
    keysPressed: 'vic',
    end: ['enum Direction {', '  Up,', '  Down|,', '}'],
    endMode: Mode.Visual,
  });

  // ---------------------------------------------------------------------------
  // JavaScript / TypeScript — object literals
  // ---------------------------------------------------------------------------

  newTest({
    title: 'vac — visually select around a JS object literal',
    config: treeSitterConfig,
    start: ['const config = |{', '  host: "localhost",', '  port: 8080,', '};'],
    keysPressed: 'vac',
    end: ['const config = {', '  host: "localhost",', '  port: 8080,', '}|;'],
    endMode: Mode.Visual,
  });

  newTest({
    title: 'vic — visually select inside a JS object literal',
    config: treeSitterConfig,
    start: ['const config = {', '  |host: "localhost",', '  port: 8080,', '};'],
    keysPressed: 'vic',
    end: ['const config = {', '  host: "localhost",', '  port: 8080,|', '};'],
    endMode: Mode.Visual,
  });

  // ---------------------------------------------------------------------------
  // TypeScript — nested classes
  // ---------------------------------------------------------------------------

  newTest({
    title: 'ac — selects the immediately enclosing class for nested position',
    config: treeSitterConfig,
    start: ['class Outer {', '  inner = class Inner {', '    |method() { return 1; }', '  };', '}'],
    keysPressed: 'vac',
    end: ['class Outer {', '  inner = class Inner {', '    method() { return 1; }', '  }|;', '}'],
    endMode: Mode.Visual,
  });

  // ---------------------------------------------------------------------------
  // Graceful fallback when tree-sitter is disabled
  // ---------------------------------------------------------------------------

  newTest({
    title: 'ac — does nothing when tree-sitter is disabled',
    config: { treeSitter: { enable: false } },
    start: ['class Greeter {', '  |greet() { return "hi"; }', '}'],
    keysPressed: 'dac',
    // Movement failed — no deletion should happen
    end: ['class Greeter {', '  |greet() { return "hi"; }', '}'],
  });
});

// ---------------------------------------------------------------------------
// Python — separate suite so VS Code assigns the `python` languageId and
// tree-sitter loads the Python grammar (tree-sitter-python.wasm).
// ---------------------------------------------------------------------------
suite('tree-sitter ac/ic text objects — Python', function () {
  this.timeout(20_000);

  suiteSetup(async () => {
    await setupWorkspace({ fileExtension: '.py' });
  });

  const treeSitterConfig = { treeSitter: { enable: true } };

  newTest({
    title: 'vac — visually select around a Python class definition',
    config: treeSitterConfig,
    start: ['|class Animal:', '    def __init__(self):', '        pass'],
    keysPressed: 'vac',
    end: ['class Animal:', '    def __init__(self):', '        pass|'],
    endMode: Mode.Visual,
  });

  newTest({
    title: 'vic — visually select inside a Python class body',
    config: treeSitterConfig,
    start: ['class Animal:', '|    def __init__(self):', '        pass'],
    keysPressed: 'vic',
    end: ['class Animal:', '    def __init__(self):', '        pass|'],
    endMode: Mode.Visual,
  });

  newTest({
    title:
      'vac — visually selects decorated Python class including decorator when cursor is on class keyword',
    config: treeSitterConfig,
    start: ['@decorator', '|class Foo:', '    x = 1'],
    keysPressed: 'vac',
    end: ['@decorator', 'class Foo:', '    x = 1|'],
    endMode: Mode.Visual,
  });

  newTest({
    title:
      'vac — visually selects decorated Python class including decorator when cursor is inside body',
    config: treeSitterConfig,
    start: ['@decorator', 'class Foo:', '    |x = 1'],
    keysPressed: 'vac',
    end: ['@decorator', 'class Foo:', '    x = 1|'],
    endMode: Mode.Visual,
  });
});
