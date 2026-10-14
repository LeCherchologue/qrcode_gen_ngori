// Génération et téléchargement des QR Codes (bibliothèque lib/qrcode.min.js).

const TARGET_SIZE = 640;
const QR_MARGIN = 32; // zone blanche autour du code, nécessaire à la lecture

function draw(container, text, size) {
  container.innerHTML = '';
  return new QRCode(container, {
    text,
    width: size,
    height: size,
    colorDark: '#000000',
    colorLight: '#ffffff',
    // Niveau L : capacité maximale, indispensable pour contenir l'image.
    correctLevel: QRCode.CorrectLevel.L,
  });
}

/**
 * Génère le QR Code dans `container` et renvoie le nombre de modules par côté.
 * La taille est un multiple exact du nombre de modules pour des pixels nets.
 */
export function renderQRCode(container, text) {
  const modules = draw(container, text, TARGET_SIZE)._oQRCode.getModuleCount();
  const pixelsPerModule = Math.max(4, Math.ceil(TARGET_SIZE / modules));
  draw(container, text, modules * pixelsPerModule);
  return modules;
}

/** Renvoie un canvas avec marge blanche, prêt à être exporté. */
function withMargin(canvas) {
  const out = document.createElement('canvas');
  out.width = canvas.width + QR_MARGIN * 2;
  out.height = canvas.height + QR_MARGIN * 2;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, QR_MARGIN, QR_MARGIN);
  return out;
}

export function downloadQRCode(container, filename = 'qrcode') {
  const canvas = container.querySelector('canvas');
  if (!canvas) throw new Error('Aucun QR Code à télécharger.');

  const link = document.createElement('a');
  link.download = filename + '.png';
  link.href = withMargin(canvas).toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  link.remove();
}
