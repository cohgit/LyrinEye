#!/bin/bash

# Script para descargar Service Account Key de Firebase
# Este archivo se usará en el backend para enviar notificaciones push

PROJECT_ID="lyrineye"
OUTPUT_FILE="$HOME/.ssh/firebase-lyrineye-service-account.json"

echo "🔐 Descargando Service Account Key de Firebase..."
echo "📋 Project ID: $PROJECT_ID"
echo "📁 Destino: $OUTPUT_FILE"
echo ""

# Instrucciones para el usuario
echo "Por favor, ejecuta estos pasos MANUALMENTE en tu navegador:"
echo ""
echo "1. Abre: https://console.firebase.google.com/project/${PROJECT_ID}/settings/serviceaccounts/adminsdk"
echo "2. Haz clic en 'Generate new private key'"
echo "3. Confirma haciendo clic en 'Generate key'"
echo "4. El archivo se descargará a ~/Downloads/"
echo "5. Muévelo ejecutando:"
echo ""
echo "   mv ~/Downloads/lyrineye-*.json ${OUTPUT_FILE}"
echo ""
echo "6. Codifica en base64:"
echo ""
echo "   cat ${OUTPUT_FILE} | base64 > /tmp/firebase-service-account-base64.txt"
echo ""
echo "7. Agrega a Azure Container App:"
echo ""
echo "   SERVICE_ACCOUNT_B64=\$(cat /tmp/firebase-service-account-base64.txt)"
echo "   az containerapp update \\"
echo "     --name lyrineye-dev-ca-tizsty \\"
echo "     --resource-group lyrineye-dev-rg \\"
echo "     --set-env-vars \"FIREBASE_SERVICE_ACCOUNT_KEY=\${SERVICE_ACCOUNT_B64}\""
echo ""
