#!/bin/sh
# Nightly backup for the one-server setup (docs/move-to-server.md): dumps the
# Docker Compose Postgres and uploads the dump to Cloudflare R2. Run it from
# the server's crontab, for example:
#   17 3 * * * /opt/read-later/scripts/server-backup.sh >> /opt/read-later/backups/backup.log 2>&1
set -eu
cd "$(dirname "$0")/.."

# Read only the values this script needs from .env (sourcing the whole file
# would break on values that contain spaces).
setting() {
  grep -E "^$1=" .env 2>/dev/null | tail -n 1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'
}
R2_ACCOUNT_ID=$(setting R2_ACCOUNT_ID)
R2_BUCKET=$(setting R2_BUCKET)
R2_ACCESS_KEY_ID=$(setting R2_ACCESS_KEY_ID)
R2_SECRET_ACCESS_KEY=$(setting R2_SECRET_ACCESS_KEY)
R2_ENDPOINT=$(setting R2_ENDPOINT)
R2_ENDPOINT=${R2_ENDPOINT:-https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com}
for name in R2_ACCOUNT_ID R2_BUCKET R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
  eval "value=\${$name}"
  if [ -z "$value" ]; then echo "Set $name in .env first." >&2; exit 1; fi
done

mkdir -p backups
file="readlater-$(date -u +%Y-%m-%dT%H%MZ).dump"
docker compose exec -T postgres \
  pg_dump --format=custom --compress=9 --no-owner --no-privileges -U readlater readlater > "backups/$file"
test -s "backups/$file"

docker run --rm --network host -v "$PWD/backups:/backups:ro" \
  -e AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" -e AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  -e AWS_DEFAULT_REGION=auto -e AWS_REQUEST_CHECKSUM_CALCULATION=when_required \
  -e AWS_RESPONSE_CHECKSUM_VALIDATION=when_required \
  amazon/aws-cli:2.37.12 s3 cp "/backups/$file" "s3://$R2_BUCKET/daily/$file" \
  --endpoint-url "$R2_ENDPOINT" --only-show-errors

# Keep a week of copies on the server too.
find backups -name 'readlater-*.dump' -mtime +7 -delete
echo "$(date -u +%FT%TZ) uploaded daily/$file"
