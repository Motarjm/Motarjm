alert("Torgman.js LOADED");
// ensure these IDs exist in your HTML
const fileInput = document.getElementById('fileInput');
const uploadArea = document.querySelector('.upload-area');
const translateBtn = document.getElementById('translateBtn');
const statusText = document.getElementById('status');
const downloadLink = document.getElementById('downloadLink');


let selectedFile = null;

// click upload area to open file picker
if (uploadArea) {
  uploadArea.addEventListener('click', () => fileInput.click());
}

// file selected
fileInput.addEventListener('change', (e) => {
  selectedFile = e.target.files[0];
  updateUploadCard();
});

// drag & drop
uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('dragging');
});
uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('dragging');
});
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragging');
  selectedFile = e.dataTransfer.files[0];
  updateUploadCard();
});

function updateUploadCard() {
  const text = uploadArea.querySelector('.upload-text');
  if (selectedFile) text.textContent = `Selected: ${selectedFile.name}`;
  else text.textContent = "Drag & Drop your .txt or .pdf file here or click to select";
}

// translate click
translateBtn.addEventListener('click', async () => {
  if (!selectedFile) { alert('Please select a file first'); return; }

  statusText.textContent = "Translating... Please wait.";
  translateBtn.disabled = true;
  downloadLink.style.display = 'none';

  try {
    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('source_lang', sourceLang);
    formData.append('target_lang', targetLang);


    let endpoint = '';
    if (selectedFile.name.toLowerCase().endsWith('.txt')) {
      endpoint = '/translate/text_file';
    } else if (selectedFile.name.toLowerCase().endsWith('.pdf')) {
      endpoint = '/translate/pdf_file';
    } else {
      throw new Error('Unsupported file type');
    }

    const response = await fetch(endpoint, { method: 'POST', body: formData });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error('Server error: ' + response.status + ' - ' + errText);
    }

    // if txt -> backend returns JSON { translated_text }
    if (endpoint.endsWith('text_file')) {
      const data = await response.json();
      if (!data.translated_text) throw new Error('No translated_text received');
      const blob = new Blob([data.translated_text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      downloadLink.href = url;
      downloadLink.download = 'translated.txt';
      downloadLink.style.display = 'inline-block';
      statusText.textContent = 'Translation complete.';
    } else {
      // pdf -> response is a PDF file stream
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      downloadLink.href = url;
      downloadLink.download = selectedFile.name.replace(/\.pdf$/i, '_translated.pdf');
      downloadLink.style.display = 'inline-block';
      statusText.textContent = 'PDF translation complete.';
    }
  } catch (err) {
    console.error(err);
    statusText.textContent = 'Translation failed: ' + (err.message || 'Unknown error');
  } finally {
    translateBtn.disabled = false;
  }
});

// language state
let sourceLang = "ar";
let targetLang = "en";

console.log("Torgman.js loaded");
/*
window.swapLanguages = function () {
  const src = document.getElementById("sourceLang");
  const tgt = document.getElementById("targetLang");
  const temp = src.value;
  src.value = tgt.value;
  tgt.value = temp;
};

window.translateText = async function () {
  const sourceText = document.getElementById("sourceText").value;
  const sourceLang = document.getElementById("sourceLang").value;
  const targetLang = document.getElementById("targetLang").value;
  const targetText = document.getElementById("targetText");

  if (!sourceText.trim()) {
    alert("Please enter text");
    return;
  }

  const res = await fetch(
    `/translate/text?text=${encodeURIComponent(sourceText)}&source_lang=${sourceLang}&target_lang=${targetLang}`
  );

  const data = await res.json();
  targetText.value = data.translated_text;
};
*/
// ================= TEXT AREA TRANSLATION =================

function swapLanguages() {
  const sourceLang = document.getElementById('sourceLang');
  const targetLang = document.getElementById('targetLang');
  const sourceText = document.getElementById('sourceText');
  const targetText = document.getElementById('targetText');

  const tempLang = sourceLang.value;
  sourceLang.value = targetLang.value;
  targetLang.value = tempLang;

  const tempText = sourceText.value;
  sourceText.value = targetText.value;
  targetText.value = tempText;
}

async function translateText() {
  const sourceText = document.getElementById('sourceText').value;
  const sourceLang = document.getElementById('sourceLang').value;
  const targetLang = document.getElementById('targetLang').value;
  const targetText = document.getElementById('targetText');

  if (!sourceText.trim()) {
    alert('Please enter text to translate');
    return;
  }

  targetText.value = 'Translating...';

  try {
    const response = await fetch('/translate/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: sourceText,
        source_lang: sourceLang,
        target_lang: targetLang
      })
    });

    if (!response.ok) {
      throw new Error('Server error');
    }

    const data = await response.json();
    targetText.value = data.translated_text;
  } catch (err) {
    console.error(err);
    targetText.value = 'Translation failed';
  }
}

