// Page principale : import, enregistrement, génération et galerie.

import { saveImage, getAllImages, deleteImage } from './database.js';
import { renderQRCode, downloadQRCode } from './qrcode.js';
import {
  generateId,
  buildPayload,
  createThumbnail,
  THUMB_BUDGETS,
  formatSize,
  formatDate,
  sanitizeFilename,
  showToast,
  registerServiceWorker,
  updateOnlineStatus,
  MAX_FILE_SIZE,
} from './utils.js';

const fileInput = document.getElementById('file-input');
const dropzone = document.getElementById('dropzone');
const preview = document.getElementById('preview');
const fileInfo = document.getElementById('file-info');
const saveBtn = document.getElementById('save-btn');
const result = document.getElementById('result');
const qrContainer = document.getElementById('qrcode');
const qrId = document.getElementById('qr-id');
const qrHostWarning = document.getElementById('qr-host-warning');
const qualitySelect = document.getElementById('quality');
const downloadBtn = document.getElementById('download-btn');
const gallery = document.getElementById('gallery');
const empty = document.getElementById('empty');

let selectedFile = null;
let currentRecord = null;
let previewUrl = null;
const galleryUrls = [];

function selectFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Ce fichier n\'est pas une image.', 'error');
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    showToast('Image trop volumineuse (20 Mo maximum).', 'error');
    return;
  }

  selectedFile = file;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  preview.src = previewUrl;
  preview.hidden = false;
  dropzone.classList.add('has-image');
  fileInfo.textContent = `${file.name} — ${formatSize(file.size)}`;
  saveBtn.disabled = false;
}

async function showQRCode(record) {
  // Images enregistrées avant l'ajout de l'aperçu : on le génère maintenant.
  if (!record.thumb) {
    record.thumb = await createThumbnail(record.blob, THUMB_BUDGETS.medium);
    await saveImage(record);
  }

  currentRecord = record;
  const modules = renderQRCode(qrContainer, buildPayload(record.id, record.thumb));
  qrId.textContent =
    `${record.name} · aperçu ${record.thumb.width}×${record.thumb.height} px · ` +
    `QR Code ${modules}×${modules} modules`;
  qrHostWarning.hidden = !['localhost', '127.0.0.1'].includes(location.hostname);
  result.hidden = false;
  result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function handleSave() {
  if (!selectedFile) return;
  saveBtn.disabled = true;

  try {
    const record = {
      id: generateId(),
      name: selectedFile.name,
      type: selectedFile.type,
      size: selectedFile.size,
      blob: selectedFile,
      thumb: await createThumbnail(selectedFile, THUMB_BUDGETS[qualitySelect.value]),
      createdAt: Date.now(),
    };

    await saveImage(record);
    await showQRCode(record);
    showToast('Image enregistrée.', 'success');
    resetForm();
    await renderGallery();
  } catch (err) {
    console.error(err);
    showToast('Erreur lors de l\'enregistrement : ' + err.message, 'error');
    saveBtn.disabled = false;
  }
}

function resetForm() {
  selectedFile = null;
  fileInput.value = '';
  preview.hidden = true;
  preview.removeAttribute('src');
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  dropzone.classList.remove('has-image');
  fileInfo.textContent = '';
  saveBtn.disabled = true;
}

async function renderGallery() {
  galleryUrls.forEach((url) => URL.revokeObjectURL(url));
  galleryUrls.length = 0;
  gallery.innerHTML = '';

  const images = await getAllImages();
  empty.hidden = images.length > 0;

  for (const record of images) {
    const url = URL.createObjectURL(record.blob);
    galleryUrls.push(url);

    const item = document.createElement('li');
    item.className = 'gallery-item';

    const img = document.createElement('img');
    img.src = url;
    img.alt = record.name;

    const meta = document.createElement('div');
    meta.className = 'gallery-meta';
    const name = document.createElement('strong');
    name.textContent = record.name;
    const date = document.createElement('span');
    date.className = 'muted small';
    date.textContent = `${formatDate(record.createdAt)} · ${formatSize(record.size)}`;
    meta.append(name, date);

    const actions = document.createElement('div');
    actions.className = 'gallery-actions';

    const qrBtn = document.createElement('button');
    qrBtn.className = 'btn small';
    qrBtn.textContent = 'QR Code';
    qrBtn.addEventListener('click', () =>
      showQRCode(record).catch((err) => showToast(err.message, 'error'))
    );

    const delBtn = document.createElement('button');
    delBtn.className = 'btn small danger';
    delBtn.textContent = 'Supprimer';
    delBtn.addEventListener('click', async () => {
      if (!confirm(`Supprimer « ${record.name} » ?`)) return;
      await deleteImage(record.id);
      if (currentRecord && currentRecord.id === record.id) {
        result.hidden = true;
        currentRecord = null;
      }
      showToast('Image supprimée.');
      renderGallery();
    });

    actions.append(qrBtn, delBtn);
    item.append(img, meta, actions);
    gallery.appendChild(item);
  }
}

fileInput.addEventListener('change', () => selectFile(fileInput.files[0]));

['dragenter', 'dragover'].forEach((type) =>
  dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragging');
  })
);
['dragleave', 'drop'].forEach((type) =>
  dropzone.addEventListener(type, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragging');
  })
);
dropzone.addEventListener('drop', (e) => selectFile(e.dataTransfer.files[0]));

saveBtn.addEventListener('click', handleSave);

downloadBtn.addEventListener('click', () => {
  if (!currentRecord) return;
  try {
    downloadQRCode(qrContainer, 'qrcode-' + sanitizeFilename(currentRecord.name));
  } catch (err) {
    showToast(err.message, 'error');
  }
});

registerServiceWorker();
updateOnlineStatus();
renderGallery().catch((err) => {
  console.error(err);
  showToast('IndexedDB indisponible : ' + err.message, 'error');
});
