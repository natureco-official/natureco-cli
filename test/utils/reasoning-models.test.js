/**
 * Düşünen (reasoning) model desteği.
 *
 * Ölçüldü (1 Eylül 2026): `reasoning_content`, `max_completion_tokens`,
 * `budget_tokens` ve `reasoning_effort` kod tabanında SIFIR dosyada geçiyordu.
 * Sonuçları:
 *
 *  1) OpenAI'ın o-serisi ve gpt-5 ailesi `max_tokens`'ı ve temperature !== 1
 *     değerini reddeder. İkisi de koşulsuz gönderiliyordu → bu modellerle
 *     HER istek 400 dönüyordu.
 *  2) MiniMax/DeepSeek/Kimi/Moonshot düşünme metnini `delta.reasoning_content`
 *     alanında akıtır. Okuyucu yalnızca `delta.content` okuduğu için ekranda
 *     hiçbir şey akmıyor, kullanıcı donmuş sanıyor, tokenlar faturalanıyordu.
 *  3) Düşünen modelde bütçe akıl yürütme + çıktının TOPLAMIDIR; küçük bir
 *     değer cevabın tamamını düşünmeye harcatıp boş `content` bırakır.
 */
const rm = require('../../src/utils/reasoning-models');

describe('OpenAI reasoning modelleri — istek biçimi', () => {
  const reasoningModeller = ['o1', 'o1-mini', 'o3', 'o3-mini', 'o4-mini', 'gpt-5', 'gpt-5.5', 'gpt-5.6-luna'];
  const normalModeller = ['gpt-4o', 'gpt-4-turbo', 'llama-3.3-70b-versatile', 'claude-fable-5', 'gpt-3.5-turbo'];

  test.each(reasoningModeller)('%s max_completion_tokens ister', (m) => {
    expect(rm.usesMaxCompletionTokens(m)).toBe(true);
  });

  test.each(normalModeller)('%s max_tokens kullanmaya devam eder', (m) => {
    expect(rm.usesMaxCompletionTokens(m)).toBe(false);
  });

  test('gövdede max_tokens -> max_completion_tokens dönüşür', () => {
    const out = rm.applyOpenAIReasoningShape(
      { model: 'o3-mini', max_tokens: 8000, temperature: 0.7, messages: [] }, 'o3-mini');
    expect(out.max_tokens).toBeUndefined();
    expect(out.max_completion_tokens).toBe(8000);
  });

  test('reasoning modelinde temperature hiç gönderilmez', () => {
    const out = rm.applyOpenAIReasoningShape(
      { model: 'gpt-5', max_tokens: 8000, temperature: 0.7 }, 'gpt-5');
    expect('temperature' in out).toBe(false);
  });

  test('normal modelde temperature ve max_tokens korunur', () => {
    const out = rm.applyOpenAIReasoningShape(
      { model: 'gpt-4o', max_tokens: 2048, temperature: 0.7 }, 'gpt-4o');
    expect(out.max_tokens).toBe(2048);
    expect(out.temperature).toBe(0.7);
    expect(out.max_completion_tokens).toBeUndefined();
  });

  test('gövde yerinde değiştirilmez', () => {
    const girdi = { model: 'o3', max_tokens: 100, temperature: 0.7 };
    rm.applyOpenAIReasoningShape(girdi, 'o3');
    expect(girdi.max_tokens).toBe(100);
    expect(girdi.temperature).toBe(0.7);
  });
});

describe('bütçe tabanı — düşünme + çıktı toplamı', () => {
  test('düşünen modelde küçük bütçe tabana yükseltilir', () => {
    // 2048 bu deponun eski varsayılanıydı ve düşünen modelde tamamı akıl
    // yürütmeye gidip boş cevap bırakabiliyordu.
    expect(rm.normalizeMaxTokens('minimax-m2', 2048)).toBe(rm.REASONING_MIN_OUTPUT_TOKENS);
    expect(rm.normalizeMaxTokens('o3-mini', 20)).toBe(rm.REASONING_MIN_OUTPUT_TOKENS);
  });

  test('zaten yeterli bütçe düşürülmez', () => {
    expect(rm.normalizeMaxTokens('o3-mini', 16384)).toBe(16384);
  });

  test('normal modelin bütçesine dokunulmaz', () => {
    expect(rm.normalizeMaxTokens('gpt-4o', 2048)).toBe(2048);
    expect(rm.normalizeMaxTokens('claude-fable-5', 100)).toBe(100);
  });

  test('geçersiz değer olduğu gibi geçer', () => {
    expect(rm.normalizeMaxTokens('o3', undefined)).toBeUndefined();
    expect(rm.normalizeMaxTokens('o3', 0)).toBe(0);
  });
});

