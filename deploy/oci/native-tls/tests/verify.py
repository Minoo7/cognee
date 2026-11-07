import concurrent.futures
import http.client
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import ssl
import subprocess
import sys
import time

root = Path('/build')
certs = root / 'test-certs'
ctx = ssl.create_default_context(cafile=str(certs / 'ca.pem'))

def request(port, path='/identity', tls=False, body=None, headers=None):
    conn = (http.client.HTTPSConnection('localhost', port, context=ctx, timeout=10) if tls
            else http.client.HTTPConnection('localhost', port, timeout=10))
    conn.request('POST' if body else 'GET', path, body=body, headers=headers or {})
    response = conn.getresponse()
    data = response.read().decode()
    result = (response.status, dict(response.getheaders()), data)
    conn.close()
    return result


def fingerprint(port):
    with socket.create_connection(('localhost', port)) as raw:
        with ctx.wrap_socket(raw, server_hostname='localhost') as conn:
            return conn.getpeercert(binary_form=True)


def wait(check):
    for _ in range(150):
        try:
            if check(): return
        except (OSError, AssertionError): pass
        time.sleep(.1)
    raise AssertionError('Timed out')


def launch(extra=None):
    events = root / 'events'
    events.write_text('')
    log = open(root / 'listener.log', 'w')
    env = dict(os.environ, ASGI_APP='fixture:app', BIND_ADDRESS='127.0.0.1', HTTP_PORT='18000', TLS_PORT='18443', TLS_DIRECTORY=str(certs / 'current'), EVENTS=str(events), DRAIN_SECONDS='5')
    env.update(extra or {})
    proc = subprocess.Popen([sys.executable, '/opt/native-tls/native_tls.py'], env=env, stdout=log, stderr=log)
    return proc, log


def point(name):
    temp = certs / 'pending'
    temp.unlink(missing_ok=True)
    temp.symlink_to(name)
    temp.replace(certs / 'current')

point('one')
p, log = launch()
try:
    wait(lambda: request(18000)[0] == 200)
    a = json.loads(request(18000)[2]); b = json.loads(request(18443, tls=True)[2])
    assert a == b and a['pid'] == p.pid and a['identity'] == 'one-owner'
    status, headers, _ = request(18443, '/identity/', tls=True)
    assert status == 307 and headers['location'].startswith('https://')
    old = fingerprint(18443)
    point('two'); p.send_signal(signal.SIGHUP)
    wait(lambda: fingerprint(18443) != old)
    valid = fingerprint(18443)
    point('bad'); p.send_signal(signal.SIGHUP)
    wait(lambda: 'TLS_RELOAD_FAILED' in (root / 'listener.log').read_text())
    assert fingerprint(18443) == valid and p.poll() is None
    with concurrent.futures.ThreadPoolExecutor() as pool:
        pending = pool.submit(request, 18443, '/slow', True)
        wait(lambda: 'request' in (root / 'events').read_text())
        p.terminate()
        assert pending.result()[0] == 200
    assert p.wait(timeout=12) == 0
    assert (root / 'events').read_text().splitlines() == ['startup', 'request', 'shutdown']
    print('PASS shared PID/state; HTTPS redirect; trusted TLS; good/bad reload; TERM drains before single shutdown', flush=True)
finally:
    if p.poll() is None: p.kill(); p.wait()
    log.close()
point('one')
with socket.socket() as occupied:
    occupied.bind(('127.0.0.1', 18443)); occupied.listen()
    p, log = launch()
    assert p.wait(timeout=15) != 0
    assert not (root / 'events').read_text()
    try: socket.create_connection(('127.0.0.1',18000), timeout=.2); raise AssertionError('HTTP left open')
    except ConnectionRefusedError: pass
    log.close()
print('PASS failed bind closes both and prevents app startup', flush=True)
p, log = launch({'FAIL_START':'1'})
assert p.wait(timeout=15) != 0
assert (root / 'events').read_text().splitlines() == ['startup']
log.close()
print('PASS failed lifespan startup never accepts requests', flush=True)
p, log = launch()
try:
    wait(lambda: request(18000)[0] == 200)
    p.send_signal(signal.SIGINT)
    assert p.wait(timeout=15) == 0
    assert (root / 'events').read_text().splitlines() == ['startup', 'shutdown']
finally:
    if p.poll() is None: p.kill(); p.wait()
    log.close()
print('PASS centralized SIGINT shuts down lifespan exactly once', flush=True)
if os.environ.get('VERIFY_MCP'):
    p, log = launch({'MCP_FIXTURE':'1', 'MCP_ALLOWED_HOSTS':'localhost:*', 'MCP_CORS_ALLOW_ORIGINS':'https://localhost:3443'})
    try:
        wait(lambda: request(18000, '/mcp')[0] in (400,406))
        headers = {'Accept':'application/json, text/event-stream', 'Content-Type':'application/json'}
        body = {'jsonrpc':'2.0', 'id':1, 'method':'initialize', 'params':{'protocolVersion':'2025-03-26','capabilities':{},'clientInfo':{'name':'isolated','version':'1'}}}
        status, reply, content = request(18000, '/mcp', body=json.dumps(body), headers=headers)
        assert status == 200, (status, content)
        session = reply.get('mcp-session-id') or reply.get('Mcp-Session-Id')
        assert session
        headers.update({'Mcp-Session-Id':session, 'MCP-Protocol-Version':'2025-03-26', 'Origin':'https://localhost:3443'})
        assert request(18443, '/mcp', True, json.dumps({'jsonrpc':'2.0','method':'notifications/initialized'}), headers)[0] == 202
        status, _, content = request(18443, '/mcp', True, json.dumps({'jsonrpc':'2.0','id':2,'method':'tools/list'}), headers)
        assert status == 200 and 'ping' in content, content
        assert request(18443, '/mcp', True, headers={'Host':'evil.invalid'})[0] in (400,403,421)
        assert request(18443, '/mcp', True, headers={'Origin':'https://evil.invalid'})[0] in (400,403)
        print('PASS actual MCP app builder/guard/session; HTTP initialize then HTTPS initialized/tools/list; invalid Host/Origin rejected', flush=True)
    finally:
        p.terminate(); p.wait(timeout=15); log.close()
