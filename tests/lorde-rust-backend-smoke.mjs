/** Static contract check only; actual Rust tests run on the Windows CI runner. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
const rust = fs.readFileSync(new URL('../src-tauri/src/assets.rs', import.meta.url), 'utf8')
const workflow = fs.readFileSync(new URL('../.github/workflows/lorde-windows-manual.yml', import.meta.url), 'utf8')
assert.match(rust, /fn valid_sprite_geometry\(/)
assert.match(rust, /x\.checked_add\(width\)/)
assert.match(rust, /y\.checked_add\(height\)/)
assert.match(rust, /if !valid_sprite_geometry\(x, y, width, height, page_width, page_height\)/)
assert.match(rust, /fn lorde_rejects_sprite_frames_outside_pages_and_integer_overflow\(/)
// Rust commands moved into a reusable test runner. Validate BOTH the CI
// invocation and the actual all-targets/doc coverage inside the runner.
const rustRunner = fs.readFileSync(new URL('../scripts/testar_rust.py', import.meta.url), 'utf8')
assert.match(workflow, /python scripts\/testar_rust\.py/)
assert.match(rustRunner, /'--all-targets'/)
assert.match(rustRunner, /'--doc'/)
assert.match(rustRunner, /'--locked'/)
console.log('PASSOU: validacao ESTATICA do caminho de recortes no Rust e teste Rust registrado no CI.')
