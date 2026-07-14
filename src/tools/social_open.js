const { spawn, execFileSync } = require("child_process");
const os = require("os");

const IS_MAC = os.platform() === "darwin";
const PLATFORM_HOME = {
  youtube: 'https://www.youtube.com', twitter: 'https://x.com', instagram: 'https://www.instagram.com',
  tiktok: 'https://www.tiktok.com', linkedin: 'https://www.linkedin.com', github: 'https://github.com',
  reddit: 'https://www.reddit.com', facebook: 'https://www.facebook.com', twitch: 'https://www.twitch.tv',
  medium: 'https://medium.com', spotify: 'https://open.spotify.com',
};

const PLATFORMS = {
  youtube: {
    match: ["youtube", "yt", "youtu.be"],
    url: (id) => id.match(/^https?:\/\//) ? id
      : id.startsWith("@") ? `https://www.youtube.com/${id}`
      : id.startsWith("UC") ? `https://www.youtube.com/channel/${id}`
      : `https://www.youtube.com/@${id}`,
  },
  twitter: {
    match: ["twitter", "x.com", "x "],
    url: (id) => id.startsWith("http") ? id : `https://x.com/${id.replace(/^@/, "")}`,
  },
  instagram: {
    match: ["instagram", "ig", "insta"],
    url: (id) => id.startsWith("http") ? id : `https://www.instagram.com/${id.replace(/^@/, "")}/`,
  },
  tiktok: {
    match: ["tiktok", "tt"],
    url: (id) => id.startsWith("http") ? id : `https://www.tiktok.com/@${id.replace(/^@/, "")}`,
  },
  linkedin: {
    match: ["linkedin", "linked in", "in"],
    url: (id) => id.startsWith("http") ? id : `https://www.linkedin.com/in/${id.replace(/^@/, "")}`,
  },
  github: {
    match: ["github", "gh", "git"],
    url: (id) => id.startsWith("http") ? id : `https://github.com/${id.replace(/^@/, "")}`,
  },
  reddit: {
    match: ["reddit", "r/"],
    url: (id) => id.startsWith("http") ? id
      : id.startsWith("r/") ? `https://www.reddit.com/${id}`
      : `https://www.reddit.com/user/${id.replace(/^u\//, "")}`,
  },
  facebook: {
    match: ["facebook", "fb"],
    url: (id) => id.startsWith("http") ? id : `https://www.facebook.com/${id.replace(/^@/, "")}`,
  },
  twitch: {
    match: ["twitch", "tv"],
    url: (id) => id.startsWith("http") ? id : `https://www.twitch.tv/${id.replace(/^@/, "")}`,
  },
  medium: {
    match: ["medium"],
    url: (id) => id.startsWith("http") ? id : `https://medium.com/@${id.replace(/^@/, "")}`,
  },
  spotify: {
    match: ["spotify", "spt"],
    url: (id) => id.startsWith("http") ? id : `https://open.spotify.com/search/${encodeURIComponent(id)}`,
  },
};

function getOpenBrowser() {
  const browsers = [
    { name: "Google Chrome", cmd: "Google Chrome" },
    { name: "Safari", cmd: "Safari" },
    { name: "Firefox", cmd: "Firefox" },
  ];
  for (const browser of browsers) {
    try {
      const result = execFileSync("pgrep", ["-x", browser.name], { encoding: "utf8" }); // v5.43: shell yok
      if (result.trim()) return browser.cmd;
    } catch (e) {}
  }
  return null;
}

function detectPlatform(input) {
  const lower = String(input || '').toLowerCase().trim();

  for (const [name, p] of Object.entries(PLATFORMS)) {
    if (p.match.includes(lower)) return { platform: name, id: '', url: PLATFORM_HOME[name] };
  }

  // Already a URL
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    for (const [name, p] of Object.entries(PLATFORMS)) {
      if (p.match.some(m => lower.includes(m))) {
        return { platform: name, id: input, url: input };
      }
    }
    return { platform: "web", id: input, url: input };
  }

  // "platform:username" pattern (e.g. "yt:gencay", "gh:gencay")
  const colonMatch = lower.match(/^(\w+):(.+)$/);
  if (colonMatch) {
    const [, platformKey, username] = colonMatch;
    for (const [name, p] of Object.entries(PLATFORMS)) {
      if (p.match.some(m => platformKey === m || platformKey.startsWith(m))) {
        return { platform: name, id: username, url: p.url(username) };
      }
    }
  }

  // Platform prefix match (e.g. "github gencay", "twitter @elon")
  for (const [name, p] of Object.entries(PLATFORMS)) {
    for (const m of p.match) {
      if (lower.startsWith(m) && lower.length > m.length) {
        const username = input.slice(m.length).trim().replace(/^@?/, "");
        return { platform: name, id: username, url: p.url(username) };
      }
    }
  }

  // Auto-detect: if input has an @ prefix or looks like a handle, try common platforms
  if (input.startsWith("@")) {
    const username = input.replace(/^@/, "");
    return {
      platform: "auto",
      id: username,
      url: `https://www.google.com/search?q=${encodeURIComponent(input)}`,
      note: "Hesap adı algılandı. Hangi platform olduğunu belirt (yt:, gh:, twitter: vb).",
    };
  }

  // Fallback: Google search
  return {
    platform: "search",
    id: input,
    url: `https://www.google.com/search?q=${encodeURIComponent(input)}`,
    note: "Platform algılanamadı. Google'da aratılıyor. Kullanım: 'twitter @kullanici', 'github repo', 'yt:kanaladi'",
  };
}

