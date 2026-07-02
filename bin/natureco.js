#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const packageJson = require('../package.json');
// Küresel çökme/EPIPE yakalayıcıları — ham Node stack yerine düzgün mesaj + audit log
require('../src/utils/process-errors').install();
const login = require('../src/commands/login');
const logout = require('../src/commands/logout');
const bots = require('../src/commands/bots');
const chat = require('../src/commands/chat');
const help = require('../src/commands/help');
const gateway = require('../src/commands/gateway');
const init = require('../src/commands/init');
const config = require('../src/commands/config');
const ask = require('../src/commands/ask');
const run = require('../src/commands/run');
const signal = require('../src/commands/signal');
const irc = require('../src/commands/irc');
const mattermost = require('../src/commands/mattermost');
const imessage = require('../src/commands/imessage');
const sms = require('../src/commands/sms');
const webhooks = require('../src/commands/webhooks');
const bonjour = require('../src/commands/bonjour');
const policy = require('../src/commands/policy');
const voice = require('../src/commands/voice');
const clickclack = require('../src/commands/clickclack');
const adminRpc = require('../src/commands/admin-rpc');
const ocPath = require('../src/commands/oc-path');
const workboard = require('../src/commands/workboard');
const threadOwnership = require('../src/commands/thread-ownership');
const devicePair = require('../src/commands/device-pair');
const openProse = require('../src/commands/open-prose');
const vydra = require('../src/commands/vydra');
// OpenClaw uyumlu komutlar
const agent = require('../src/commands/agent');
const approvals = require('../src/commands/approvals');
const backup = require('../src/commands/backup');
const audit = require('../src/commands/audit');
const cost = require('../src/commands/cost');
const naturehub = require('../src/commands/naturehub');
const medium = require('../src/commands/medium');
const seo = require('../src/commands/seo');
const xp = require('../src/commands/xp');
const team = require('../src/commands/team');
const repl = require('../src/commands/repl');
const capability = require('../src/commands/capability');
const commitments = require('../src/commands/commitments');
const completion = require('../src/commands/completion');
const configure = require('../src/commands/configure');
const crestodian = require('../src/commands/crestodian');
const daemon = require('../src/commands/daemon');
const devices = require('../src/commands/devices');
const directory = require('../src/commands/directory');
const dns = require('../src/commands/dns');
const docs = require('../src/commands/docs');
const execPolicy = require('../src/commands/exec-policy');
const health = require('../src/commands/health');
const infer = require('../src/commands/infer');
const node = require('../src/commands/node');
const nodes = require('../src/commands/nodes');
const onboard = require('../src/commands/onboard');
const proxy = require('../src/commands/proxy');
const qr = require('../src/commands/qr');
const sandbox = require('../src/commands/sandbox');
const secrets = require('../src/commands/secrets');
const system = require('../src/commands/system');
const terminal = require('../src/commands/terminal');
const transcripts = require('../src/commands/transcripts');
const wiki = require('../src/commands/wiki');
const browser = require('../src/commands/browser');
const tools = require('../src/commands/tools');

const program = new Command();

program
  .name('natureco')
  .description('NatureCo AI Bot Terminal Interface')
  .version(packageJson.version);

