"""One-off, manually-run script: generates the ES256 JWT that Apple requires
as the OAuth client_secret for "Sign in with Apple". Apple doesn't accept a
static secret — this JWT expires (max ~6 months), so re-run this and paste
the new value into APPLE_CLIENT_SECRET roughly every 6 months. Not wired
into APScheduler for auto-rotation: for a twice-a-year task on a solo-dev
app, a documented manual step is simpler than keeping a private key live in
the running server process.

Usage:
    .venv/bin/python scripts/generate_apple_client_secret.py \\
        --team-id TEAMID1234 --client-id com.example.k2.web \\
        --key-id KEYID12345 --private-key-path /path/to/AuthKey_KEYID12345.p8

Requires the private key (.p8) downloaded once from the Apple Developer
portal (Certificates, Identifiers & Profiles > Keys) when enabling
"Sign in with Apple" for the app's Services ID.
"""
import argparse
import time

from authlib.jose import jwt


def generate(team_id, client_id, key_id, private_key_pem, days_valid=180):
    now = int(time.time())
    header = {'alg': 'ES256', 'kid': key_id}
    payload = {
        'iss': team_id,
        'iat': now,
        'exp': now + days_valid * 86400,
        'aud': 'https://appleid.apple.com',
        'sub': client_id,
    }
    return jwt.encode(header, payload, private_key_pem).decode()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--team-id', required=True, help='Apple Developer Team ID')
    parser.add_argument('--client-id', required=True, help='Services ID (e.g. com.example.k2.web)')
    parser.add_argument('--key-id', required=True, help='Key ID for the Sign in with Apple private key')
    parser.add_argument('--private-key-path', required=True, help='Path to the downloaded .p8 file')
    parser.add_argument('--days-valid', type=int, default=180, help='Max ~180 days per Apple')
    args = parser.parse_args()

    with open(args.private_key_path) as f:
        private_key_pem = f.read()

    secret = generate(args.team_id, args.client_id, args.key_id, private_key_pem, args.days_valid)
    print(secret)
