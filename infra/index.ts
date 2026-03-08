import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

const config = new pulumi.Config();
const gcpConfig = new pulumi.Config("gcp");
const project = gcpConfig.require("project");
const region = gcpConfig.get("region") || "us-central1";

// ============================================================
// 1. Enable required GCP APIs
// ============================================================
const apis = [
  "run.googleapis.com",
  "firestore.googleapis.com",
  "secretmanager.googleapis.com",
  "artifactregistry.googleapis.com",
  "cloudbuild.googleapis.com",
  "firebase.googleapis.com",
  "apphosting.googleapis.com",
];

const enabledApis = apis.map(
  (api) =>
    new gcp.projects.Service(`api-${api.split(".")[0]}`, {
      service: api,
      disableOnDestroy: false,
    })
);

// ============================================================
// 2. Artifact Registry - Docker image repository
// ============================================================
const registry = new gcp.artifactregistry.Repository(
  "smith-repo",
  {
    repositoryId: "smith",
    format: "DOCKER",
    location: region,
    description: "Docker images for Smith backend",
  },
  { dependsOn: enabledApis }
);

// ============================================================
// 3. Secret Manager - API keys
// ============================================================
const googleApiKeySecret = new gcp.secretmanager.Secret(
  "google-api-key",
  {
    secretId: "smith-google-api-key",
    replication: { auto: {} },
  },
  { dependsOn: enabledApis }
);

const simliApiKeySecret = new gcp.secretmanager.Secret(
  "simli-api-key",
  {
    secretId: "smith-simli-api-key",
    replication: { auto: {} },
  },
  { dependsOn: enabledApis }
);

const simliFaceIdSecret = new gcp.secretmanager.Secret(
  "simli-face-id",
  {
    secretId: "smith-simli-face-id",
    replication: { auto: {} },
  },
  { dependsOn: enabledApis }
);

// ============================================================
// 4. Firestore Database
// ============================================================
const firestoreDb = new gcp.firestore.Database(
  "smith-db",
  {
    name: "(default)",
    locationId: region,
    type: "FIRESTORE_NATIVE",
  },
  { dependsOn: enabledApis }
);

// ============================================================
// 5. Cloud Run Service Account
// ============================================================
const serviceAccount = new gcp.serviceaccount.Account("smith-backend-sa", {
  accountId: "smith-backend",
  displayName: "Smith Backend Service Account",
});

// Firestore access
new gcp.projects.IAMMember("smith-firestore-user", {
  project,
  role: "roles/datastore.user",
  member: pulumi.interpolate`serviceAccount:${serviceAccount.email}`,
});

// Secret Manager access
new gcp.projects.IAMMember("smith-secret-accessor", {
  project,
  role: "roles/secretmanager.secretAccessor",
  member: pulumi.interpolate`serviceAccount:${serviceAccount.email}`,
});

// ============================================================
// 6. Cloud Run Service (backend)
// ============================================================
// Note: Image must be built and pushed first via:
//   docker build -t ${region}-docker.pkg.dev/${project}/smith/backend ./backend
//   docker push ${region}-docker.pkg.dev/${project}/smith/backend
const backendImage = pulumi.interpolate`${region}-docker.pkg.dev/${project}/smith/backend:latest`;

const backendService = new gcp.cloudrunv2.Service(
  "smith-backend",
  {
    name: "smith-backend",
    location: region,
    ingress: "INGRESS_TRAFFIC_ALL",
    template: {
      serviceAccount: serviceAccount.email,
      scaling: {
        minInstanceCount: 1,
        maxInstanceCount: 5,
      },
      timeout: "3600s",
      maxInstanceRequestConcurrency: 1,
      containers: [
        {
          image: backendImage,
          resources: {
            limits: {
              memory: "2Gi",
              cpu: "2",
            },
            cpuIdle: false, // Keep CPU allocated for WebSocket
          },
          ports: [{ containerPort: 8080 }],
          envs: [
            {
              name: "GCP_PROJECT_ID",
              value: project,
            },
            {
              name: "ENABLE_SIMLI",
              value: "true",
            },
            {
              name: "CORS_ORIGINS",
              value: "*", // Will restrict after frontend deploy
            },
            {
              name: "GOOGLE_API_KEY",
              valueSource: {
                secretKeyRef: {
                  secret: googleApiKeySecret.secretId,
                  version: "latest",
                },
              },
            },
            {
              name: "SIMLI_API_KEY",
              valueSource: {
                secretKeyRef: {
                  secret: simliApiKeySecret.secretId,
                  version: "latest",
                },
              },
            },
            {
              name: "SIMLI_FACE_ID",
              valueSource: {
                secretKeyRef: {
                  secret: simliFaceIdSecret.secretId,
                  version: "latest",
                },
              },
            },
          ],
          startupProbe: {
            httpGet: { path: "/health" },
            initialDelaySeconds: 10,
            periodSeconds: 5,
            failureThreshold: 6,
          },
          livenessProbe: {
            httpGet: { path: "/health" },
            periodSeconds: 30,
          },
        },
      ],
    },
  },
  { dependsOn: [registry, firestoreDb, ...enabledApis] }
);

// Allow unauthenticated access to Cloud Run
new gcp.cloudrunv2.ServiceIamMember("smith-backend-public", {
  name: backendService.name,
  location: region,
  role: "roles/run.invoker",
  member: "allUsers",
});

// ============================================================
// Outputs
// ============================================================
export const backendUrl = backendService.uris;
export const artifactRegistryUrl = pulumi.interpolate`${region}-docker.pkg.dev/${project}/smith`;
export const firestoreDatabase = firestoreDb.name;
export const serviceAccountEmail = serviceAccount.email;

// Helper commands for manual steps
export const pushImageCommand = pulumi.interpolate`
# Build and push Docker image:
docker build -t ${region}-docker.pkg.dev/${project}/smith/backend ./backend
docker push ${region}-docker.pkg.dev/${project}/smith/backend

# Add secret values (run once):
echo -n "YOUR_GEMINI_KEY" | gcloud secrets versions add smith-google-api-key --data-file=-
echo -n "YOUR_SIMLI_KEY" | gcloud secrets versions add smith-simli-api-key --data-file=-
echo -n "YOUR_FACE_ID" | gcloud secrets versions add smith-simli-face-id --data-file=-
`;
