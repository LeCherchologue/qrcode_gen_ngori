// Fonctions utilitaires partagées.

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 Mo

// Un QR Code contient au plus ~2900 octets : l'image y est stockée sous forme
// d'aperçu compressé. Budget = nombre maximal de caractères base64 de l'aperçu.
export const THUMB_BUDGETS = {
  low: 900,
  medium: 1500,
  high: 2300,
};

const MIME_CODES = { w: 'image/webp', j: 'image/jpeg' };

export function generateId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/**
 * Contenu encodé dans le QR Code :
 *   https://<hôte>/scanner.html#<id>.<w|j>.<image en base64url>
 * Le fragment (#) n'est jamais envoyé au serveur : la page du scanner,
 * en cache grâce au Service Worker, affiche l'image même hors ligne.
 */
export function buildPayload(id, thumb) {
  const url = new URL('scanner.html', location.href);
  url.search = '';
  url.hash = thumb ? `${id}.${thumb.code}.${thumb.data}` : id;
  return url.toString();
}

/**
 * Extrait { id, mime, data } d'un contenu scanné.
 * Accepte aussi l'ancien format ...scanner.html?id=<id>.
 */
export function parsePayload(text) {
  if (!text) return null;
  let url;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }

  const legacyId = url.searchParams.get('id');
  if (legacyId) return { id: legacyId, mime: null, data: null };

  const [id, code, data] = url.hash.slice(1).split('.');
  if (!id) return null;
  return { id, mime: MIME_CODES[code] || null, data: data || null };
}

function toBase64Url(base64) {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBlob(data, mime) {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function loadBitmap(blob) {
  if ('createImageBitmap' in window) return createImageBitmap(blob);
  const img = new Image();
  img.src = URL.createObjectURL(blob);
  await img.decode();
  URL.revokeObjectURL(img.src);
  return img;
}

/**
 * Réduit l'image par divisions successives par 2 : chaque étape moyenne les pixels,
 * ce qui donne un aperçu net et bien plus compressible qu'une réduction directe.
 */
function resize(source, width, height) {
  let current = source;
  let w = source.width;
  let h = source.height;

  while (w / 2 >= width && h / 2 >= height) {
    w = Math.round(w / 2);
    h = Math.round(h / 2);
    const step = document.createElement('canvas');
    step.width = w;
    step.height = h;
    const stepCtx = step.getContext('2d');
    stepCtx.imageSmoothingQuality = 'high';
    stepCtx.drawImage(current, 0, 0, w, h);
    current = step;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff'; // fond blanc pour les images transparentes
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(current, 0, 0, width, height);
  return canvas;
}

/**
 * Compresse l'image jusqu'à tenir dans `budget` caractères base64.
 * Renvoie { code, data, width, height } ou lève une erreur.
 */
export async function createThumbnail(blob, budget = THUMB_BUDGETS.medium) {
  const source = await loadBitmap(blob);

  // WebP compresse bien mieux ; repli sur JPEG si le navigateur ne l'encode pas (Safari).
  const probe = document.createElement('canvas');
  probe.width = probe.height = 1;
  const webp = probe.toDataURL('image/webp').startsWith('data:image/webp');
  const mime = webp ? 'image/webp' : 'image/jpeg';
  const code = webp ? 'w' : 'j';

  const sizes = [320, 256, 224, 192, 160, 128, 112, 96, 80, 64, 48, 32, 24];
  const qualities = [0.8, 0.6, 0.45, 0.3, 0.2, 0.1];

  for (const maxSide of sizes) {
    const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
    const canvas = resize(
      source,
      Math.max(1, Math.round(source.width * scale)),
      Math.max(1, Math.round(source.height * scale))
    );

    for (const quality of qualities) {
      const data = toBase64Url(canvas.toDataURL(mime, quality).split(',')[1]);
      if (data.length <= budget) {
        return { code, data, width: canvas.width, height: canvas.height };
      }
    }
  }
  throw new Error('Impossible de compresser l\'image pour le QR Code.');
}

export function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' o';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' Ko';
  return (bytes / (1024 * 1024)).toFixed(1) + ' Mo';
}

export function formatDate(timestamp) {
  return new Date(timestamp).toLocaleString('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

export function sanitizeFilename(name) {
  return name.replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_').slice(0, 50) || 'image';
}

let toastTimer = null;

export function showToast(message, type = 'info') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => {
        console.error('Service Worker non enregistré :', err);
      });
    });
  }
}

export function updateOnlineStatus() {
  const badge = document.getElementById('status');
  if (!badge) return;
  const render = () => {
    badge.textContent = navigator.onLine ? 'En ligne' : 'Hors ligne';
    badge.classList.toggle('offline', !navigator.onLine);
  };
  window.addEventListener('online', render);
  window.addEventListener('offline', render);
  render();
}
