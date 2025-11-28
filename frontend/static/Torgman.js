const fileInput = document.getElementById("fileInput");
const selectFileBtn = document.getElementById("selectFileBtn");
const uploadArea = document.getElementById("uploadArea");
const translateBtn = document.getElementById("translateBtn");
const downloadLink = document.getElementById("downloadLink");
const statusText = document.getElementById("status");

let selectedFile = null;

// Choose File Button
selectFileBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  fileInput.click();
});

// File selected manually
fileInput.addEventListener("change", (e) => {
  selectedFile = e.target.files[0];
  updateUploadCard();
});

// Drag and Drop
uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("dragging");
});

uploadArea.addEventListener("dragleave", () => {
  uploadArea.classList.remove("dragging");
});

uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.classList.remove("dragging");
  selectedFile = e.dataTransfer.files[0];
  updateUploadCard();
});

function updateUploadCard() {
  const text = uploadArea.querySelector(".upload-text");
  if (selectedFile) {
    text.textContent = `Selected: ${selectedFile.name}`;
  } else {
    text.textContent = "Drag & Drop your .txt file here or click below to select";
  }
}

// Connect to FastAPI backend
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