// v5.39: platformlar arası URL açma — macOS `open`, Windows `start`, Linux `xdg-open`.
function openUrlProc(url, browserApp) {
  if (IS_MAC) return spawn("open", browserApp ? ["-a", browserApp, url] : [url]);
  if (process.platform === "win32") return spawn("cmd", ["/c", "start", "", url], { windowsHide: true });
  return spawn("xdg-open", [url]); // linux + diğer *nix
}

async function socialOpen(params) {
  const { query, platform, username } = params;

  if (!query && !platform && !username) {
    return { success: false, error: "query veya platform+username gerekli" };
  }

  let url, platformName, note;
  if (platform && !username && !query) {
    const key = platform.toLowerCase();
    if (!PLATFORM_HOME[key]) return { success: false, error: `Bilinmeyen platform: ${platform}` };
    url = PLATFORM_HOME[key];
    platformName = key;
  } else if (platform && username) {
    const p = PLATFORMS[platform.toLowerCase()];
    if (!p) return { success: false, error: `Bilinmeyen platform: ${platform}. Desteklenenler: ${Object.keys(PLATFORMS).join(", ")}` };
    url = p.url(username);
    platformName = platform;
  } else {
    const detected = detectPlatform(query);
    url = detected.url;
    platformName = detected.platform;
    note = detected.note;
  }

  const browser = IS_MAC ? getOpenBrowser() : null; // pgrep sadece macOS
  return new Promise((resolve) => {
    const proc = openUrlProc(url, browser);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve({
          success: true,
          message: browser
            ? `${browser}'da yeni sekmede açıldı`
            : "Varsayılan tarayıcıda açıldı",
          platform: platformName,
          url,
          browser: browser || "default",
          ...(note ? { note } : {}),
        });
      } else {
        resolve({ success: false, error: "Açma hatası" });
      }
    });
    proc.on("error", (e) => resolve({ success: false, error: e.message }));
  });
}

module.exports = {
  name: "social_open",
  description: "Sosyal medya hesabını veya sayfasını mevcut tarayıcıda yeni sekmede açar. Destek: youtube, twitter/x, instagram, tiktok, linkedin, github, reddit, facebook, twitch, medium, spotify. Kullanım: 'twitter @kullanici', 'github repo', 'yt:kanaladi', 'instagram profili'",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Platform + kullanici adi veya arama terimi (örn: 'twitter @elon', 'github gencay', 'yt:kanaladi')" },
      platform: { type: "string", description: "Platform adi (youtube, twitter, instagram, tiktok, linkedin, github, reddit, facebook, twitch, medium, spotify)" },
      username: { type: "string", description: "Kullanici adi veya kanal adi (platform ile birlikte kullanilir)" },
    },
  },
  async execute(params) {
    return await socialOpen(params);
  },
  _test: { detectPlatform, PLATFORM_HOME },
};
