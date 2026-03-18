const gulp = require('gulp');
const bump = require('gulp-bump');
const tag_version = require('gulp-tag-version');
const ts = require('gulp-typescript');
const PluginError = require('plugin-error');
const minimist = require('minimist');
const path = require('path');
const es = require('event-stream');
const shell = require('gulp-shell');
const fs = require('fs');
const https = require('https');
const http = require('http');

const releaseOptions = {
  semver: '',
};

function validateArgs(done) {
  const options = minimist(process.argv.slice(2), releaseOptions);
  if (!options.semver) {
    return done(
      new PluginError('updateVersion', {
        message: 'Missing `--semver` option. Possible values: patch, minor, major',
      }),
    );
  }
  if (!['patch', 'minor', 'major'].includes(options.semver)) {
    return done(
      new PluginError('updateVersion', {
        message: 'Invalid `--semver` option. Possible values: patch, minor, major',
      }),
    );
  }

  done();
}

function createGitTag() {
  return gulp.src(['./package.json']).pipe(tag_version());
}

function updateVersion(done) {
  var options = minimist(process.argv.slice(2), releaseOptions);

  return gulp
    .src(['./package.json', './yarn.lock'])
    .pipe(bump({ type: options.semver }))
    .pipe(gulp.dest('./'))
    .on('end', () => {
      done();
    });
}

function updatePath() {
  const input = es.through();
  const output = input.pipe(
    es.mapSync((f) => {
      const contents = f.contents.toString('utf8');
      const filePath = f.path;
      let platformRelativepath = path.relative(
        path.dirname(filePath),
        path.resolve(process.cwd(), 'out/src/platform/node'),
      );
      platformRelativepath = platformRelativepath.replace(/\\/g, '/');
      if (platformRelativepath && !platformRelativepath.startsWith('..')) {
        platformRelativepath = './' + platformRelativepath;
      }
      f.contents = Buffer.from(
        contents.replace(
          /\(\"platform\/([^"]*)\"\)/g,
          '("' + (platformRelativepath === '' ? './' : platformRelativepath + '/') + '$1")',
        ),
        'utf8',
      );
      return f;
    }),
  );
  return es.duplex(input, output);
}

function copyPackageJson() {
  return gulp.src('./package.json').pipe(gulp.dest('out'));
}

gulp.task('tsc', function () {
  var isError = false;

  var tsProject = ts.createProject('tsconfig.json', { noEmitOnError: true });
  var tsResult = tsProject
    .src()
    .pipe(tsProject())
    .on('error', () => {
      isError = true;
    })
    .on('finish', () => {
      isError && process.exit(1);
    });

  return tsResult.js.pipe(updatePath()).pipe(gulp.dest('out'));
});

// test
gulp.task('run-test', function (done) {
  // the flag --grep takes js regex as a string and filters by test and test suite names
  var knownOptions = {
    string: 'grep',
    default: { grep: '' },
  };
  var options = minimist(process.argv.slice(2), knownOptions);

  var spawn = require('child_process').spawn;
  const dockerTag = 'vscodevim';

  console.log('Building container...');
  var dockerBuildCmd = spawn(
    'docker',
    ['build', '-f', './build/Dockerfile', './build/', '-t', dockerTag],
    {
      cwd: process.cwd(),
      stdio: 'inherit',
    },
  );

  dockerBuildCmd.on('exit', function (exitCode) {
    if (exitCode !== 0) {
      return done(
        new PluginError('test', {
          message: 'Docker build failed.',
        }),
      );
    }

    const dockerRunArgs = [
      'run',
      '-it',
      '--rm',
      '--env',
      `MOCHA_GREP=${options.grep}`,
      '-v',
      process.cwd() + ':/app',
      dockerTag,
    ];
    console.log('Running tests inside container...');
    var dockerRunCmd = spawn('docker', dockerRunArgs, {
      cwd: process.cwd(),
      stdio: 'inherit',
    });

    dockerRunCmd.on('exit', function (exitCode) {
      done(exitCode);
    });
  });
});

