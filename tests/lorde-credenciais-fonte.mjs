import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// This test inspects the Rust source; it does NOT execute Rust.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const connection = readFileSync(resolve(root, 'src-tauri/src/connection.rs'), 'utf8')
const logging = readFileSync(resolve(root, 'src-tauri/src/logging.rs'), 'utf8')

assert.match(connection, /fn safe_socket_connect_error\(error: WebSocketError\)/)
assert.match(connection, /\.map_err\(safe_socket_connect_error\)/)
assert.match(connection, /ConnectionError::AuthenticationRejected\(response\.status\(\)\.as_u16\(\)\)/)
assert.doesNotMatch(connection, /ConnectionError::Connect\(error\.to_string\(\)\)/)
assert.doesNotMatch(connection, /ConnectionError::Request\(error\.to_string\(\)\)/)
assert.doesNotMatch(connection, /ConnectionError::Receive\(error\.to_string\(\)\)/)
assert.match(connection, /connection_failure_does_not_expose_session_query_or_cookies/)
assert.match(logging, /fn secret_field\(key: &str\)/)
assert.match(logging, /if value\.get\("t"\).*Some\("hello"\)/)
assert.match(logging, /redacts_camel_case_nested_and_unknown_hello_keys/)
assert.match(logging, /key\.contains\("token"\)/)
console.log('PASSOU: revisao ESTATICA de nao-exposicao de credenciais (Rust requer compilacao).')