program.addHelpText('after', `
${chalk.yellow('🤖 AI & Chat')}
  ${chalk.cyan('chat')}          AI sohbet başlat
  ${chalk.cyan('code')}          Code agent — dosya oku, yaz, komut çalıştır
  ${chalk.cyan('ask')}           Tek soru sor
  ${chalk.cyan('run')}           Markdown script çalıştır
  ${chalk.cyan('bots')}          Bot listesi
  ${chalk.cyan('agent')}         One-shot agent (run|abort|tail|logs)
  ${chalk.cyan('agents')}        Agent yönetimi (list|set|info|add|bindings|bind|unbind|set-identity)
  ${chalk.cyan('commitments')}   Eylem taahhütleri (list|add|check|resolve|summary|pending|done)
  ${chalk.cyan('infer')}         Yetenek/algılama (list|inspect|model|image|audio|tts|video|web|embedding|auth)

${chalk.yellow('⚙️  Kurulum & Ayarlar')}
  ${chalk.cyan('setup')}         İlk kurulum (config|workspace|dirs|status)
  ${chalk.cyan('onboard')}       Interaktif onboarding (gateway|auth|workspace|channels|skills|health|status)
  ${chalk.cyan('configure')}     Interaktif yapılandırma (gateway|auth|channels|plugins|skills)
  ${chalk.cyan('login')}         API key ile giriş
  ${chalk.cyan('logout')}        Çıkış
  ${chalk.cyan('config')}        Ayarlar (get|set|unset|list|file|schema|validate|backups|restore)
  ${chalk.cyan('doctor')}        Sistem teşhis (run|list|check)
  ${chalk.cyan('update')}        Güncelleme (run|status|wizard)
  ${chalk.cyan('init')}          Proje başlatma
  ${chalk.cyan('completion')}    Shell completion (bash|zsh|fish)

${chalk.yellow('🔌 Entegrasyonlar')}
  ${chalk.cyan('telegram')}      Telegram bağlantısı
  ${chalk.cyan('whatsapp')}      WhatsApp bağlantısı
  ${chalk.cyan('discord')}       Discord bağlantısı
  ${chalk.cyan('slack')}         Slack bağlantısı
  ${chalk.cyan('signal')}        Signal bağlantısı
  ${chalk.cyan('irc')}           IRC bağlantısı
  ${chalk.cyan('mattermost')}    Mattermost bağlantısı
  ${chalk.cyan('imessage')}      iMessage bağlantısı
  ${chalk.cyan('sms')}           SMS (Twilio) bağlantısı
  ${chalk.cyan('channels')}      Kanal yönetimi (list|status|add|remove|logs|login|logout|capabilities|resolve)
  ${chalk.cyan('message')}       Cross-channel mesaj (send|broadcast|poll|react|read|edit|delete|search|pin|thread|sticker|role|moderation|event|timeout|kick|ban)
  ${chalk.cyan('gateway')}       WebSocket gateway (start|stop|status|call|usage-cost|probe|discover|install|uninstall|health|restart|diagnostics|run)

${chalk.yellow('💻 Geliştirici Araçları')}
  ${chalk.cyan('git')}           Git entegrasyonu
  ${chalk.cyan('mcp')}           MCP sunucuları (serve|list|show|set|unset)
  ${chalk.cyan('skills')}        Skill yönetimi (list|install|remove|update|create|search|browse|info|check)
  ${chalk.cyan('hooks')}         Hook yönetimi (list|info|check|enable|disable|install|update)
  ${chalk.cyan('cron')}          Zamanlanmış görevler (add|list|remove|get|edit|enable|disable|runs|run)
  ${chalk.cyan('sessions')}      Oturum yönetimi (list|show|cleanup|prune)
  ${chalk.cyan('ultrareview')}   Detaylı kod inceleme
  ${chalk.cyan('transcripts')}   Transcript yönetimi (list|show|path|delete)
  ${chalk.cyan('wiki')}          Wiki vault (status|init|ingest|compile|lint|search|get|apply|doctor|bridge import|obsidian)

${chalk.yellow('📊 Yönetim & Sistem')}
  ${chalk.cyan('dashboard')}     Web kontrol paneli (open|status|url)
  ${chalk.cyan('memory')}        Hafıza yönetimi (status|list|search|show|clear|index|export|import|semantic|wiki)
  ${chalk.cyan('logs')}          Log yönetimi (tail|show|search|clear|path)
  ${chalk.cyan('status')}        Sistem durumu (run|simple|usage)
  ${chalk.cyan('plugins')}       Plugin yönetimi (list|install|uninstall|enable|disable|info|update|search|doctor|registry|marketplace)
  ${chalk.cyan('security')}      Güvenlik denetimi (audit)
  ${chalk.cyan('reset')}         Sıfırlama (config|workspace|all|list)
  ${chalk.cyan('uninstall')}     Kaldırma (run|dry-run)
  ${chalk.cyan('system')}        Sistem durumu/heartbeat/presence (status|heartbeat|presence)
  ${chalk.cyan('health')}        Servis sağlık kontrolü (run|list|check)
  ${chalk.cyan('backup')}        Yedekleme (create|list|restore|verify)
  ${chalk.cyan('secrets')}       Gizli değerler (list|set|get|unset|audit|reload|configure|apply)
  ${chalk.cyan('approvals')}     Onay politikası (add|pending|approve|reject)
  ${chalk.cyan('exec-policy')}   Exec politikası (show|preset|set)
  ${chalk.cyan('workboard')}     Görev/pano yönetimi

${chalk.yellow('🛰️  Ağ & Cihaz')}
  ${chalk.cyan('bonjour')}       Ağ keşfi ve servis tarama
  ${chalk.cyan('dns')}           Ağ keşfi — DNS (discover|resolve|setup)
  ${chalk.cyan('directory')}     Dizin sorgulama (self|peers|search|register|remove)
  ${chalk.cyan('policy')}        Workspace uyumluluk politikası
  ${chalk.cyan('voice')}         Sesli sohbet yapılandırması
  ${chalk.cyan('clickclack')}    Bildirim/beep kanalı
  ${chalk.cyan('admin-rpc')}     HTTP admin RPC endpoint
  ${chalk.cyan('oc-path')}       nc:// URI path handler
  ${chalk.cyan('thread-ownership')} Slack thread koordinasyonu
  ${chalk.cyan('device-pair')}   Cihaz eşleştirme (QR kod)
  ${chalk.cyan('devices')}       Cihaz yönetimi (list|pair|unpair|token|regenerate-token|rotate|revoke|clear)
  ${chalk.cyan('qr')}            QR kod ile eşleştirme
  ${chalk.cyan('pairing')}       Cihaz eşleştirme (list|approve|reject|generate)

${chalk.yellow('🔧 Altyapı')}
  ${chalk.cyan('daemon')}        Gateway daemon (status|start|stop|restart)
  ${chalk.cyan('node')}          Node host (run|status|install|uninstall|stop|restart)
  ${chalk.cyan('nodes')}         Node network (list|pending|approve|reject|remove|rename|status|describe|invoke|notify|push|canvas|camera|screen|location)
  ${chalk.cyan('proxy')}         Debug proxy (start|stop|status|run|coverage|sessions|query|blob|purge)
  ${chalk.cyan('sandbox')}       Sandbox container (list|recreate|explain)
  ${chalk.cyan('capability')}    Yetenek sorgulama (list|inspect)
  ${chalk.cyan('acp')}           ACP endpoint (status|info)
  ${chalk.cyan('tui')}           Terminal UI (start|local|status)
  ${chalk.cyan('path')}          nc:// URI path yönetimi (resolve|find|set|validate|emit)
  ${chalk.cyan('clawbot')}       Legacy clawbot (qr)

${chalk.yellow('📦 Medya & İçerik')}
  ${chalk.cyan('open-prose')}    Prose skills bundle
  ${chalk.cyan('vydra')}         Vydra medya sağlayıcı
  ${chalk.cyan('docs')}          Dokümantasyon arama
  ${chalk.cyan('browser')}       Browser automation (status|start|stop|tabs|open|close|navigate|screenshot|snapshot|click|type|press|resize|hover|drag|select|upload|fill|dialog|wait|evaluate|console|pdf|profiles|focus|reset-profile|create-profile|delete-profile)

${chalk.yellow('Örnekler:')}
  ${chalk.gray('$ natureco setup')}              İlk kurulum
  ${chalk.gray('$ natureco onbord')}             Onboarding
  ${chalk.gray('$ natureco chat')}               Sohbet başlat
  ${chalk.gray('$ natureco code')}               Code agent
  ${chalk.gray('$ natureco doctor')}             Sistem kontrolü
  ${chalk.gray('$ natureco agent run "dosya oku"')}  One-shot agent
  ${chalk.gray('$ natureco completion bash')}    Shell completion
`);

