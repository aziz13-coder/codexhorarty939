// Text cleanup utility for removing duplicate Moon references and parentheticals
export const cleanMoonText = (text) => {
  if (!text || typeof text !== 'string') return text;

  return text
    // Remove duplicate "Moon" references
    .replace(/Void(?: ☽)? Moon:\s*(?:☽\s*)?Moon/gi, 'Void Moon:')
    .replace(/☽ Moon/g, 'Moon')
    .replace(/Moon Moon/g, 'Moon')
    // Remove trailing parentheticals like "(moon)"
    .replace(/\s*\([^)]*moon[^)]*\)\s*$/gi, '')
    // Clean up spacing and punctuation
    .replace(/:\s+makes/g, ': makes')
    .replace(/\s+/g, ' ')
    .trim();
};
