import { TRANSLATIONS } from '../locale.js';
import { PROMOTION_TRANSLATIONS } from './promotion.js';
import { UX_TRANSLATIONS } from './ux.js';

export function createTranslator(lang = 'zh') {
  const language = lang === 'en' ? 'en' : 'zh';
  return key => {
    const value = UX_TRANSLATIONS[language][key]
      ?? PROMOTION_TRANSLATIONS[language][key]
      ?? TRANSLATIONS[language][key]
      ?? TRANSLATIONS.zh[key]
      ?? key;
    return key === 'dayShort' && Array.isArray(value) && value.length < 7
      ? [...value, ...(language === 'zh' ? ['週六', '週日'] : ['Sat', 'Sun'])]
      : value;
  };
}
