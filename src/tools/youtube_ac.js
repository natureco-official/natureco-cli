/**
 * youtube_ac - YouTube videosunu mevcut tarayıcıda yeni sekmede açar
 */

const { spawn, execFileSync } = require("child_process");
const os = require("os");

const IS_MAC = os.platform() === "darwin";

function getOpenBrowser() {
  const browsers = [
    { name: "Google Chrome", cmd: "Google Chrome" },
    { name: "Safari", cmd: "Safari" },
    { name: "Firefox", cmd: "Firefox" }
  ];

  for (const browser of browsers) {
    try {
      const result = execFileSync("pgrep", ["-x", browser.name], { encoding: "utf8" }); // v5.43: shell yok
      if (result.trim()) {
        return browser.cmd;
      }
    } catch (e) {
      // Browser açık değil
    }
  }
  return null;
}

function isUrl(str) {
  return str.startsWith("http://") || str.startsWith("https://");
}

function isYoutubeUrl(str) {
  return str.includes("youtube.com") || str.includes("youtu.be");
}

async function youtubeAc(params) {
  const { query, url } = params;
  
  if (!query && !url) {
    return { success: false, error: "query veya url gerekli" };
  }

  let youtubeUrl = url || query;

  // URL değilse YouTube arama sayfasını aç
  if (!isUrl(youtubeUrl)) {
    // Boşlukları + ile değiştir ve YouTube arama URL'i oluştur
    const searchTerm = encodeURIComponent(youtubeUrl);
    youtubeUrl = `https://www.youtube.com/results?search_query=${searchTerm}`;
  }

  // YouTube URL değilse hata ver
  if (!isYoutubeUrl(youtubeUrl) && !youtubeUrl.includes("youtube.com")) {
    return { success: false, error: "Lütfen geçerli bir YouTube URL'si veya video adı girin" };
  }

  // Tarayıcı kontrolü
  const browser = IS_MAC ? getOpenBrowser() : null;

  return new Promise((resolve) => {
    const proc = IS_MAC
      ? spawn("open", browser ? ["-a", browser, youtubeUrl] : [youtubeUrl])
      : process.platform === "win32"
        ? spawn("cmd", ["/c", "start", "", youtubeUrl], { windowsHide: true })
        : spawn("xdg-open", [youtubeUrl]);
    proc.on("close", code => {
      if (code === 0) {
        resolve({ 
          success: true, 
          message: browser 
            ? `${browser}'da yeni sekmede açıldı` 
            : "Yeni tarayıcı penceresinde açıldı",
          url: youtubeUrl,
          browser: browser || "new"
        });
      } else {
        resolve({ success: false, error: "Açma hatası" });
      }
    });
    proc.on("error", e => resolve({ success: false, error: e.message }));
  });
}

module.exports = {
  name: "youtube_ac",
  description: "YouTube videosunu mevcut tarayıcıda yeni sekmede açar (Chrome > Safari > Firefox > yeni pencere)",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Aranacak şarkı/video adı (YouTube arama sayfasını açar)" },
      url: { type: "string", description: "Doğrudan YouTube URL'si (opsiyonel)" },
    },
  },
  async execute(params) {
    return await youtubeAc(params);
  },
};
