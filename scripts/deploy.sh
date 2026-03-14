#!/bin/bash
set -e

echo "=========================================="
echo "  Smith Automated Deployment Script"
echo "=========================================="
echo ""

# 1. Check dependencies
for cmd in gcloud pulumi docker npm; do
    if ! command -v $cmd >/dev/null 2>&1; then
        echo >&2 "Error: $cmd is required but not installed. Aborting."
        exit 1
    fi
done

# 2. Get Configuration
if [ -f .env ]; then
    echo "Loading configuration from .env file..."
    # Read .env file, ignore comments and empty lines
    while IFS='=' read -r key value; do
        if [[ ! -z "$key" && "$key" != \#* ]]; then
            # Remove any surrounding quotes
            value="${value%\"}"
            value="${value#\"}"
            value="${value%\'}"
            value="${value#\'}"
            export "$key=$value"
        fi
    done < .env
else
    echo "Error: .env file not found. Please create one based on .env.example."
    exit 1
fi

if [ -z "$GCP_PROJECT" ] || [ -z "$GEMINI_KEY" ] || [ -z "$SIMLI_KEY" ] || [ -z "$SIMLI_FACE_ID" ]; then
    echo "Error: Missing required variables in .env file."
    echo "Make sure GCP_PROJECT, GEMINI_KEY, SIMLI_KEY, and SIMLI_FACE_ID are set."
    exit 1
fi

REGION=${GCP_REGION:-"us-central1"}

gcloud config set project "$GCP_PROJECT"

# 3. Setup Infra with Pulumi
echo ""
echo "=> [1/3] Deploying Infrastructure via Pulumi..."
cd infra
npm install

# Initialize stack if it doesn't exist
pulumi stack select dev 2>/dev/null || pulumi stack init dev
pulumi config set gcp:project "$GCP_PROJECT"
pulumi config set gcp:region "$REGION"

# Run pulumi non-interactively
pulumi up --yes
cd ..

# 4. Set Secrets
echo ""
echo "=> [2/3] Storing Secrets in GCP Secret Manager..."
if [ -n "$GEMINI_KEY" ]; then
    echo -n "$GEMINI_KEY" | gcloud secrets versions add smith-google-api-key --data-file=- --project="$GCP_PROJECT" || true
fi
if [ -n "$SIMLI_KEY" ]; then
    echo -n "$SIMLI_KEY" | gcloud secrets versions add smith-simli-api-key --data-file=- --project="$GCP_PROJECT" || true
fi
if [ -n "$SIMLI_FACE_ID" ]; then
    echo -n "$SIMLI_FACE_ID" | gcloud secrets versions add smith-simli-face-id --data-file=- --project="$GCP_PROJECT" || true
fi

# 5. Build and Deploy Backend
echo ""
echo "=> [3/3] Building and Pushing Backend Docker Image..."

# Configure docker authentication
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

IMAGE_URL="${REGION}-docker.pkg.dev/${GCP_PROJECT}/smith/backend"

echo "Building Docker Image: $IMAGE_URL"
docker build -t "$IMAGE_URL" ./backend

echo "Pushing Docker Image..."
docker push "$IMAGE_URL"

echo ""
echo "==========================================================="
echo " 🎉 Backend & Infrastructure Deployment Complete!"
echo "==========================================================="
echo ""
echo "Next steps for frontend deployment:"
echo "1. cd frontend"
echo "2. cp .env.example .env.local"
echo "3. Edit .env.local and set NEXT_PUBLIC_BACKEND_URL to your Cloud Run URL"
echo "4. firebase init apphosting"
echo "5. firebase apphosting:backends:create"
echo "==========================================================="
