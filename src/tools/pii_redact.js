const PATTERNS = [
  { name: 'email', regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, replacement: '[EMAIL]' },
  { name: 'phone', regex: /\b(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{2,4}\b/g, replacement: '[PHONE]' },
  { name: 'ssn', regex: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN]' },
  { name: 'credit_card', regex: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g, replacement: '[CREDIT_CARD]' },
  { name: 'ip', regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, replacement: '[IP]' },
  { name: 'api_key', regex: /\b(sk[-_][a-zA-Z0-9]{20,}|api[-_]key[-_][a-zA-Z0-9]{16,}|[Aa][Kk][Ii][Aa][-\w]{20,})\b/g, replacement: '[API_KEY]' },
  { name: 'token', regex: /\b(ghp_|gho_|ghu_|ghs_|ghr_)[a-zA-Z0-9]{36,}\b/g, replacement: '[TOKEN]' },
  { name: 'aws_key', regex: /\b(AKIA[0-9A-Z]{16})\b/g, replacement: '[AWS_KEY]' },
];

async function piiRedact(params) {
  const { text, mode = 'mask', preserveTypes } = params;
  if (!text) return { success: false, error: 'text gerekli' };

  const preserve = new Set((preserveTypes || []).map(s => s.toLowerCase()));
  let redacted = text;
  const findings = [];

  for (const pattern of PATTERNS) {
    if (preserve.has(pattern.name)) continue;
    let match;
    pattern.regex.lastIndex = 0;
    while ((match = pattern.regex.exec(redacted)) !== null) {
      findings.push({ type: pattern.name, index: match.index, length: match[0].length });
    }
    if (mode === 'mask') {
      redacted = redacted.replace(pattern.regex, pattern.replacement);
    } else if (mode === 'partial') {
      redacted = redacted.replace(pattern.regex, (m) => m.slice(0, 3) + '*'.repeat(Math.max(0, m.length - 6)) + m.slice(-3));
    }
  }

  return { success: true, redacted, findings: findings.length > 0 ? findings : undefined, totalFindings: findings.length };
}

module.exports = {
  name: 'pii_redact',
  description: 'PII/gizli veri maskeleme: email, telefon, SSN, kredi karti, IP, API key, token, AWS key.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Redakte edilecek metin' },
      mode: { type: 'string', description: 'mask (tamamen gizle) veya partial (ilk/son 3 karakter gorunur)', enum: ['mask', 'partial'] },
      preserveTypes: { type: 'array', description: 'Korunacak PII tipleri (orn: ["email","phone"])', items: { type: 'string' } },
    },
    required: ['text'],
  },
  async execute(params) { return await piiRedact(params); },
};
