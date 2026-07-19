#!/usr/bin/env bash
set -euo pipefail

PROJECT=mi7rab
REGION=us-central1
SQL_INSTANCE=mi7rab-db
AFYA_DB=afya
AFYA_DB_USER=afya
SA="mi7rab-run@mi7rab.iam.gserviceaccount.com"

echo "==> 3afya deploys into the mi7rab project and REUSES its Cloud SQL"
echo "    instance ($SQL_INSTANCE), Upstash Redis, and Better Auth secret."
echo "    Run once, with gcloud authenticated to project '$PROJECT'."
echo

echo "==> Creating the afya domain database + user on $SQL_INSTANCE ..."
gcloud sql databases create "$AFYA_DB" --instance="$SQL_INSTANCE" --project="$PROJECT" \
  || echo "  (database already exists — continuing)"

AFYA_DB_PASS="$(openssl rand -hex 24)"
gcloud sql users create "$AFYA_DB_USER" --instance="$SQL_INSTANCE" --password="$AFYA_DB_PASS" --project="$PROJECT" \
  || echo "  (user already exists — set AFYA_DB_PASS to its real password before continuing)"

AFYA_DATABASE_URL="postgresql://${AFYA_DB_USER}:${AFYA_DB_PASS}@/${AFYA_DB}?host=/cloudsql/${PROJECT}:${REGION}:${SQL_INSTANCE}"

echo "==> Storing the afya-database-url secret ..."
if gcloud secrets describe afya-database-url --project="$PROJECT" >/dev/null 2>&1; then
  echo -n "$AFYA_DATABASE_URL" | gcloud secrets versions add afya-database-url --data-file=- --project="$PROJECT"
else
  echo -n "$AFYA_DATABASE_URL" | gcloud secrets create afya-database-url --data-file=- --replication-policy=automatic --project="$PROJECT"
fi

echo "==> Granting the Cloud Run service account read access to the new secret ..."
gcloud secrets add-iam-policy-binding afya-database-url \
  --member="serviceAccount:${SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --project="$PROJECT"

echo
echo "==> Reused as-is from mi7rab (no new resources, no extra cost):"
echo "      database-url        -> AUTH_DATABASE_URL   (shared auth store: user/account/verification)"
echo "      redis-url           -> REDIS_URL           (shared Upstash, sessions)"
echo "      better-auth-secret  -> BETTER_AUTH_SECRET  (MUST match mi7rab for SSO)"
echo
echo "==> Apply 3afya's DOMAIN migrations only (never the auth DB):"
echo "      cloud-sql-proxy ${PROJECT}:${REGION}:${SQL_INSTANCE} &"
echo "      DATABASE_URL=\"postgresql://${AFYA_DB_USER}:${AFYA_DB_PASS}@127.0.0.1:5432/${AFYA_DB}\" \\"
echo "        pnpm --filter @afya/api exec tsx src/db/migrate.ts"
echo
echo "==> Deploy:"
echo "      gcloud builds submit --config cloudbuild.yaml --project $PROJECT"
echo
echo "==> Custom domain + browser SSO:"
echo "      1. Map afya.<yourdomain> to the 'afya' Cloud Run service; update"
echo "         BETTER_AUTH_URL and CORS_ORIGINS in cloudbuild.yaml to match."
echo "      2. For ONE cookie across both apps, enable Better Auth"
echo "         crossSubDomainCookies with domain '.<yourdomain>' in BOTH apps."
