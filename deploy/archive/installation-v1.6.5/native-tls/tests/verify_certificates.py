import os
from pathlib import Path
import tempfile
from certificate_hook import publish, validate, point

with tempfile.TemporaryDirectory(dir='/build') as temp:
    root = Path(temp) / 'published'
    source = Path('/build/test-certs')
    ca = source / 'ca.pem'
    previous, first = publish(root, source / 'one', 'localhost', ca)
    assert previous is None
    one = os.readlink(root / 'current')
    previous, second = publish(root, source / 'two', 'localhost', ca)
    assert previous == one and first != second
    two = os.readlink(root / 'current')
    assert os.readlink(root / 'previous') == one
    try:
        publish(root, source / 'bad', 'localhost', ca)
        raise AssertionError('Invalid key accepted')
    except (ValueError, OSError): pass
    assert os.readlink(root / 'current') == two
    try:
        publish(root, source / 'one', 'wrong.invalid', ca)
        raise AssertionError('Invalid SAN accepted')
    except ValueError: pass
    assert os.readlink(root / 'current') == two
    point(root, 'current', one)
    assert validate(root / 'current', 'localhost', ca) == first
    assert (root / one / 'privkey.pem').stat().st_mode & 0o777 == 0o640
    assert (root / one / 'privkey.pem').stat().st_gid == 1000
    print('PASS certificate SAN/key/chain validation; atomic generations; failed publication retains current; rollback; group 1000 mode 640')
