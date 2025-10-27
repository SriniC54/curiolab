#!/bin/bash

# CurioLab Deployment Script for DigitalOcean
set -e

echo "🔬 Deploying CurioLab to DigitalOcean..."

# Pull latest code
echo "📥 Pulling latest code from GitHub..."
git pull origin main

# Copy environment variables
echo "⚙️  Setting up environment variables..."
cp .env.production.example .env.production
cp .env.example .env

# Replace placeholder with actual API key
sed -i 's/your_openai_api_key_here/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/g' .env
sed -i 's/your_openai_api_key_here/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/g' .env.production

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker-compose down

# Build and start services
echo "🏗️  Building and starting services..."
docker-compose up -d --build

# Health check
echo "🏥 Running health checks..."
sleep 30

# Check backend health
if curl -f http://localhost:8000/ > /dev/null 2>&1; then
    echo "✅ Backend is healthy"
else
    echo "❌ Backend health check failed"
    exit 1
fi

# Check frontend health
if curl -f http://localhost:3000/ > /dev/null 2>&1; then
    echo "✅ Frontend is healthy"
else
    echo "❌ Frontend health check failed"
    exit 1
fi

echo "🎉 CurioLab deployment completed successfully!"
echo "🌐 Visit: https://curiolab.app"