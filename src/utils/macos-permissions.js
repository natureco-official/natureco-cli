'use strict';

function classifyMacAutomationError(value) {
  const text = String(value || '').trim();
  if (/could not create image from display|screen.?record|screencapture exit/i.test(text)) {
    return {
      permission: 'screen-recording',
      settingsUrl: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
      error: 'macOS Ekran Kaydı izni yok. Sistem Ayarları → Gizlilik ve Güvenlik → Ekran Kaydı bölümünde Cupertino Terminal (veya komutu çalıştıran terminal) için izin verin; ardından uygulamayı tamamen kapatıp yeniden açın.',
    };
  }
  if (/not authorized to send apple events|assistive access|accessibility|(-1719)|(-1743)/i.test(text)) {
    return {
      permission: 'accessibility',
      settingsUrl: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
      error: 'macOS Erişilebilirlik izni yok. Sistem Ayarları → Gizlilik ve Güvenlik → Erişilebilirlik bölümünde Cupertino Terminal (veya komutu çalıştıran terminal) için izin verin; ardından uygulamayı yeniden açın.',
    };
  }
  return { error: text || 'Bilinmeyen macOS otomasyon hatası' };
}

module.exports = { classifyMacAutomationError };
