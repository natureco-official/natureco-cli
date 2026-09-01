'use strict';

/**
 * reasoning-models — düşünen (reasoning) modellerin istek/yanıt farklılıkları.
 *
 * Düşünen modeller üç noktada normal modellerden ayrılır ve bu araç üçünü de
 * ele almıyordu:
 *
 *  1) BÜTÇE ALANI. OpenAI'ın o-serisi ve gpt-5 ailesi `max_tokens` parametresini
 *     REDDEDER; `max_completion_tokens` bekler. Ayrıca `temperature !== 1`
 *     değerini de reddeder. Bu araç her OpenAI uyumlu isteğe `max_tokens` ve
 *     `temperature: 0.7` koyuyordu, yani bu modellerle HER istek 400 dönüyordu.
 *
 *  2) DÜŞÜNME ÇIKTISI. MiniMax, DeepSeek, Kimi ve Moonshot düşünme metnini
 *     `delta.reasoning_content` alanında akıtır. Akış okuyucusu yalnızca
 *     `delta.content` ve `delta.tool_calls` okuduğu için bu modellerde ekranda
 *     HİÇBİR ŞEY akmıyor, kullanıcı donmuş sanıyor ve tokenlar faturalanıyor.
 *
 *  3) BÜTÇE TOPLAMI. Düşünen modelde `max_tokens` yalnızca görünür çıktıyı
 *     değil, akıl yürütme + çıktı TOPLAMINI sınırlar. Küçük bir bütçe cevabın
 *     tamamını düşünmeye harcatıp boş `content` döndürür. (Bu deponun kendi
 *     geçmişinde ölçülmüş bir hata: 20 tokenlık bir sınıflandırıcı bütçesi
 *     düşünen modelde hiç karar üretmiyordu.)
 *
 * Burada tek bir doğruluk kaynağı tutuluyor; çağıranlar model kimliğini verip
 * hangi alanların geçerli olduğunu soruyor.
 */

/** OpenAI'ın `max_tokens` yerine `max_completion_tokens` istediği modeller. */
const OPENAI_REASONING = /^(?:o[1-9](?:-|$)|gpt-5)/i;

/** Düşünme metnini `reasoning_content` alanında akıtan sağlayıcı aileleri. */
const REASONING_CONTENT_MODELS =
  /(?:minimax|deepseek|kimi|moonshot|glm-z|qwq|qwen[0-9.]*-?(?:thinking|reasoner))/i;

/** Adında düşünme kipi açıkça belirtilen modeller. */
const EXPLICIT_THINKING = /(?:-thinking|-reasoner|:thinking|reasoning)/i;

/** Anthropic'in extended thinking desteklediği aile. */
const ANTHROPIC_THINKING = /^claude-(?:opus|sonnet|fable|mythos)/i;

const ad = (model) => String(model || '');

/** OpenAI uyumlu uçta `max_tokens` yerine `max_completion_tokens` mi gerekiyor? */
function usesMaxCompletionTokens(model) {
  return OPENAI_REASONING.test(ad(model));
}

/** Model `temperature` parametresini reddediyor mu (yalnızca 1 kabul eder)? */
function rejectsTemperature(model) {
  return OPENAI_REASONING.test(ad(model));
}

/** Yanıt akışında `reasoning_content` delta'sı bekleniyor mu? */
function emitsReasoningContent(model) {
  const m = ad(model);
  return REASONING_CONTENT_MODELS.test(m) || EXPLICIT_THINKING.test(m);
}

/** Bu model akıl yürütme tokenı harcıyor mu (bütçe toplamı etkilenir)? */
function isReasoningModel(model) {
  const m = ad(model);
  return OPENAI_REASONING.test(m) || REASONING_CONTENT_MODELS.test(m) || EXPLICIT_THINKING.test(m);
}

/** Anthropic extended thinking uygulanabilir mi? */
function supportsAnthropicThinking(model) {
  return ANTHROPIC_THINKING.test(ad(model));
}

/**
 * Düşünen modeller için asgari çıktı bütçesi.
 *
 * Bütçe akıl yürütme + görünür çıktının TOPLAMI olduğu için, normal modellerde
 * yeterli olan bir değer burada yalnızca düşünmeye gidip boş cevap bırakabilir.
 * İstenen değer bu tabanın altındaysa yükseltilir.
 */
const REASONING_MIN_OUTPUT_TOKENS = 4096;

function normalizeMaxTokens(model, istenen) {
  const d = Number(istenen);
  if (!Number.isFinite(d) || d <= 0) return istenen;
  if (!isReasoningModel(model)) return d;
  return Math.max(d, REASONING_MIN_OUTPUT_TOKENS);
}

/**
 * OpenAI uyumlu istek gövdesini modele göre düzeltir.
 * Gövdeyi yerinde DEĞİŞTİRMEZ, yeni nesne döndürür.
 */
function applyOpenAIReasoningShape(body, model) {
  const out = { ...body };
  if (usesMaxCompletionTokens(model)) {
    if (out.max_tokens !== undefined) {
      out.max_completion_tokens = normalizeMaxTokens(model, out.max_tokens);
      delete out.max_tokens;
    }
    // Bu modeller temperature !== 1 değerini reddeder; alanı hiç göndermemek
    // varsayılanı (1) kullanmak demektir ve en güvenli davranıştır.
    if (rejectsTemperature(model)) delete out.temperature;
  } else if (out.max_tokens !== undefined) {
    out.max_tokens = normalizeMaxTokens(model, out.max_tokens);
  }
  return out;
}

/**
 * Bir akış delta'sından düşünme metnini çıkarır.
 * Sağlayıcılar farklı alan adları kullanıyor; hepsi burada karşılanır.
 */
function extractReasoningDelta(delta) {
  if (!delta || typeof delta !== 'object') return '';
  const aday = delta.reasoning_content ?? delta.reasoning ?? delta.thinking;
  return typeof aday === 'string' ? aday : '';
}

module.exports = {
  usesMaxCompletionTokens,
  rejectsTemperature,
  emitsReasoningContent,
  isReasoningModel,
  supportsAnthropicThinking,
  normalizeMaxTokens,
  applyOpenAIReasoningShape,
  extractReasoningDelta,
  REASONING_MIN_OUTPUT_TOKENS,
};
