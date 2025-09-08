import React from 'react';

/**
 * Renders reasoning entries as simple rows.
 * @param {Object} bundle - The reasoning bundle.
 * @param {string} bundle.version - Version identifier.
 * @param {Array} bundle.entries - Array of reasoning entries {text, weight}.
 * @returns {JSX.Element[]} Array of JSX rows.
 */
export function renderReasoning({ version, entries }) {
  if (!entries || !Array.isArray(entries)) return [];

  return entries.map((entry, idx) => (
    <div key={idx} className="flex items-center space-x-2 py-1">
      <span className="text-sm flex-1">{entry.text}</span>
      <span
        className={`text-xs font-semibold ${
          entry.weight > 0
            ? 'text-emerald-600'
            : entry.weight < 0
            ? 'text-red-600'
            : 'text-amber-600'
        }`}
      >
        {entry.weight > 0 ? '+' : ''}{entry.weight}
      </span>
    </div>
  ));
}

export default renderReasoning;