program
  .command('login')
  .description('Login with your NatureCo API key')
  .action(login);

program
  .command('setup [action]')
  .description('Run initial setup wizard (wizard|config|workspace|dirs|status)')
  .action(async (action) => {
    const setup = require('../src/commands/setup');
    await setup(action ? [action] : []);
  });

program
  .command('logout')
  .description('Logout and remove stored credentials')
  .action(logout);

program
  .command('bots')
  .description('List your AI bots')
  .action(bots);

program
  .command('chat [bot-name...]')
  .description('Start interactive chat with a bot (uses default bot if not specified)')
  .option('--resume [session-id]', 'Resume a previous session')
  .option('--continue', 'son oturumu devam ettir')
  .option('--list', 'geçmiş oturumları listele')
  .option('--no-stream', 'streaming devre dışı')
  .action((botNameParts, options) => {
    const botName = Array.isArray(botNameParts) ? botNameParts.join(' ') : botNameParts;
    chat(botName, options);
  });

program
  .command('code [file]')
  .description('Agentic coding modu v5 — Claude Code alternative (47 tools, TUI, auto tool selection)')
  .option('--dir <path>', 'çalışma dizini', process.cwd())
  .option('--no-stream', 'streaming devre dışı')
  .option('--dry-run', 'değişiklikleri göster ama uygulama')
  .option('--legacy', 'v2.23 eski code agent kullan')
  .action((file, options) => {
    if (options.legacy) {
      const codeCmd = require('../src/commands/code');
      codeCmd(file, options);
    } else {
      const codeV5 = require('../src/commands/code_v5');
      codeV5(options.dir || (file ? path.dirname(path.resolve(file)) : null));
    }
  });

program
  .command('init')
  .description('Initialize NatureCo project in current directory')
  .action(init);

program
  .command('config <action> [key] [value...]')
  .description('Manage configuration (get|set|unset|list|file|schema|validate|backups|restore)')
  .action((action, key, value) => config([action, key, ...(value || [])]));

program
  .command('skills [action] [params...]')
  .description('Manage skills (list|install|remove|update|create|search|browse|info|check)')
  .action((action, params) => {
    const skillsCmd = require('../src/commands/skills');
    skillsCmd([action, ...(params || [])]);
  });

program
  .command('ask <question>')
  .description('Ask a single question to your default bot')
  .action(ask);

program
  .command('run <script>')
  .description('Run a markdown script file')
  .action(run);

