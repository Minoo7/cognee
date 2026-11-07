import os
from pathlib import Path
import sys
import tempfile
from unittest.mock import patch

import certificate_hook as hook


with tempfile.TemporaryDirectory(dir='/build') as temporary:
    root = Path(temporary) / 'published'
    source = Path('/build/test-certs')
    ca = source / 'ca.pem'
    original_validate, original_publish = hook.validate, hook.publish
    for generation in ('one', 'two', 'one'):
        original_publish(root, source / generation, 'localhost', ca)
    current = os.readlink(root / 'current')
    previous = os.readlink(root / 'previous')
    desired = original_validate(source / 'two', 'localhost', ca)
    attempts = []

    def reload(names, digest):
        attempts.append(digest)
        if digest == desired and attempts.count(desired) == 1:
            raise RuntimeError('Simulated temporary reload failure')

    def location(value):
        if value == '/etc/cognee-native-tls':
            return root
        if value == '/etc/letsencrypt/live/' + hook.HOST:
            return source / 'two'
        return Path(value)

    with patch.object(hook, 'Path', location), \
         patch.object(hook, 'validate', lambda directory, *arguments: original_validate(directory, 'localhost', ca)), \
         patch.object(hook, 'publish', lambda destination, origin: original_publish(destination, origin, 'localhost', ca)), \
         patch.object(hook, 'services', lambda active: ['frontend']), \
         patch.object(hook, 'reload_services', reload), \
         patch.dict(os.environ, RENEWED_LINEAGE='/etc/letsencrypt/live/' + hook.HOST), \
         patch.object(sys, 'argv', ['hook']):
        try:
            hook.main()
            raise AssertionError('Reload failure accepted')
        except RuntimeError as error:
            assert str(error) == 'Simulated temporary reload failure'
        assert os.readlink(root / 'current') == current
        assert os.readlink(root / 'previous') == previous
        hook.main()
        assert original_validate(root / 'current', 'localhost', ca) == desired
        assert os.readlink(root / 'previous') == current
        count = len(list(root.glob('generation-*')))
        assert count == 2
        hook.main()
        assert len(list(root.glob('generation-*'))) == count
        assert attempts.count(desired) == 3
    print('PASS failed reload retains both certificate generations; retry publishes desired certificate; repeated reconcile creates no generations; retention limited to current and previous')
