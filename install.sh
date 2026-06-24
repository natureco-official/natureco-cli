#!/bin/bash
# NatureCo CLI Installer

set -e

echo '🌿 NatureCo CLI kuruluyor...'
echo ''

# Node.js kontrolü
if ! command -v node &> /dev/null; then
    echo '❌ Node.js bulunamadı.'
    echo '   https://nodejs.org adresinden Node.js 18+ kurun.'
    exit 1
fi

# Node.js versiyon kontrolü
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js 18+ gerekli. Mevcut versiyon: $(node -v)"
    echo '   https://nodejs.org adresinden güncel sürümü kurun.'
    exit 1
fi

echo "✓ Node.js $(node -v) bulundu"
echo ''

# npm ile kur
echo '📦 natureco-cli kuruluyor...'
echo ''

if npm install -g natureco-cli@latest; then
    echo ''
    echo '✅ Kurulum tamamlandı!'
    echo ''
    echo '🚀 Başlamak için:'
    echo '   natureco'
    echo ''
    echo '📚 Daha fazla bilgi:'
    echo '   https://natureco.me/docs'
    echo ''
else
    echo ''
    echo '❌ Kurulum başarısız oldu.'
    echo ''
    echo 'Manuel kurulum için:'
    echo '   npm install -g natureco-cli'
    echo ''
    exit 1
fi
