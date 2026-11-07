#!/usr/bin/env python3
"""Compare APK v2 public signing certificate hashes (after apksigner verifies each APK).

No private signing keys are needed or used. Refuse missing or ambiguous signatures.
"""
import hashlib
import struct
import sys
from pathlib import Path

V2_SIGNER_ID = 0x7109871A
MAGIC = b'APK Sig Block 42'


def length_prefixed(data, offset):
    if offset + 4 > len(data):
        raise ValueError('Truncated APK signature')
    size = struct.unpack_from('<I', data, offset)[0]
    end = offset + 4 + size
    if end > len(data):
        raise ValueError('Invalid APK signature length')
    return data[offset + 4:end], end


def signing_cert_hash(filename):
    apk = Path(filename).read_bytes()
    eocd = apk.rfind(b'PK\x05\x06', max(0, len(apk) - 65557))
    if eocd < 0 or eocd + 22 > len(apk):
        raise ValueError('Invalid APK ZIP directory')
    directory = struct.unpack_from('<I', apk, eocd + 16)[0]
    if apk[directory - 16:directory] != MAGIC:
        raise ValueError('APK v2 signing block missing')
    block_size = struct.unpack_from('<Q', apk, directory - 24)[0]
    start = directory - block_size - 8
    if start < 0 or struct.unpack_from('<Q', apk, start)[0] != block_size:
        raise ValueError('Corrupt APK signing block')
    offset = start + 8
    while offset < directory - 24:
        entry_size = struct.unpack_from('<Q', apk, offset)[0]
        entry_end = offset + 8 + entry_size
        if entry_size < 4 or entry_end > directory - 24:
            raise ValueError('Invalid APK signature entry')
        entry_id = struct.unpack_from('<I', apk, offset + 8)[0]
        if entry_id == V2_SIGNER_ID:
            signers, _ = length_prefixed(apk[offset + 12:entry_end], 0)
            signer, signer_end = length_prefixed(signers, 0)
            if signer_end != len(signers):
                raise ValueError('Unexpected multiple APK signers')
            signed, _ = length_prefixed(signer, 0)
            _, cursor = length_prefixed(signed, 0)  # Digests
            certs, _ = length_prefixed(signed, cursor)
            cert, end = length_prefixed(certs, 0)
            if end != len(certs):
                raise ValueError('Unexpected extra certificate')
            return hashlib.sha256(cert).hexdigest()
        offset = entry_end
    raise ValueError('APK Signature Scheme v2 not found')


def main():
    if len(sys.argv) != 3:
        raise SystemExit('Usage: apk-signature-gate.py PREVIOUS.apk CURRENT.apk')
    previous = signing_cert_hash(sys.argv[1])
    current = signing_cert_hash(sys.argv[2])
    print('Previous signer certificate SHA-256:', previous)
    print('Current signer certificate SHA-256: ', current)
    if previous != current:
        raise SystemExit('BLOCKED: signing certificate changed; do not uninstall app')
    print('H01 certificate continuity: PASS')


if __name__ == '__main__':
    main()
