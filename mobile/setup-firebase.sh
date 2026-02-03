#!/bin/bash

# Script para crear app Android en Firebase y descargar google-services.json

PROJECT_ID="lyrineye"
PACKAGE_NAME="com.mobile.lyrineye.app"

echo "🔥 Configurando Firebase para LyrinEye..."

# Paso 1: Obtener access token de Firebase CLI
echo "📝 Obteniendo access token..."
FIREBASE_TOKEN=$(firebase login:ci --no-localhost 2>&1 | grep -o 'https://[^ ]*' || echo "")

if [ -z "$FIREBASE_TOKEN" ]; then
    echo "⚠️ No se pudo obtener token automáticamente"
    echo "Por favor, ejecuta manualmente:"
    echo "  1. firebase login"
    echo "  2. Luego descarga google-services.json desde Firebase Console"
    exit 1
fi

echo "✅ Token obtenido"

# Por ahora, mostrar instrucciones manuales
echo ""
echo "📋 Instrucciones para completar:"
echo "1. Abre: https://console.firebase.google.com/project/${PROJECT_ID}/settings/general"
echo "2. Haz clic en 'Add app' → Android"
echo "3. Ingresa package name: ${PACKAGE_NAME}"
echo "4. Descarga google-services.json"
echo "5. Ejecuta: cp ~/Downloads/google-services.json mobile/android/app/"
echo ""
