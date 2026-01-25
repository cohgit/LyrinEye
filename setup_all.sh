#!/bin/bash
set -e

REPO_NAME="LyrinEye"
GITHUB_USER="cohgit"
FULL_REPO="$GITHUB_USER/$REPO_NAME"
SUBSCRIPTION_ID="bff58f0c-efd6-4616-8077-7bd39a1c31f4"
TENANT_ID="88856f18-da41-450d-97b1-008453ad7e1a"

echo "Creating GitHub repository..."
gh repo create $REPO_NAME --public --source=. --remote=origin --push || echo "Repo might already exist locally or remotely"

echo "Creating Azure App Registration..."
APP_ID=$(az ad app create --display-name "lyrineye-github-actions" --query appId --output tsv)
echo "APP_ID: $APP_ID"

echo "Creating Service Principal..."
az ad sp create --id $APP_ID

echo "Adding Federated Credential..."
# This is required for OIDC
az ad app website-config --id $APP_ID --websites "https://github.com" || true # Not strictly necessary for OIDC but good to have context

# Federated identity JSON
cat << FED > federated-credential.json
{
  "name": "lyrineye-github-oidc",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:$FULL_REPO:ref:refs/heads/main",
  "description": "GitHub Actions OIDC for LyrinEye",
  "audiences": ["api://AzureADTokenExchange"]
}
FED

az ad app federated-credential create --id $APP_ID --parameters federated-credential.json

echo "Assigning Contributor role..."
az role assignment create --role "Contributor" --assignee $APP_ID --subscription $SUBSCRIPTION_ID

echo "Setting GitHub Secrets..."
gh secret set AZURE_CLIENT_ID --body "$APP_ID"
gh secret set AZURE_TENANT_ID --body "$TENANT_ID"
gh secret set AZURE_SUBSCRIPTION_ID --body "$SUBSCRIPTION_ID"
# Get TF Token from local config
TF_TOKEN=$(jq -r '.credentials."app.terraform.io".token' ~/.terraform.d/credentials.tfrc.json)
gh secret set TF_API_TOKEN --body "$TF_TOKEN"

echo "Setup complete!"