program
  .command('mcp [action] [params...]')
  .description('Manage MCP servers (list|add|remove|test|enable|disable|templates)')
  .action((action, params) => {
    const mcpCmd = require('../src/commands/mcp');
    mcpCmd([action, ...(params || [])]);
  });

program
  .command('update [action] [params...]')
  .description('Update management (run|status|wizard)')
  .action((action, params) => {
    const updateCmd = require('../src/commands/update');
    updateCmd([action, ...(params || [])]);
  });

program
  .command('migrate')
  .description('Migrate from other CLI tools (openclaw, claude-code, hermes)')
  .option('--from <source>', 'Source CLI (openclaw, claude-code, hermes)', 'openclaw')
  .option('--openclaw-dir <path>', 'OpenClaw directory path (default: ~/.openclaw)')
  .action((options) => {
    const migrateCmd = require('../src/commands/migrate');
    migrateCmd(options);
  });

program
  .command('commands [action] [params...]')
  .description('Manage custom commands (list|create)')
  .action((action, params) => {
    const commandsCmd = require('../src/commands/commands');
    commandsCmd(action, ...(params || []));
  });

program
  .command('cron <action>')
  .option('--name <name>', 'Cron job adı')
  .option('--schedule <schedule>', 'Cron schedule (örnek: "0 9 * * *")')
  .option('--action <action>', 'Aksiyon: whatsapp veya telegram')
  .option('--target <target>', 'Hedef numara veya chat ID')
  .option('--prompt <prompt>', 'AI\'a gönderilecek prompt')
  .description('Cron job yönetimi (add|list|remove|get|edit|enable|disable|runs|run)')
  .action((action, options) => {
    const cronCmd = require('../src/commands/cron');
    cronCmd(action, options);
  });

program
  .command('hooks [action] [params...]')
  .description('Manage hooks (list|info|check|enable|disable|install|update)')
  .action((action, params) => {
    const hooksCmd = require('../src/commands/hooks');
    hooksCmd([action, ...(params || [])]);
  });

program
  .command('sessions [action] [params...]')
  .description('Session management (list|show|cleanup|prune)')
  .action((action, params) => {
    const sessionsCmd = require('../src/commands/sessions');
    sessionsCmd([action, ...(params || [])]);
  });

program
  .command('git <action>')
  .description('Git integration (review|commit|pr|explain)')
  .action((action) => {
    const gitCmd = require('../src/commands/git');
    gitCmd(action);
  });

program
  .command('tasks [action] [params...]')
  .description('Manage background tasks (list|show|cancel|audit|maintenance|flow|summary|notify)')
  .action((action, params) => {
    const tasksCmd = require('../src/commands/tasks');
    tasksCmd([action, ...(params || [])]);
  });

program
  .command('gateway [action]')
  .description('WebSocket gateway (start|stop|status|call|usage-cost|probe|discover|install|uninstall|health|restart|diagnostics|run)')
  .action((action) => {
    if (action === 'stop' || action === 'status') {
      const gatewayServerCmd = require('../src/commands/gateway-server');
      gatewayServerCmd(action);
    } else {
      const args = process.argv.slice(3);
      gateway(...args);
    }
  });

program
  .command('ultrareview [file]')
  .description('Ultra detailed code review')
  .action((file) => {
    const ultrareviewCmd = require('../src/commands/ultrareview');
    ultrareviewCmd(file);
  });

program
  .command('discord <action>')
  .description('Discord integration (connect|disconnect|status)')
  .action((action) => {
    const discordCmd = require('../src/commands/discord');
    discordCmd(action);
  });

program
  .command('slack <action>')
  .description('Slack integration (connect|disconnect|status)')
  .action((action) => {
    const slackCmd = require('../src/commands/slack');
    slackCmd(action);
  });

program
  .command('whatsapp <action> [number]')
  .description('WhatsApp integration (connect|disconnect|status|allow)')
  .action((action, number) => {
    const whatsappCmd = require('../src/commands/whatsapp');
    whatsappCmd(action, number);
  });

program
  .command('telegram <action> [chatId]')
  .description('Telegram integration (connect|disconnect|status|allow)')
  .action((action, chatId) => {
    const telegramCmd = require('../src/commands/telegram');
    telegramCmd(action, chatId);
  });

program
  .command('signal <action>')
  .description('Signal integration (connect|disconnect|status)')
  .action((action) => {
    const signalCmd = require('../src/commands/signal');
    signalCmd(action);
  });

program
  .command('irc <action>')
  .description('IRC integration (connect|disconnect|status)')
  .action((action) => {
    const ircCmd = require('../src/commands/irc');
    ircCmd(action);
  });

program
  .command('mattermost <action>')
  .description('Mattermost integration (connect|disconnect|status)')
  .action((action) => {
    const mattermostCmd = require('../src/commands/mattermost');
    mattermostCmd(action);
  });

