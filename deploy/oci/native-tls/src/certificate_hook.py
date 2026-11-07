#!/usr/bin/env python3
import fcntl
import hashlib
import os
from pathlib import Path
import shutil
import socket
import ssl
import subprocess
import sys
import tempfile
import time

HOST = 'cognee.planasolutions.ai'
SERVICES = {'frontend':443, 'cognee':8443, 'cognee-mcp':8444}


def command(*args):
    return subprocess.check_output(args, stderr=subprocess.PIPE)


def validate(directory, hostname=HOST, ca=None):
    cert, key = directory / 'fullchain.pem', directory / 'privkey.pem'
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(cert, key)
    metadata = ssl._ssl._test_decode_cert(str(cert))
    if ('DNS', hostname) not in metadata['subjectAltName']:
        raise ValueError('Exact certificate SAN absent')
    command('openssl', 'x509', '-in', str(cert), '-checkend', '86400', '-noout')
    args = ['openssl', 'verify', '-untrusted', str(cert)]
    if ca:
        args += ['-CAfile', str(ca)]
    command(*args, str(cert))
    return hashlib.sha256(ssl.PEM_cert_to_DER_cert(cert.read_text().split('-----END CERTIFICATE-----')[0] + '-----END CERTIFICATE-----')).digest()


def point(root, name, target):
    pending = root / ('.' + name + '-' + str(os.getpid()))
    pending.symlink_to(target)
    pending.replace(root / name)


def publish(root, source, hostname=HOST, ca=None):
    root.mkdir(mode=0o750, parents=True, exist_ok=True)
    directory = Path(tempfile.mkdtemp(prefix='generation-', dir=root))
    try:
        for name in ('fullchain.pem', 'privkey.pem'):
            shutil.copyfile(source / name, directory / name)
            os.chmod(directory / name, 0o640)
            os.chown(directory / name, -1, 1000)
        os.chown(directory, -1, 1000)
        os.chmod(directory, 0o750)
        digest = validate(directory, hostname, ca)
        previous = os.readlink(root / 'current') if (root / 'current').is_symlink() else None
        if previous:
            point(root, 'previous', previous)
        point(root, 'current', directory.name)
        return previous, digest
    except BaseException:
        shutil.rmtree(directory)
        raise


def prune(root):
    retained = {(root / name).resolve() for name in ('current', 'previous')
                if (root / name).is_symlink()}
    for directory in root.glob('generation-*'):
        if directory.is_dir() and not directory.is_symlink() and directory.resolve() not in retained:
            shutil.rmtree(directory)


def services(active):
    found = []
    for name in SERVICES:
        try:
            state = command('docker', 'inspect', '--format', '{{.State.Running}} {{index .Config.Labels "ai.planasolutions.native-tls"}}', name).decode().strip()
        except subprocess.CalledProcessError:
            state = ''
        if state == 'true enabled':
            found.append(name)
        elif active:
            raise RuntimeError('Expected native service unavailable: ' + name)
    return found


def reload_services(names, digest):
    for name in names:
        command('docker', 'kill', '--signal=HUP', name)
    context = ssl.create_default_context()
    for name in names:
        deadline = time.monotonic() + 15
        while True:
            try:
                with socket.create_connection(('100.97.84.7', SERVICES[name]), timeout=2) as raw:
                    with context.wrap_socket(raw, server_hostname=HOST) as stream:
                        if hashlib.sha256(stream.getpeercert(binary_form=True)).digest() == digest:
                            break
            except OSError:
                pass
            if time.monotonic() > deadline:
                raise RuntimeError('Certificate reload not observed: ' + name)
            time.sleep(.2)


def main():
    expected = '/etc/letsencrypt/live/' + HOST
    if os.environ.get('RENEWED_LINEAGE') != expected and sys.argv[1:] != ['--rollback']:
        return
    root = Path('/etc/cognee-native-tls')
    root.mkdir(mode=0o750, exist_ok=True)
    os.chown(root, 0, 1000)
    with open(root / '.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        names = services((root / 'active').exists())
        previous = os.readlink(root / 'previous') if (root / 'previous').is_symlink() else None
        if sys.argv[1:] == ['--rollback']:
            target = (root / 'previous').resolve(strict=True)
            digest = validate(target)
            old = os.readlink(root / 'current')
            point(root, 'current', target.name)
            point(root, 'previous', old)
        else:
            digest = validate(Path(expected))
            if (root / 'current').is_symlink() and validate(root / 'current') == digest:
                reload_services(names, digest)
                prune(root)
                print('Certificate already current; reload verified for ' + ','.join(names))
                return
            old, digest = publish(root, Path(expected))
        try:
            reload_services(names, digest)
        except BaseException:
            if old:
                point(root, 'current', old)
                if previous:
                    point(root, 'previous', previous)
                elif (root / 'previous').is_symlink():
                    (root / 'previous').unlink()
                reload_services(names, validate(root / old))
            raise
        prune(root)
        print('Certificate generation validated and published; reloaded ' + ','.join(names))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Certificate publication/reload FAILED: ' + str(error), file=sys.stderr)
        sys.exit(1)
