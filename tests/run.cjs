const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tgf-tests-'));
try {
  for (const folder of ['lib', 'interfaces', 'data']) {
    const destination = path.join(root, 'src', folder);
    fs.mkdirSync(destination, { recursive: true });
    for (const name of fs.readdirSync(path.join(__dirname, '../src', folder))) {
      const source = fs.readFileSync(path.join(__dirname, '../src', folder, name), 'utf8');
      if (name.endsWith('.ts')) {
        fs.writeFileSync(path.join(destination, name.replace(/\.ts$/, '.js')), ts.transpileModule(source, {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
        }).outputText);
      } else if (name.endsWith('.json')) fs.writeFileSync(path.join(destination, name), source);
    }
  }
  fs.cpSync(__dirname, path.join(root, 'tests'), { recursive: true });
  const result = spawnSync(process.execPath, ['--test', path.join(root, 'tests/growth.test.cjs')], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
