import json
import subprocess
config = json.loads(subprocess.check_output(['docker', 'compose','-p','native-tls-isolated-config','-f','tests/compose.base.yml','-f','compose.native-tls.yml','config','--format','json']))
for name, secure, plain in [('cognee',8443,8000),('cognee-mcp',8444,8001),('frontend',443,3000)]:
    service = config['services'][name]
    ports = service['ports']
    assert any(int(port['published']) == secure and port['host_ip'] == '100.97.84.7' for port in ports)
    assert any(int(port['published']) == plain for port in ports)
    assert service['restart'] == 'always'
    assert not next(volume for volume in service['volumes'] if volume['target'] == '/tls')['read_only'] is False
    if name != 'frontend':
        assert {volume['target'] for volume in service['volumes']} == {'/app/.env','/app/cognee','/cognee-storage/data','/cognee-storage/system','/tls'}
assert config['services']['cognee-mcp']['command'] == ['--no-migration']
print('PASS synthetic Compose merge preserves HTTP/data mounts/MCP args; tailnet-only TLS; read-only certificate mount; restart/grace')