program
  .command('imessage <action> [recipient] [message]')
      .description('iMessage integration (connect|disconnect|status|probe|send)')
      .action((action, recipient, message) => {
        const imessageCmd = require('../src/commands/imessage');
        imessageCmd(action, recipient, message);
      });

program
  .command('sms <action>')
  .description('SMS/Twilio integration (connect|disconnect|status)')
  .action((action) => {
    const smsCmd = require('../src/commands/sms');
    smsCmd(action);
  });

program
  .command('webhooks <action>')
  .description('Webhook management (list|gmail)')
  .action((action) => {
    const webhooksCmd = require('../src/commands/webhooks');
    webhooksCmd(process.argv.slice(3));
  });

program
  .command('message [action]')
  .description('Unified cross-channel messaging (send|broadcast|poll|react|reactions|read|edit|delete|search|pin|unpin|pins|permissions|thread|emoji|sticker|role|channel|member|voice|event|timeout|kick|ban|moderation)')
  .action((action) => {
    const messageCmd = require('../src/commands/message');
    const args = process.argv.slice(3);
    messageCmd(args);
  });

program
  .command('dashboard [action]')
  .description('Web Control UI (start|stop|status)')
  .action((action) => {
    const dashboardCmd = require('../src/commands/dashboard');
    dashboardCmd(action);
  });

program
  .command('doctor')
  .description('System diagnostics and health check')
  .option('--fix', 'Automatically fix issues')
  .action((options) => {
    const doctorCmd = require('../src/commands/doctor');
    const args = process.argv.slice(3);
    doctorCmd(args);
  });

program
  .command('channels [action] [params...]')
  .description('Manage connected channels (list|status|add|remove|logs|login|logout|capabilities|resolve)')
  .action((action, params) => {
    const channelsCmd = require('../src/commands/channels');
    channelsCmd([action, ...(params || [])]);
  });

program
  .command('bonjour [action]')
  .description('Network discovery (scan|discover|status) — find NatureCo services on LAN')
  .action((action) => {
    const bonjourCmd = require('../src/commands/bonjour');
    const args = process.argv.slice(3);
    bonjourCmd(args);
  });

program
  .command('policy [action]')
  .description('Workspace policy checks (check|set|list|remove)')
  .action((action) => {
    const policyCmd = require('../src/commands/policy');
    const args = process.argv.slice(3);
    policyCmd(args);
  });

program
  .command('voice [action]')
  .description('Voice configuration (status|providers|set) — manage TTS voice settings')
  .action((action) => {
    const voiceCmd = require('../src/commands/voice');
    const args = process.argv.slice(3);
    voiceCmd(args);
  });

program
  .command('clickclack [action]')
  .description('ClickClack notification channel (status|test|enable|disable|listen|notify)')
  .action((action) => {
    const clickclackCmd = require('../src/commands/clickclack');
    const args = process.argv.slice(3);
    clickclackCmd(args);
  });

program
  .command('admin-rpc [action]')
  .description('Admin HTTP RPC server (status|start|stop|call|methods)')
  .action((action) => {
    const args = process.argv.slice(3);
    adminRpc(args);
  });

program
  .command('oc-path [action]')
  .description('nc:// URI path handler (resolve|list|cat|ls)')
  .action((action) => {
    const args = process.argv.slice(3);
    ocPath(args);
  });

program
  .command('workboard [action]')
  .description('Work board (show|add|move|remove|clear|columns|export|import)')
  .action((action) => {
    const args = process.argv.slice(3);
    workboard(args);
  });

program
  .command('thread-ownership [action]')
  .description('Thread ownership (status|list|assign|release|check|agent)')
  .action((action) => {
    const args = process.argv.slice(3);
    threadOwnership(args);
  });

program
  .command('device-pair [action]')
  .description('Device pairing (list|request|approve|reject|remove|pairing-code|verify)')
  .action((action) => {
    const args = process.argv.slice(3);
    devicePair(args);
  });

program
  .command('open-prose [action]')
  .description('OpenProse skills bundle (list|info)')
  .action((action) => {
    const args = process.argv.slice(3);
    openProse(args);
  });

program
  .command('vydra [action]')
  .description('Vydra media provider (status|configure|test)')
  .action((action) => {
    const args = process.argv.slice(3);
    vydra(args);
  });

program
  .command('models [action] [params...]')
  .description('Manage AI models (list|set|scan|aliases|fallbacks|set-image|image-fallbacks)')
  .allowUnknownOption()
  .action((action, params) => {
    const modelsCmd = require('../src/commands/models');
    const allArgs = process.argv.slice(process.argv.indexOf('models') + 1);
    modelsCmd(allArgs);
  });

program
  .command('audit [action] [params...]')
  .description('Audit log görüntüleyici (today|stats|show|search|files|cleanup|tail)')
  .action((action, params) => {
    audit(action ? [action, ...(params || [])] : ['today']);
  });

