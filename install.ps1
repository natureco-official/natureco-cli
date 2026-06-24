# NatureCo CLI Installer for Windows

Write-Host '🌿 NatureCo CLI kuruluyor...' -ForegroundColor Green
Write-Host ''

# Node.js kontrolü
try {
    $nodeVersion = node -v
    Write-Host "✓ Node.js $nodeVersion bulundu" -ForegroundColor Green
    
    # Versiyon kontrolü
    $versionNumber = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
    if ($versionNumber -lt 18) {
        Write-Host '❌ Node.js 18+ gerekli.' -ForegroundColor Red
        Write-Host '   https://nodejs.org adresinden güncel sürümü kurun.' -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host '❌ Node.js bulunamadı.' -ForegroundColor Red
    Write-Host '   https://nodejs.org adresinden Node.js 18+ kurun.' -ForegroundColor Yellow
    exit 1
}

Write-Host ''

# npm ile kur
Write-Host '📦 natureco-cli kuruluyor...' -ForegroundColor Cyan
Write-Host ''

try {
    npm install -g natureco-cli@latest
    
    Write-Host ''
    Write-Host '✅ Kurulum tamamlandı!' -ForegroundColor Green
    Write-Host ''
    Write-Host '🚀 Başlamak için:' -ForegroundColor Cyan
    Write-Host '   natureco' -ForegroundColor White
    Write-Host ''
    Write-Host '📚 Daha fazla bilgi:' -ForegroundColor Cyan
    Write-Host '   https://natureco.me/docs' -ForegroundColor White
    Write-Host ''
} catch {
    Write-Host ''
    Write-Host '❌ Kurulum başarısız oldu.' -ForegroundColor Red
    Write-Host ''
    Write-Host 'Manuel kurulum için:' -ForegroundColor Yellow
    Write-Host '   npm install -g natureco-cli' -ForegroundColor White
    Write-Host ''
    exit 1
}
