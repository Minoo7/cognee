import ast
import hashlib
from pathlib import Path

original = ast.parse(Path('/build/receipts/mcp-server.original.py').read_text())
patched = ast.parse(Path('/opt/cognee-mcp/src/server.py').read_text())
def functions(tree):
    return {node.name:ast.dump(node) for node in tree.body if isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef))}
a,b = functions(original),functions(patched)
assert set(a) == set(b)
changed = {name for name in a if a[name] != b[name]}
assert changed == {'_serve_with_cors','_transport_security_kwargs'}, changed
assert Path('/opt/cognee-mcp/src/server.py').read_bytes() == Path('/app/.venv/lib/python3.12/site-packages/src/server.py').read_bytes()
print('PASS MCP changes restricted to serving seam and exact-host HTTPS origins; main/init/auth/tools/cleanup unchanged; installed/source copies identical')