program
  .command('cost [action] [params...]')
  .description('Maliyet takibi (today|week|month|all|budget|set|model|prices)')
  .action((action, params) => {
    cost(action ? [action, ...(params || [])] : ['today']);
  });

program
  .command('naturehub [action] [params...]')
  .description('Nature Hub\'a içerik yayınla (post|list|trending|config)')
  .action((action, params) => {
    naturehub(action ? [action, ...(params || [])] : []);
  });

program
  .command('medium [action] [params...]')
  .description('Medium makale yayınla (draft|publish|list)')
  .action((action, params) => {
    medium(action ? [action, ...(params || [])] : []);
  });

program
  .command('seo [action] [params...]')
  .description('SEO analizi (audit|meta|speed)')
  .action((action, params) => {
    seo(action ? [action, ...(params || [])] : []);
  });

program
  .command('xp [action]')
  .description('NatureCo XP/Level sistemi')
  .action((action) => {
    xp(action ? [action] : []);
  });

program
  .command('tools [action] [name]')
  .description('Tool registry (list|enable|disable)')
  .action((action, name) => {
    tools(action ? [action, name].filter(Boolean) : []);
  });

program
  .command('team [action] [params...]')
  .description('Multi-agent orkestrasyon (list|status|spawn|parallel)')
  .action((action, params) => {
    team(action ? [action, ...(params || [])] : []);
  });

program
  .command('repl [options...]')
  .description('İnteraktif REPL — bizim bu konuşmamız gibi sohbet modu')
    .option('--resume [id]', 'Önceki oturumu yükle')
    .action((options) => {
      const resumeOpt = options.resume ? [options.resume === true ? 'last' : options.resume] : [];
      repl(options._args || resumeOpt);
    });

program
  .command('memory [action] [params...]')
  .description('Manage memory (status|list|search|show|clear|index|export|import|semantic|wiki)')
  .action((action, params) => {
    const memoryCmd = require('../src/commands/memory-cmd');
    memoryCmd([action, ...(params || [])]);
  });

program
  .command('logs [action] [params...]')
  .description('View and manage logs (tail|show|search|clear|path)')
  .action((action, params) => {
    const logsCmd = require('../src/commands/logs');
    logsCmd([action, ...(params || [])]);
  });

program
  .command('status [action] [params...]')
  .description('Show system status (run|simple|usage)')
  .action((action, params) => {
    const statusCmd = require('../src/commands/status');
    statusCmd([action, ...(params || [])]);
  });

program
  .command('reset')
  .description('Reset local config/state')
  .option('--scope <scope>', 'Scope: config|memory|sessions|full', 'config')
  .option('--yes, -y', 'Skip confirmation')
  .action(() => {
    const resetModule = require('../src/commands/reset');
    const resetFn = resetModule.reset || resetModule;
    resetFn(process.argv.slice(3));
  });

program
  .command('security [action]')
  .description('Security audit (audit)')
  .option('--fix', 'Auto-fix issues')
  .option('--json', 'JSON output')
  .action((action) => {
    const securityCmd = require('../src/commands/security');
    securityCmd(process.argv.slice(3));
  });

program
  .command('agents [action] [params...]')
  .description('Manage agents/bots (list|set|info|add|bindings|bind|unbind|set-identity)')
  .action((action, params) => {
    const agentsCmd = require('../src/commands/agents');
    agentsCmd([action, ...(params || [])]);
  });

program
  .command('plugins [action] [params...]')
  .description('Manage plugins (list|install|uninstall|enable|disable|info|update|search|doctor|registry)')
  .action((action, params) => {
    const pluginsCmd = require('../src/commands/plugins');
    pluginsCmd([action, ...(params || [])]);
  });

program
  .command('pairing [action] [params...]')
  .description('Manage device pairings (list|approve|reject)')
  .action((action, params) => {
    const pairingCmd = require('../src/commands/pairing');
    pairingCmd([action, ...(params || [])]);
  });

program
  .command('uninstall')
  .description('Uninstall NatureCo CLI data')
  .option('--all', 'Remove all data including config')
  .option('--yes, -y', 'Skip confirmation')
  .option('--dry-run', 'Preview actions without executing')
  .action(() => {
    const uninstallCmd = require('../src/commands/uninstall');
    uninstallCmd(process.argv.slice(3));
  });

// === OpenClaw uyumlu komutlar ===

program
  .command('agent <action> [args...]')
  .description('One-shot agent task (run|abort|tail|logs)')
  .action((action, args) => {
    agent([action, ...(args || [])]);
  });

program
  .command('approvals <action> [text...]')
  .description('Exec approval policy (list|allow|deny|status)')
  .action((action, text) => {
    approvals([action, ...(text || [])]);
  });

program
  .command('backup <action>')
  .description('Backup management (create|list|restore|verify)')
  .action((action) => {
    backup([action]);
  });

