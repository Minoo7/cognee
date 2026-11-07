import asyncio
import logging
import os
import signal
import socket
import ssl
from contextlib import nullcontext
from dataclasses import dataclass
from pathlib import Path

import uvicorn
from uvicorn.lifespan.off import LifespanOff
from uvicorn.lifespan.on import LifespanOn

log = logging.getLogger('uvicorn.error')


@dataclass(frozen=True)
class Listener:
    host: str
    port: int
    certificate: Path | None = None
    key: Path | None = None

    def __post_init__(self):
        if not self.host or not 0 < self.port < 65536:
            raise ValueError('Invalid listener address')
        if (self.certificate is None) != (self.key is None):
            raise ValueError('Certificate and key must be paired')


def listeners_from_env(host, port):
    directory = Path(os.environ.get('TLS_DIRECTORY', '/tls/current'))
    return [Listener(host, int(port)), Listener(host, int(os.environ['TLS_PORT']),
            directory / 'fullchain.pem', directory / 'privkey.pem')]


def material(listener):
    directory = listener.certificate.parent.resolve(strict=True)
    cert, key = directory / listener.certificate.name, directory / listener.key.name
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(cert, key)
    return str(cert), str(key)


class OwnedServer(uvicorn.Server):
    def capture_signals(self):
        return nullcontext()


async def serve(app, listeners, log_level='info', grace=300):
    if len({(x.host, x.port) for x in listeners}) != len(listeners):
        raise ValueError('Duplicate listeners')
    configs, sockets, servers = [], [], []
    owner = None
    started_lifecycle = False
    stopping = asyncio.Event()
    loop = asyncio.get_running_loop()
    old_signals = {}

    def stop():
        stopping.set()
        for server in servers:
            server.should_exit = True

    def reload_tls():
        try:
            pairs = [(config, material(listener)) for config, listener in zip(configs, listeners)
                     if listener.certificate]
            for config, (cert, key) in pairs:
                config.ssl.load_cert_chain(cert, key)
            log.warning('TLS_RELOAD_OK')
        except Exception:
            log.exception('TLS_RELOAD_FAILED; previous context retained')

    try:
        for listener in listeners:
            cert, key = material(listener) if listener.certificate else (None, None)
            config = uvicorn.Config(app, host=listener.host, port=listener.port,
                lifespan='off', proxy_headers=False, log_level=log_level,
                ssl_certfile=cert, ssl_keyfile=key, timeout_graceful_shutdown=grace)
            config.load()
            configs.append(config)
            sock = socket.socket(socket.AF_INET6 if ':' in listener.host else socket.AF_INET)
            sockets.append(sock)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind((listener.host, listener.port))
            sock.setblocking(False)
        for sig, handler in [(signal.SIGINT, stop), (signal.SIGTERM, stop),
                             (signal.SIGHUP, reload_tls)]:
            old_signals[sig] = signal.getsignal(sig)
            loop.add_signal_handler(sig, handler)
        lifecycle_config = uvicorn.Config(app, lifespan='on', proxy_headers=False, log_level=log_level)
        lifecycle_config.load()
        owner = LifespanOn(lifecycle_config)
        started_lifecycle = True
        await owner.startup()
        if owner.should_exit:
            raise RuntimeError('Application startup failed')

        class SharedStateLifespan(LifespanOff):
            def __init__(self, config):
                super().__init__(config)
                self.state = owner.state

        for config, sock in zip(configs, sockets):
            if stopping.is_set():
                return
            config.lifespan_class = SharedStateLifespan
            server = OwnedServer(config)
            servers.append(server)
            server.lifespan = SharedStateLifespan(config)
            await server.startup(sockets=[sock])
        tasks = [asyncio.create_task(server.main_loop()) for server in servers]
        try:
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                task.result()
            if not stopping.is_set():
                raise RuntimeError('Listener stopped unexpectedly')
        finally:
            stop()
            await asyncio.gather(*tasks, return_exceptions=True)
    finally:
        stop()
        try:
            await asyncio.gather(*(server.shutdown() for server in servers if server.started))
        finally:
            for sock in sockets:
                sock.close()
            if started_lifecycle and owner and not owner.should_exit:
                await owner.shutdown()
                if owner.shutdown_failed:
                    raise RuntimeError('Application shutdown failed')
            for sig, previous in old_signals.items():
                loop.remove_signal_handler(sig)
                signal.signal(sig, previous)


def main():
    from uvicorn.importer import import_from_string
    app = import_from_string(os.environ.get('ASGI_APP', 'cognee.api.client:app'))
    asyncio.run(serve(app, listeners_from_env(os.environ.get('BIND_ADDRESS', '0.0.0.0'),
        os.environ.get('HTTP_PORT', '8000')), grace=int(os.environ.get('DRAIN_SECONDS', '300'))))


if __name__ == '__main__':
    main()
