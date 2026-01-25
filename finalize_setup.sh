#!/bin/bash
set -e

# Configuración
APP_ID="f3f55324-2ffa-4f24-a203-34ccb374335a"
REPO_NAME="LyrinEye"
GITHUB_USER="cohgit" # Ajustado según gh auth status
FULL_REPO="$GITHUB_USER/$REPO_NAME"
SUBSCRIPTION_ID="bff58f0c-efd6-4616-8077-7bd39a1c31f4"
TENANT_ID="88856f18-da41-450d-97b1-008453ad7e1a"

echo "Creando Service Principal para APP: $APP_ID..."
az ad sp create --id $APP_ID || echo "SP ya existe"

echo "Configurando Credencial Federada..."
cat << FED > federated-credential.json
{
  "name": "lyrineye-oidc",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:$FULL_REPO:ref:refs/heads/main",
  "description": "GitHub Actions OIDC",
  "audiences": ["api://AzureADTokenExchange"]
}
FED
az ad app federated-credential create --id $APP_ID --parameters federated-credential.json

echo "Asignando rol de Contributor en suscripción $SUBSCRIPTION_ID..."
az role assignment create --role "Contributor" --assignee $APP_ID --subscription $SUBSCRIPTION_ID

echo "Configurando secretos en GitHub..."
# Si el repo no está linkeado, lo intentamos crear
gh repo create $REPO_NAME --public --source=. --remote=origin --push || echo "Repo ya existe o no se puede pushear aún"

gh secret set AZURE_CLIENT_ID --body "$APP_ID"
gh secret set AZURE_TENANT_ID --body "$TENANT_ID"
gh secret set AZURE_SUBSCRIPTION_ID --body "$SUBSCRIPTION_ID"
TF_TOKEN=$(jq -r '.credentials."app.terraform.io".token' ~/.terraform.d/credentials.tfrc.json)
gh secret set TF_API_TOKEN --body "$TF_TOKEN"

echo "¡Configuración completada exitosamente!"