program
  .command('capability [action]')
  .description('Query agent capabilities (list|infer)')
  .action((action) => {
    const args = process.argv.slice(3);
    capability(args);
  });

program
  .command('commitments <action> [text...]')
  .description('Manage action commitments (list|add|check|resolve|summary|pending|done)')
  .action((action, text) => {
    commitments([action, ...(text || [])]);
  });

program
  .command('completion <shell>')
  .description('Generate shell completion script (bash|zsh|fish|powershell)')
  .action((shell) => {
    completion(shell);
  });

program
  .command('configure')
  .description('Interactive configuration wizard')
  .action(() => {
    configure(process.argv.slice(3));
  });

program
  .command('crestodian [action]')
  .description('Crestodian repair assistant (repair|analyze|plan)')
  .action((action) => {
    const args = process.argv.slice(3);
    crestodian(args);
  });

program
  .command('daemon <action>')
  .description('Gateway daemon management (status|start|stop|restart)')
  .action((action) => {
    daemon([action, ...process.argv.slice(4)]);
  });

program
  .command('devices [action]')
  .description('Device management (list|pair|unpair|token|regenerate-token|rotate|revoke|clear)')
  .action((action) => {
    const args = process.argv.slice(3);
    devices(args);
  });

program
  .command('directory <action>')
  .description('Directory query (query|search)')
  .action((action) => {
    const args = process.argv.slice(3);
    directory(args);
  });

program
  .command('dns <action>')
  .description('Network DNS discovery (discover|resolve)')
  .action((action) => {
    const args = process.argv.slice(3);
    dns(args);
  });

program
  .command('docs [query...]')
  .description('Documentation search')
  .action((query) => {
    docs(query || []);
  });

program
  .command('exec-policy [action]')
  .description('Exec policy management (show|preset|set)')
  .action((action) => {
    const args = process.argv.slice(3);
    execPolicy(args);
  });

program
  .command('health [action]')
  .description('Service health check')
  .action((action) => {
    const args = process.argv.slice(3);
    health(args);
  });

program
  .command('infer [action]')
  .description('Infer capabilities/models/media (models|media|capabilities|model run|auth|image|audio|tts|video|web|embedding)')
  .action((action) => {
    const args = process.argv.slice(3);
    infer(args);
  });

program
  .command('node <action>')
  .description('Node host management (run|status|install|uninstall|stop|restart)')
  .action((action) => {
    const args = process.argv.slice(3);
    node(args);
  });

program
  .command('nodes [action]')
  .description('Node network management (list|pending|approve|reject|remove|rename|status|describe|invoke|notify|push|canvas|camera|screen|location)')
  .action((action) => {
    const args = process.argv.slice(3);
    nodes(args);
  });

program
  .command('onboard')
  .description('Interactive onboarding wizard')
  .action(() => {
    onboard(process.argv.slice(3));
  });

program
  .command('proxy [action]')
  .description('Debug proxy server (start|stop|status|run|coverage|sessions|query|blob|purge)')
  .action((action) => {
    const args = process.argv.slice(3);
    proxy(args);
  });

program
  .command('qr [action]')
  .description('QR code pairing (show|generate|verify)')
  .action((action) => {
    const args = process.argv.slice(3);
    qr(args);
  });

program
  .command('sandbox <action>')
  .description('Sandbox container management (list|create|destroy)')
  .action((action) => {
    sandbox([action]);
  });

program
  .command('secrets [action]')
  .description('Secret value management (list|set|get|unset|audit|reload|configure|apply)')
  .action((action) => {
    const args = process.argv.slice(3);
    secrets(args);
  });

program
  .command('system <action>')
  .description('System status/heartbeat/presence (status|heartbeat|presence)')
  .action((action) => {
    system([action]);
  });

program
  .command('terminal <action> [text...]')
  .description('Terminal session management (exec|connect|disconnect|list)')
  .action((action, text) => {
    terminal([action, ...(text || [])]);
  });

program
  .command('transcripts [action]')
  .description('Transcript management (list|show|delete)')
  .action((action) => {
    const args = process.argv.slice(3);
    transcripts(args);
  });

program
  .command('wiki [action] [params...]')
  .description('Wiki/knowledge base (status|init|ingest|compile|lint|search|get|apply|doctor|bridge import|unsafe-local import|obsidian)')
  .action((action, params) => {
    wiki([action, ...(params || [])]);
  });

program
  .command('browser [action] [params...]')
  .description('Browser automation (status|start|stop|tabs|open|close|navigate|screenshot|snapshot|click|type|press|resize|hover|drag|select|upload|fill|dialog|wait|evaluate|console|pdf|profiles|focus|reset-profile|create-profile|delete-profile)')
  .action((action, params) => {
    browser([action, ...(params || [])]);
  });

program
  .command('path [action] [params...]')
  .description('nc:// URI path management (resolve|find|set|validate|emit)')
  .action((action, params) => {
    const pathCmd = require('../src/commands/path');
    pathCmd([action, ...(params || [])]);
  });

