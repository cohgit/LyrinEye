#!/bin/bash

# Script to configure Azure Log Analytics credentials on Mediasoup server

# Azure Log Analytics Workspace
WORKSPACE_ID="4293cd25-8e2b-475a-a591-fc110d03fac7"

echo "📋 Setting up Azure Log Analytics for Mediasoup server..."

# Get workspace key
WORKSPACE_KEY=$(az monitor log-analytics workspace get-shared-keys \
    --workspace-name "lyrineye-dev-law-tizsty" \
    --resource-group "lyrineye-dev-rg" \
    --query "primarySharedKey" -o tsv)

if [ -z "$WORKSPACE_KEY" ]; then
    echo "❌ Failed to retrieve workspace key"
    exit 1
fi

echo "✅ Retrieved workspace credentials"
echo ""
echo "Add these to your .env file on the server:"
echo "AZURE_LOG_WORKSPACE_ID=$WORKSPACE_ID"
echo "AZURE_LOG_WORKSPACE_KEY=$WORKSPACE_KEY"