gulp.task('prepare-test', gulp.parallel('tsc', copyPackageJson, testCopyWasmFiles));
gulp.task('test', gulp.series('prepare-test', 'run-test'));
gulp.task(
  'release',
  gulp.series(
    validateArgs,
    updateVersion,
    shell.task('git commit -am "bump version"'),
    createGitTag,
  ),
);
gulp.task('default', shell.task('yarn build-dev'));

/**
 * Downloads a URL following redirects, resolving with the final IncomingMessage.
 */
function followRedirects(url, maxRedirects = 10) {
  return new Promise((resolve, reject) => {
    const doGet = (currentUrl, redirectsLeft) => {
      const lib = currentUrl.startsWith('https') ? https : http;
      const req = lib.get(currentUrl, (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          if (redirectsLeft <= 0) {
            reject(new Error('Too many redirects'));
            return;
          }
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, currentUrl).toString();
          res.resume();
          doGet(next, redirectsLeft - 1);
          return;
        }
        resolve(res);
      });
      req.on('error', (err) => reject(err));
    };
    doGet(url, maxRedirects);
  });
}

/**
 * Downloads the given URL to destPath, following redirects.
 */
function downloadToFile(url, destPath) {
  return followRedirects(url).then((res) => {
    const status = res.statusCode || 0;
    if (status !== 200) {
      throw new Error(`Download failed with status ${status}: ${url}`);
    }
    return new Promise((resolve, reject) => {
      const fileStream = fs.createWriteStream(destPath);
      res.pipe(fileStream);
      res.on('error', (err) => {
        fileStream.close();
        reject(err);
      });
      fileStream.on('finish', () => fileStream.close(() => resolve()));
      fileStream.on('error', (err) => {
        fileStream.close();
        reject(err);
      });
    });
  });
}

/**
 * Downloads all tree-sitter WASM grammar files defined in wasm-versions.json
 * into the ./wasm directory.
 *
 * Each entry in wasm-versions.json must have:
 *   - repo:    GitHub repository in "owner/name" format
 *   - version: release tag (e.g. "v0.23.2")
 *   - asset:   (optional) asset filename on GitHub if it differs from the output filename
 */
gulp.task('download-wasm', async function () {
  const versionsPath = path.join(__dirname, 'wasm-versions.json');
  const wasmDir = path.join(__dirname, 'wasm');

  if (!fs.existsSync(wasmDir)) {
    fs.mkdirSync(wasmDir, { recursive: true });
  }

  const versions = JSON.parse(fs.readFileSync(versionsPath, 'utf8'));
  const entries = Object.entries(versions);

  for (const [outputFile, entry] of entries) {
    const assetName = entry.asset || outputFile;
    const url = `https://github.com/${entry.repo}/releases/download/${entry.version}/${assetName}`;
    const destPath = path.join(wasmDir, outputFile);
    console.log(`Downloading ${outputFile} from ${url}...`);
    try {
      await downloadToFile(url, destPath);
      console.log(`  ✓ ${outputFile}`);
    } catch (err) {
      console.error(`  ✗ Failed to download ${outputFile}: ${err.message}`);
    }
  }

  console.log('WASM download complete.');
});

async function testCopyWasmFiles() {
  const destDir = path.join(__dirname, 'out', 'wasm');
  fs.mkdirSync(destDir, { recursive: true });

  const sources = fs
    .readdirSync(path.join(__dirname, 'wasm'))
    .filter((f) => f.endsWith('.wasm'))
    .map((f) => path.join(__dirname, 'wasm', f));

  for (const src of sources) {
    fs.copyFileSync(src, path.join(destDir, path.basename(src)));
  }

  fs.copyFileSync(
    path.join(__dirname, 'node_modules', 'web-tree-sitter', 'web-tree-sitter.wasm'),
    path.join(__dirname, 'out', 'web-tree-sitter.wasm'),
  );
}
