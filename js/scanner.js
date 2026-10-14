// Page scanner : lecture du QR Code via la caméra ou un fichier.
// Décodage : détecteur natif du navigateur (BarcodeDetector) si disponible,
// sinon lib/jsQR.js, fiable même sur les QR Codes très denses.
// L'image est lue dans IndexedDB si elle a été enregistrée sur cet appareil,
// sinon l'aperçu contenu dans le QR Code est affiché puis enregistré.

import { getImage, saveImage } from './database.js';
import {
  parsePayload,
  base64UrlToBlob,
  formatDate,
  formatSize,
  showToast,
  registerServiceWorker,
  updateOnlineStatus,
} from './utils.js';

const startBtn = document.getElementById('start-btn');
const stopBtn = document.getElementById('stop-btn');
const scanFileInput = document.getElementById('scan-file');
const message = document.getElementById('scan-message');
const found = document.getElementById('found');
const foundImage = document.getElementById('found-image');
const foundInfo = document.getElementById('found-info');
const foundDownload = document.getElementById('found-download');
const rescanBtn = document.getElementById('rescan-btn');
const reader = document.getElementById('reader');
const video = document.getElementById('video');

const SCAN_INTERVAL = 150; // ms entre deux analyses
const MAX_ANALYSIS_SIDE = 1280; // réduit le coût de jsQR sans perdre les petits modules

const workCanvas = document.createElement('canvas');
const workCtx = workCanvas.getContext('2d', { willReadFrequently: true });

let stream = null;
let scanTimer = null;
let imageUrl = null;
let nativeDetector = null;

async function getNativeDetector() {
  if (nativeDetector !== null) return nativeDetector;
  nativeDetector = false;
  if ('BarcodeDetector' in window) {
    try {
      const formats = await BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) {
        nativeDetector = new BarcodeDetector({ formats: ['qr_code'] });
      }
    } catch (err) {
      console.warn('BarcodeDetector indisponible :', err);
    }
  }
  return nativeDetector;
}

/** Décode un QR Code depuis une vidéo, une image ou un ImageBitmap. Renvoie le texte ou null. */
async function decode(source, width, height, maxSide = MAX_ANALYSIS_SIDE) {
  const detector = await getNativeDetector();
  if (detector) {
    try {
      const codes = await detector.detect(source);
      if (codes.length) return codes[0].rawValue;
    } catch (err) {
      console.warn(err);
    }
  }

  const scale = Math.min(1, maxSide / Math.max(width, height));
  workCanvas.width = Math.round(width * scale);
  workCanvas.height = Math.round(height * scale);
  workCtx.drawImage(source, 0, 0, workCanvas.width, workCanvas.height);
  const { data } = workCtx.getImageData(0, 0, workCanvas.width, workCanvas.height);
  const code = jsQR(data, workCanvas.width, workCanvas.height, { inversionAttempts: 'dontInvert' });
  return code ? code.data : null;
}

function setMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle('error-text', isError);
}

async function startCamera() {
  found.hidden = true;
  setMessage('Démarrage de la caméra…');
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      // Haute résolution : nécessaire pour lire les QR Codes contenant une image.
      video: {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });
  } catch (err) {
    console.error(err);
    setMessage(
      'Impossible d\'accéder à la caméra. Vérifiez les autorisations ' +
        '(HTTPS ou localhost requis).',
      true
    );
    return;
  }

  video.srcObject = stream;
  await video.play();
  reader.hidden = false;
  startBtn.hidden = true;
  stopBtn.hidden = false;
  setMessage('Placez le QR Code dans le cadre, bien à plat et net.');
  scanLoop();
}

async function scanLoop() {
  if (!stream) return;
  if (video.readyState >= video.HAVE_ENOUGH_DATA) {
    const text = await decode(video, video.videoWidth, video.videoHeight);
    if (text) {
      onScanSuccess(text);
      return;
    }
  }
  scanTimer = setTimeout(scanLoop, SCAN_INTERVAL);
}

function stopCamera() {
  clearTimeout(scanTimer);
  if (stream) stream.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
  reader.hidden = true;
  startBtn.hidden = false;
  stopBtn.hidden = true;
}

async function onScanSuccess(decodedText) {
  if (navigator.vibrate) navigator.vibrate(100);
  stopCamera();
  await showImage(parsePayload(decodedText));
}

async function scanFile(file) {
  const bitmap = await createImageBitmap(file);
  try {
    return await decode(bitmap, bitmap.width, bitmap.height, 2048);
  } finally {
    bitmap.close();
  }
}

async function findRecord(payload) {
  const stored = await getImage(payload.id);
  if (stored) return { record: stored, original: true };
  if (!payload.data || !payload.mime) return { record: null };

  // Image inconnue sur cet appareil : on utilise l'aperçu du QR Code et on le conserve.
  const blob = base64UrlToBlob(payload.data, payload.mime);
  const record = {
    id: payload.id,
    name: 'image-scannee.' + (payload.mime === 'image/webp' ? 'webp' : 'jpg'),
    type: payload.mime,
    size: blob.size,
    blob,
    createdAt: Date.now(),
    scanned: true,
  };
  try {
    await saveImage(record);
  } catch (err) {
    console.warn('Aperçu non enregistré :', err);
  }
  return { record, original: false };
}

async function showImage(payload) {
  if (!payload) {
    setMessage('Ce QR Code n\'a pas été généré par cette application.', true);
    return;
  }

  let result;
  try {
    result = await findRecord(payload);
  } catch (err) {
    console.error(err);
    setMessage('Impossible de lire l\'image : ' + err.message, true);
    return;
  }

  const { record, original } = result;
  if (!record) {
    setMessage(
      'Ce QR Code ne contient pas d\'image et elle n\'est pas enregistrée sur cet appareil.',
      true
    );
    return;
  }

  if (imageUrl) URL.revokeObjectURL(imageUrl);
  imageUrl = URL.createObjectURL(record.blob);

  foundImage.src = imageUrl;
  foundImage.alt = record.name;
  foundInfo.textContent = original && !record.scanned
    ? `Image originale · ${record.name} · ${formatSize(record.size)} · ajoutée le ${formatDate(record.createdAt)}`
    : `Aperçu contenu dans le QR Code · ${formatSize(record.size)}`;
  foundDownload.href = imageUrl;
  foundDownload.download = record.name;
  found.hidden = false;
  setMessage('');
  showToast('Image retrouvée !', 'success');
  found.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

startBtn.addEventListener('click', startCamera);
stopBtn.addEventListener('click', stopCamera);

rescanBtn.addEventListener('click', () => {
  found.hidden = true;
  history.replaceState(null, '', 'scanner.html');
  startCamera();
});

scanFileInput.addEventListener('change', async () => {
  const file = scanFileInput.files[0];
  scanFileInput.value = '';
  if (!file) return;

  stopCamera();
  let decodedText = null;
  try {
    decodedText = await scanFile(file);
  } catch (err) {
    console.error(err);
  }
  if (decodedText) {
    await showImage(parsePayload(decodedText));
  } else {
    setMessage('Aucun QR Code détecté dans ce fichier.', true);
  }
});

// Ouverture directe via le lien du QR Code (appareil photo du téléphone).
if (location.hash.length > 1 || location.search) {
  showImage(parsePayload(location.href));
}

registerServiceWorker();
updateOnlineStatus();
