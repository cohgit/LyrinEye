#!/bin/bash

# Deploy script for Mediasoup server
# Usage: ./deploy.sh <server-ip>

set -e

SERVER_IP=$1
SERVER_USER="azureuser"
SERVER_PATH="/opt/mediasoup-server"
SSH_KEY="~/.ssh/lyrineye_mediasoup"

if [ -z "$SERVER_IP" ]; then
    echo "Usage: ./deploy.sh <server-ip>"
    exit 1
fi

echo "🚀 Deploying Mediasoup server to $SERVER_IP..."

# Build locally
echo "📦 Building TypeScript..."
npm run build

# Create deployment package
echo "📦 Creating deployment package..."
tar -czf mediasoup-server.tar.gz \
    dist/ \
    package.json \
    package-lock.json \
    node_modules/ \
    .env.example

# Copy to server
echo "📤 Uploading to server..."
scp -i $SSH_KEY mediasoup-server.tar.gz $SERVER_USER@$SERVER_IP:/tmp/

# Deploy on server
echo "🔧 Installing on server..."
ssh -i $SSH_KEY $SERVER_USER@$SERVER_IP << 'EOF'
    set -e
    
    # Stop service if running
    sudo systemctl stop mediasoup || true
    
    # Extract files
    sudo mkdir -p /opt/mediasoup-server
    sudo tar -xzf /tmp/mediasoup-server.tar.gz -C /opt/mediasoup-server
    sudo chown -R mediasoup:mediasoup /opt/mediasoup-server
    
    # Setup environment
    if [ ! -f /opt/mediasoup-server/.env ]; then
        sudo cp /opt/mediasoup-server/.env.example /opt/mediasoup-server/.env
        echo "⚠️  Please configure /opt/mediasoup-server/.env"
    fi
    
    # Start service
    sudo systemctl enable mediasoup
    sudo systemctl start mediasoup
    
    # Check status
    sudo systemctl status mediasoup --no-pager
    
    # Cleanup
    rm /tmp/mediasoup-server.tar.gz
EOF

# Cleanup local
rm mediasoup-server.tar.gz

echo "✅ Deployment complete!"
echo "📊 Check logs: ssh -i $SSH_KEY $SERVER_USER@$SERVER_IP 'sudo journalctl -u mediasoup -f'"
