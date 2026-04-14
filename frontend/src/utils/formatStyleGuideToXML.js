/**
 * Converts style guide form data to XML format for LLM consumption
 * @param {Object} data - Style guide form data
 * @returns {string} XML-formatted style guide
 */
export const formatStyleGuideToXML = (data) => {
  if (!data || typeof data !== 'object') {
    return '';
  }

  const escapeXML = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const buildElement = (name, value) => {
    if (!value || (Array.isArray(value) && value.length === 0)) {
      return '';
    }
    const escaped = Array.isArray(value) ? value.join(', ') : escapeXML(value);
    return `  <${name}>${escaped}</${name}>\n`;
  };

  let xml = '<style_guide>\n';

  // Tone & Register Section
  if (data.register || data.address || data.emotion || data.toneNotes) {
    xml += '  <tone_and_register>\n';
    xml += buildElement('register', data.register);
    xml += buildElement('address', data.address);
    xml += buildElement('emotion', data.emotion);
    xml += buildElement('notes', data.toneNotes);
    xml += '  </tone_and_register>\n';
  }

  // Target Audience Section
  if (data.expertise || data.ageGroup || data.culturalVariant || data.audienceNotes) {
    xml += '  <target_audience>\n';
    xml += buildElement('expertise_level', data.expertise);
    xml += buildElement('age_group', data.ageGroup);
    xml += buildElement('cultural_variant', data.culturalVariant);
    xml += buildElement('notes', data.audienceNotes);
    xml += '  </target_audience>\n';
  }

  // Sentence Style Section
  if (data.sentenceLen || data.structureFidelity || data.passive || data.styleNotes) {
    xml += '  <sentence_style>\n';
    xml += buildElement('sentence_length', data.sentenceLen);
    xml += buildElement('structure_fidelity', data.structureFidelity);
    xml += buildElement('passive_voice', data.passive);
    xml += buildElement('notes', data.styleNotes);
    xml += '  </sentence_style>\n';
  }

  // Numbers, Dates & Units Section
  if (data.dateFormat || data.decimal || data.units || data.currency || data.numNotes) {
    xml += '  <numbers_dates_units>\n';
    xml += buildElement('date_format', data.dateFormat);
    xml += buildElement('decimal_separator', data.decimal);
    xml += buildElement('units_handling', data.units);
    xml += buildElement('currency_handling', data.currency);
    xml += buildElement('notes', data.numNotes);
    xml += '  </numbers_dates_units>\n';
  }

  // Cultural Adaptation Section
  if (data.adaptation || data.idioms || data.culturalRefs || data.humor || data.culturalNotes) {
    xml += '  <cultural_adaptation>\n';
    xml += buildElement('adaptation_level', data.adaptation);
    xml += buildElement('idiom_handling', data.idioms);
    xml += buildElement('cultural_references', data.culturalRefs);
    xml += buildElement('humor_handling', data.humor);
    xml += buildElement('notes', data.culturalNotes);
    xml += '  </cultural_adaptation>\n';
  }

  // Hard Rules Section
  if (Array.isArray(data.forbidden) && data.forbidden.length > 0) {
    xml += '  <hard_rules>\n';
    xml += buildElement('forbidden_practices', data.forbidden);
    xml += buildElement('notes', data.forbiddenNotes);
    xml += '  </hard_rules>\n';
  }

  xml += '</style_guide>';

  return xml;
};

/**
 * Converts style guide form data to Markdown format for display
 * @param {Object} data - Style guide form data
 * @returns {string} Markdown-formatted style guide
 */
export const formatStyleGuideToMarkdown = (data) => {
  if (!data || typeof data !== 'object') {
    return '';
  }

  let md = '# Translation Style Guide\n\n';

  if (data.register || data.address || data.emotion || data.toneNotes) {
    md += '## Tone & Register\n';
    if (data.register) md += `- **Register:** ${data.register}\n`;
    if (data.address) md += `- **Address:** ${data.address}\n`;
    if (data.emotion) md += `- **Emotion:** ${data.emotion}\n`;
    if (data.toneNotes) md += `- **Notes:** ${data.toneNotes}\n`;
    md += '\n';
  }

  if (data.expertise || data.ageGroup || data.culturalVariant || data.audienceNotes) {
    md += '## Target Audience\n';
    if (data.expertise) md += `- **Expertise Level:** ${data.expertise}\n`;
    if (data.ageGroup) md += `- **Age Group:** ${data.ageGroup}\n`;
    if (data.culturalVariant) md += `- **Cultural Variant:** ${data.culturalVariant}\n`;
    if (data.audienceNotes) md += `- **Notes:** ${data.audienceNotes}\n`;
    md += '\n';
  }

  if (data.sentenceLen || data.structureFidelity || data.passive || data.styleNotes) {
    md += '## Sentence Style & Structure\n';
    if (data.sentenceLen) md += `- **Sentence Length:** ${data.sentenceLen}\n`;
    if (data.structureFidelity) md += `- **Structure Fidelity:** ${data.structureFidelity}\n`;
    if (data.passive) md += `- **Passive Voice:** ${data.passive}\n`;
    if (data.styleNotes) md += `- **Notes:** ${data.styleNotes}\n`;
    md += '\n';
  }

  if (data.dateFormat || data.decimal || data.units || data.currency || data.numNotes) {
    md += '## Numbers, Dates & Units\n';
    if (data.dateFormat) md += `- **Date Format:** ${data.dateFormat}\n`;
    if (data.decimal) md += `- **Decimal Separator:** ${data.decimal}\n`;
    if (data.units) md += `- **Units Handling:** ${data.units}\n`;
    if (data.currency) md += `- **Currency Handling:** ${data.currency}\n`;
    if (data.numNotes) md += `- **Notes:** ${data.numNotes}\n`;
    md += '\n';
  }

  if (data.adaptation || data.idioms || data.culturalRefs || data.humor || data.culturalNotes) {
    md += '## Cultural Adaptation\n';
    if (data.adaptation) md += `- **Adaptation Level:** ${data.adaptation}\n`;
    if (data.idioms) md += `- **Idiom Handling:** ${data.idioms}\n`;
    if (data.culturalRefs) md += `- **Cultural References:** ${data.culturalRefs}\n`;
    if (data.humor) md += `- **Humor Handling:** ${data.humor}\n`;
    if (data.culturalNotes) md += `- **Notes:** ${data.culturalNotes}\n`;
    md += '\n';
  }

  return md.trim();
};

/**
 * Checks if style guide has any data
 * @param {Object} data - Style guide form data
 * @returns {boolean} True if style guide has any non-empty fields
 */
export const hasStyleGuideData = (data) => {
  if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
    return false;
  }

  return Object.entries(data).some(([key, value]) => {
    if (typeof value === 'string' && value.trim()) return true;
    if (Array.isArray(value) && value.length > 0) return true;
    return false;
  });
};
