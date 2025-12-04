// File upload handling
const fileInput = document.getElementById('fileInput');
//const fileList = document.getElementById('fileList');
const uploadArea = document.querySelector('.upload-area');
const translateBtn = document.getElementById("translateBtn");
const statusText = document.getElementById("status");

//fileInput.addEventListener('change', handleFiles);

let selectedFile = null;

// File selected manually
fileInput.addEventListener("change", (e) => {
  selectedFile = e.target.files[0];
  updateUploadCard();
});

// Drag and drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'var(--terracotta)';
    uploadArea.style.background = 'rgba(193, 80, 46, 0.03)';
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = 'rgba(107, 125, 92, 0.3)';
    uploadArea.style.background = 'linear-gradient(to bottom, transparent 0%, rgba(245, 241, 232, 0.5) 100%)';
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'rgba(107, 125, 92, 0.3)';
    uploadArea.style.background = 'linear-gradient(to bottom, transparent 0%, rgba(245, 241, 232, 0.5) 100%)';
    selectedFile = e.dataTransfer.files[0];
      updateUploadCard();
//    handleFiles({ target: { files: e.dataTransfer.files } });
});


function updateUploadCard() {
  const text = uploadArea.querySelector(".upload-text");
  if (selectedFile) {
    text.textContent = `Selected: ${selectedFile.name}`;
  } else {
    text.textContent = "Drag & Drop your .txt file here or click below to select";
  }
}


function handleFiles(e) {
    const files = Array.from(e.target.files);
    fileList.innerHTML = '';

    files.forEach(file => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-size">${(file.size / 1024).toFixed(2)} كيلوبايت</div>
            </div>
            <span class="file-check">✓</span>
        `;
        fileList.appendChild(fileItem);
    });
}

// Translation functions
function swapLanguages() {
    const sourceLang = document.getElementById('sourceLang');
    const targetLang = document.getElementById('targetLang');
    const sourceText = document.getElementById('sourceText');
    const targetText = document.getElementById('targetText');

    // Swap language selections
    const tempLang = sourceLang.value;
    sourceLang.value = targetLang.value;
    targetLang.value = tempLang;

    // Swap text content
    const tempText = sourceText.value;
    sourceText.value = targetText.value;
    targetText.value = tempText;
}

function translateText() {
    const sourceText = document.getElementById('sourceText').value;
    const targetText = document.getElementById('targetText');

    if (!sourceText.trim()) {
        alert('الرجاء إدخال نص للترجمة');
        return;
    }


    // Simulated translation (in real app, this would call a translation API)
    targetText.value = 'جارٍ الترجمة...';

    setTimeout(() => {
        targetText.value = `[ترجمة تجريبية]\n${sourceText}`;
    }, 1000);
}

translateBtn.addEventListener("click", async () => {
  if (!selectedFile) {
    alert("Please select or drop a file first!");
    return;
  }

  statusText.textContent = "Translating... Please wait.";
  translateBtn.disabled = true;

  try {
    const formData = new FormData();
    formData.append("file", selectedFile);

    if (selectedFile.name.endsWith(".txt")) {
  endpoint = "/translate/text_file";
    } else if (selectedFile.name.endsWith(".pdf")) {
  endpoint = "/translate/pdf_file";
    } else {
  console.error("Unsupported file type");
    }

    const response = await fetch(endpoint, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.translated_text) {
      throw new Error("No translated text received.");
    }

    const blob = new Blob([data.translated_text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);

    downloadLink.href = url;
    downloadLink.download = "translated.txt";
    downloadLink.style.display = "inline-block";

    statusText.textContent = "Translation complete.";
  } catch (error) {
    console.error(error);
    statusText.textContent = "Translation failed. Please try again.";
  } finally {
    translateBtn.disabled = false;
  }
});
