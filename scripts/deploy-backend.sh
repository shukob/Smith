#!/bin/bash
set -euo pipefail

# Deploy Smith backend to Cloud Run via Artifact Registry
# Usage: ./scripts/deploy-backend.sh <PROJECT_ID> [REGION]

PROJECT_ID="${1:?Usage: deploy-backend.sh <PROJECT_ID> [REGION]}"
REGION="${2:-us-central1}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/smith/backend"

echo "=== Building Docker image ==="
docker build -t "${IMAGE}" ./backend

echo "=== Pushing to Artifact Registry ==="
docker push "${IMAGE}"

echo "=== Updating Cloud Run service ==="
gcloud run services update smith-backend \
  --image "${IMAGE}:latest" \
  --region "${REGION}" \
  --project "${PROJECT_ID}"

echo "=== Done! ==="
gcloud run services describe smith-backend \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --format "value(status.url)"