program
  .command('clawbot [action] [params...]')
  .description('Legacy clawbot namespace (qr)')
  .action((action, params) => {
    const clawbotCmd = require('../src/commands/clawbot');
    clawbotCmd([action, ...(params || [])]);
  });

// === OpenClaw uyumlu alias komutlar ===

program
  .command('acp [file]')
  .description('Alias for code command')
  .action((file) => {
    const codeCmd = require('../src/commands/code');
    codeCmd(file, { dir: process.cwd() });
  });

program
  .command('web-fetch [url]')
  .description('Fetch a URL and convert to markdown')
  .action(async (url) => {
    const webFetch = require('../src/commands/web-fetch');
    await webFetch(url);
  });

program
  .command('help')
  .description('Show help information')
  .action(help);

// Yardım çıktısı için colors
program.configureHelp({
  sortSubcommands: true,
  showGlobalOptions: true,
});

// Global options
program
  .option('--no-splash', 'Splash animasyonunu atla')
  .option('--plain', 'Düz metin (renk ve animasyon yok)')
  .option('--profile <name>', 'Farklı profil kullan (multi-account)')
  .allowUnknownOption(); // kendi custom option'larımız için

// ════════════════════════════════════════════════════════════
// First-run akışı: setup yoksa otomatik wizard'a yönlendir
// ════════════════════════════════════════════════════════════
const path = require('path');
const fs = require('fs');
const os = require('os');
const brand = require('../src/utils/branding');
const tui = require('../src/utils/tui');
tui.init();
const { firstRunScreen } = brand;

const argv = process.argv.slice(2);

// Global option'ları filtrele — bunlar command değil
const GLOBAL_FLAGS = ['--no-splash', '--plain', '--profile'];
const realArgs = argv.filter(a => !GLOBAL_FLAGS.includes(a) && !a.startsWith('--profile='));
const hasCommand = realArgs.length > 0;
const CONFIG_DIR = path.join(os.homedir(), '.natureco');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Yardım/versiyon için asla first-run'a sokma
const skipFirstRun = argv.includes('--help') || argv.includes('-h')
  || argv.includes('--version') || argv.includes('-V')
  || argv[0] === 'help' || argv[0] === 'setup' || argv[0] === 'update'
  || argv[0] === 'doctor' || argv[0] === 'uninstall';

// --no-splash flag'i ile splash atlanabilsin
const noSplash = argv.includes('--no-splash') || process.env.NATURECO_NO_SPLASH;

function needsFirstRun() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return true;
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    return !cfg.setupCompleted;
  } catch {
    return true;
  }
}

async function handleNoArgs() {
  if (!hasCommand) {
    // Splash animasyonu (sadece TTY'de ve --no-splash yoksa)
    if (!noSplash && tui.CAPS.isTTY && !process.env.CI) {
      await tui.splash({
        title: 'NatureCo CLI',
        version: packageJson.version,
        subtitle: 'OpenClaw\'dan daha güvenli, daha hızlı, daha ucuz',
        duration: 1200,
      });
    }

    if (!skipFirstRun && needsFirstRun()) {
      if (tui.CAPS.isTTY && !noSplash) {
        console.log('\n' + tui.C.amber('  ⌥ İlk kurulum hoş geldin! Hızlıca ayarlayalım.\n'));
      } else {
        console.log(firstRunScreen());
      }
      const setup = require('../src/commands/setup');
      await setup(['wizard']);
      console.log('\n');
      const userName = require('os').userInfo().username;
      console.log(tui.welcomeCard({
        version: packageJson.version,
        user: { name: userName },
        status: tui.C.green('✓ Aktif'),
        tips: brand.pickDailyTip(),
      }));
      return;
    }
    // Normal kullanım — welcome card
    const userName = require('os').userInfo().username;
    let loginStatus = 'ok';
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        if (!cfg.providerApiKey && !cfg.apiKey) loginStatus = 'needed';
      } else {
        loginStatus = 'needed';
      }
    } catch { loginStatus = 'unknown'; }
    console.log('\n' + tui.welcomeCard({
      version: packageJson.version,
      user: { name: userName },
      status: loginStatus === 'ok' ? tui.C.green('✓ Aktif') : tui.C.amber('⚠ API key gerekli'),
      tips: brand.pickDailyTip(),
    }));
    return;
  }
  // Global option'ları filtrele (--no-splash, --plain, --profile) ve parse et
  const opts = program.opts();
  if (opts.profile) {
    process.env.NATURECO_PROFILE = opts.profile;
    // TODO: profile dizinini değiştir
  }
  if (opts.plain) {
    process.env.FORCE_COLOR = '0';
    process.env.NATURECO_NO_SPLASH = '1';
  }
  program.parse(process.argv);
}

handleNoArgs();
