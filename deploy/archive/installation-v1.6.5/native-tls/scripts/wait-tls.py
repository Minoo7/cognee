#!/usr/bin/env python3
import socket
import ssl
import time

context = ssl.create_default_context()
for port in (443, 8443, 8444):
    deadline = time.monotonic() + 300
    while True:
        try:
            with socket.create_connection(('100.97.84.7', port), timeout=3) as stream:
                with context.wrap_socket(stream, server_hostname='cognee.planasolutions.ai'):
                    break
        except OSError:
            if time.monotonic() > deadline:
                raise
            time.sleep(1)
