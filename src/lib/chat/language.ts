// Which language is a patient message in? (ADR-0017, QST-LANG-FLOOR: A)
//
// Every safety layer that doesn't use a model is English-only: the fixed triage rules,
// the dose rules, the guard's dose-advice check, decline detection, small talk. So a
// message in another language used to rely on the AI classifier alone. Until
// translation is built (QST-LANG-MODE: A), a non-English message always gets help
// (nurse line and 911) and an "English only" note, and no answer model.
//
// Detection is a cheap heuristic on purpose, and it leans towards "not English": a
// false alarm shows help that wasn't needed, which the triage rules already accept as
// the cheaper mistake. Kay's four languages (Spanish, Chinese in both scripts, Korean)
// are named so the translation step can route them later; anything else is `other`.

export type Lang = 'en' | 'es' | 'zh' | 'ko' | 'other'

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/
const KANA = /[぀-ヿ]/ // Japanese: Han characters alone can't tell it from Chinese
const HAN = /[㐀-䶿一-鿿豈-﫿]/
// Greek, Cyrillic, Armenian, Hebrew, Arabic, the Indic scripts, Thai, Lao, Georgian, Ethiopic
const OTHER_SCRIPT = /[Ͱ-֏֐-ۿݐ-ݿऀ-໿Ⴀ-ჿሀ-፿]/
// Latin letters that Spanish and English don't use (French, Portuguese, German, Vietnamese, …)
const OTHER_LATIN = /[àâãäåçèêëìîïòôõöøùûýÿœæßăđơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/

// Common words only one of the two languages uses. Words both use ("a", "no", "me")
// are left out so they count for neither.
const SPANISH = new Set(
  'de la el que y en los las del al por para con mi mis es está estoy tengo tiene puedo puede qué cómo cuándo dónde azúcar sangre nivel dolor ayuda ayúdeme hola gracias muy hoy ayer pero cuando como si yo usted su sus una unos unas se le lo nada mucho poco tomar comer insulina mareado mareada respirar siento duele médico enfermera'.split(' '),
)
const ENGLISH = new Set(
  'the i is my to and of what can how it in for have has do does should with am are this that sugar eat blood feel help hi hello thanks you your when why is was be take insulin dose low high'.split(' '),
)

export function detectLanguage(message: string): Lang {
  if (HANGUL.test(message)) return 'ko'
  if (KANA.test(message)) return 'other'
  if (HAN.test(message)) return 'zh'
  if (OTHER_SCRIPT.test(message)) return 'other'

  const text = message.toLowerCase()
  const words = text.split(/[^\p{L}']+/u).filter(Boolean)
  const en = words.filter((w) => ENGLISH.has(w)).length
  const es = words.filter((w) => SPANISH.has(w)).length + (/[¿¡]/.test(text) ? 2 : 0) + (/[áéíóúñ]/.test(text) ? 1 : 0)
  if (en === 0 && OTHER_LATIN.test(text)) return 'other'
  // "no puedo respirar", "¿qué puedo comer?", "mareado" → Spanish; "can I eat jalapeños?" → English
  if (es > en && es >= 1 && (en === 0 || es >= 2)) return 'es'
  return 'en'
}

/** The fixed note shown with the help buttons (QST-LANG-FLOOR: A). English until approved
 *  translations exist (ADR-0017: each language's fixed text needs a reader to approve it). */
export const LANGUAGE_NOTE = {
  title: 'This test only works in English',
  text: "I can't read this message yet. If this is an emergency, call 911. To talk to a nurse, call the nurse line.",
}
