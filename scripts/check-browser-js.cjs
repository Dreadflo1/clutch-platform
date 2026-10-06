// Syntax-check the browser scripts as classic scripts (package.json "type":
// "module" makes `node --check` parse them as ES modules, which they are not).
const fs = require('fs');
const vm = require('vm');
let bad = 0;
for (const f of process.argv.slice(2)) {
  try { new vm.Script(fs.readFileSync(f, 'utf8'), { filename: f }); console.log('ok  ', f); }
  catch (e) { bad++; console.log('FAIL', f, e.message); }
}
process.exit(bad ? 1 : 0);
