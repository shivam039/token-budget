import { formatStats, renderMessagesHtml } from './render.js';

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const viewer = document.getElementById('viewer');
const messagesList = document.getElementById('messagesList');
const statsDiv = document.getElementById('stats');

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.style.borderColor = '#6366f1';
});
dropzone.addEventListener('dragleave', () => (dropzone.style.borderColor = '#cbd5e1'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.style.borderColor = '#cbd5e1';
  if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', (e) => {
  if (e.target.files.length) handleFile(e.target.files[0]);
});

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const state = JSON.parse(e.target.result);
      renderState(state);
    } catch (err) {
      alert('Invalid JSON file');
    }
  };
  reader.readAsText(file);
}

function renderState(state) {
  viewer.classList.remove('hidden');
  statsDiv.textContent = formatStats(state);
  messagesList.innerHTML = renderMessagesHtml(state);
}