describe('reasoning_content akış delta’sı', () => {
  const akitanlar = ['minimax-m2', 'MiniMax-M3', 'deepseek-reasoner', 'kimi-k2-thinking', 'moonshot-v1-128k', 'glm-z1', 'qwq-32b'];

  test.each(akitanlar)('%s reasoning_content akıtır', (m) => {
    expect(rm.emitsReasoningContent(m)).toBe(true);
  });

  test('normal model reasoning_content akıtmaz', () => {
    expect(rm.emitsReasoningContent('gpt-4o')).toBe(false);
    expect(rm.emitsReasoningContent('llama-3.3-70b-versatile')).toBe(false);
  });

  test('sağlayıcıların üç farklı alan adı da karşılanır', () => {
    expect(rm.extractReasoningDelta({ reasoning_content: 'düşünüyor' })).toBe('düşünüyor');
    expect(rm.extractReasoningDelta({ reasoning: 'düşünüyor' })).toBe('düşünüyor');
    expect(rm.extractReasoningDelta({ thinking: 'düşünüyor' })).toBe('düşünüyor');
  });

  test('içerik delta’sı düşünme sanılmaz', () => {
    expect(rm.extractReasoningDelta({ content: 'cevap' })).toBe('');
  });

  test('bozuk girdi boş döner', () => {
    expect(rm.extractReasoningDelta(null)).toBe('');
    expect(rm.extractReasoningDelta(undefined)).toBe('');
    expect(rm.extractReasoningDelta({ reasoning_content: 42 })).toBe('');
  });
});

describe('uçtan uca — gerçek istek gövdesi', () => {
  const { buildRequestBody } = require('../../src/utils/api')._internals;
  const msgs = [{ role: 'user', content: 'selam' }];

  test('o-serisi gövdesi max_completion_tokens taşır, max_tokens taşımaz', () => {
    const b = buildRequestBody(msgs, 'o3-mini', { max_tokens: 2048, temperature: 0.7 }, 'openai');
    expect(b.max_tokens).toBeUndefined();
    expect(b.max_completion_tokens).toBe(rm.REASONING_MIN_OUTPUT_TOKENS);
    expect('temperature' in b).toBe(false);
  });

  test('gpt-5 ailesi aynı biçimi alır', () => {
    const b = buildRequestBody(msgs, 'gpt-5', { max_tokens: 2048, temperature: 0.7 }, 'openai');
    expect(b.max_completion_tokens).toBeDefined();
    expect('temperature' in b).toBe(false);
  });

  test('normal OpenAI modeli değişmez', () => {
    const b = buildRequestBody(msgs, 'gpt-4o', { max_tokens: 2048, temperature: 0.7 }, 'openai');
    expect(b.max_tokens).toBe(2048);
    expect(b.temperature).toBe(0.7);
    expect(b.max_completion_tokens).toBeUndefined();
  });

  test('reasoning_content akıtan modelin bütçesi tabana yükselir', () => {
    const b = buildRequestBody(msgs, 'minimax-m2', { max_tokens: 2048, temperature: 0.7 }, 'openai');
    expect(b.max_tokens).toBe(rm.REASONING_MIN_OUTPUT_TOKENS);
    expect(b.temperature).toBe(0.7); // MiniMax temperature'ı reddetmez
  });

  test('anthropic yolu bu dönüşümden etkilenmez', () => {
    const b = buildRequestBody(msgs, 'claude-fable-5', { max_tokens: 2000, temperature: 0.7 }, 'anthropic');
    expect(b.max_tokens).toBe(2000);
    expect(b.temperature).toBe(0.7);
    expect(b.max_completion_tokens).toBeUndefined();
    expect(b.system).toBeTruthy();
  });
});

describe('Anthropic extended thinking', () => {
  test('claude aileleri destekli sayılır', () => {
    expect(rm.supportsAnthropicThinking('claude-fable-5')).toBe(true);
    expect(rm.supportsAnthropicThinking('claude-opus-5')).toBe(true);
    expect(rm.supportsAnthropicThinking('claude-sonnet-5')).toBe(true);
  });

  test('claude olmayan model destekli sayılmaz', () => {
    expect(rm.supportsAnthropicThinking('gpt-5')).toBe(false);
    expect(rm.supportsAnthropicThinking('llama-3.3-70b-versatile')).toBe(false);
  });
});
