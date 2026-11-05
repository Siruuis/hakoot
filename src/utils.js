export function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const slug = s =>
  (s || 'quiz')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'quiz';

export const formatPin = pin => `${pin.slice(0, 3)} ${pin.slice(3)}`;

export const ordinal = n => (n === 1 ? '1er' : `${n}e`);

export const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
