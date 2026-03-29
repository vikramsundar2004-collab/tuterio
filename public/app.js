const STORAGE_KEY = "math-mvp-progress-v2";

const problemEl = document.getElementById("problem");
const tutorOutputEl = document.getElementById("tutorOutput");
const helpBtn = document.getElementById("helpBtn");
const solveBtn = document.getElementById("solveBtn");
const inputStatusEl = document.getElementById("inputStatus");

const imageInputEl = document.getElementById("problemImage");
const imagePreviewEl = document.getElementById("imagePreview");
const clearImageBtn = document.getElementById("clearImage");

const attemptedEl = document.getElementById("attempted");
const solvedEl = document.getElementById("solved");
const stuckEl = document.getElementById("stuck");

const markSolvedBtn = document.getElementById("markSolved");
const markStuckBtn = document.getElementById("markStuck");
const resetBtn = document.getElementById("resetProgress");

const studentNameEl = document.getElementById("studentName");
const parentEmailEl = document.getElementById("parentEmail");
const saveInterestBtn = document.getElementById("saveInterest");
const interestStatusEl = document.getElementById("interestStatus");

let imageDataUrl = "";

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { attempted: 0, solved: 0, stuck: 0 };
    }
    const parsed = JSON.parse(raw);
    return {
      attempted: Number(parsed.attempted) || 0,
      solved: Number(parsed.solved) || 0,
      stuck: Number(parsed.stuck) || 0,
    };
  } catch {
    return { attempted: 0, solved: 0, stuck: 0 };
  }
}

let progress = loadProgress();

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function renderProgress() {
  attemptedEl.textContent = String(progress.attempted);
  solvedEl.textContent = String(progress.solved);
  stuckEl.textContent = String(progress.stuck);
}

function setBusyState(isBusy) {
  helpBtn.disabled = isBusy;
  solveBtn.disabled = isBusy;
  saveInterestBtn.disabled = isBusy;
  clearImageBtn.disabled = isBusy;
  imageInputEl.disabled = isBusy;
}

function updateInputStatus() {
  const hasText = problemEl.value.trim().length > 0;
  const hasImage = Boolean(imageDataUrl);

  if (hasText && hasImage) {
    inputStatusEl.textContent = "Sending text + image to GPT-5.4.";
    return;
  }

  if (hasImage) {
    inputStatusEl.textContent = "Photo attached. Python upscaling will run before solving.";
    return;
  }

  if (hasText) {
    inputStatusEl.textContent = "Text-only mode ready.";
    return;
  }

  inputStatusEl.textContent = "Enter text, attach a photo, or both.";
}

function clearImage() {
  imageDataUrl = "";
  imagePreviewEl.src = "";
  imagePreviewEl.classList.add("hidden");
  imageInputEl.value = "";
  updateInputStatus();
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read selected image."));
    reader.readAsDataURL(file);
  });
}

async function attachImageFile(file, sourceLabel) {
  try {
    imageDataUrl = await fileToDataUrl(file);
    imagePreviewEl.src = imageDataUrl;
    imagePreviewEl.classList.remove("hidden");
    inputStatusEl.textContent = `${sourceLabel} attached. Python upscaling will run before solving.`;
    return true;
  } catch (error) {
    inputStatusEl.textContent = error.message;
    clearImage();
    return false;
  }
}

imageInputEl.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    clearImage();
    return;
  }
  await attachImageFile(file, "Photo");
});

clearImageBtn.addEventListener("click", clearImage);
problemEl.addEventListener("input", updateInputStatus);

problemEl.addEventListener("paste", async (event) => {
  const items = event.clipboardData?.items;
  if (!items) {
    return;
  }

  const imageItem = Array.from(items).find((item) => item.type && item.type.startsWith("image/"));
  if (!imageItem) {
    return;
  }

  event.preventDefault();
  const blob = imageItem.getAsFile();
  if (!blob) {
    inputStatusEl.textContent = "Could not read pasted image.";
    return;
  }
  await attachImageFile(blob, "Pasted image");
});

window.addEventListener("paste", async (event) => {
  if (document.activeElement === problemEl) {
    return;
  }

  const items = event.clipboardData?.items;
  if (!items) {
    return;
  }
  const imageItem = Array.from(items).find((item) => item.type && item.type.startsWith("image/"));
  if (!imageItem) {
    return;
  }

  event.preventDefault();
  const blob = imageItem.getAsFile();
  if (!blob) {
    inputStatusEl.textContent = "Could not read pasted image.";
    return;
  }
  await attachImageFile(blob, "Pasted image");
});

async function askTutor(mode) {
  const problem = problemEl.value.trim();
  if (!problem && !imageDataUrl) {
    tutorOutputEl.textContent = "Please enter a math problem or upload a photo first.";
    return;
  }

  setBusyState(true);
  tutorOutputEl.textContent = "Thinking with GPT-5.4...";

  try {
    const response = await fetch("/api/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, problem, imageDataUrl }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Unknown error");
    }

    tutorOutputEl.textContent = data.message;
    progress.attempted += 1;
    saveProgress();
    renderProgress();
  } catch (error) {
    tutorOutputEl.textContent = `Request failed: ${error.message}`;
  } finally {
    setBusyState(false);
  }
}

helpBtn.addEventListener("click", () => askTutor("help"));
solveBtn.addEventListener("click", () => askTutor("solve"));

markSolvedBtn.addEventListener("click", () => {
  progress.solved += 1;
  saveProgress();
  renderProgress();
});

markStuckBtn.addEventListener("click", () => {
  progress.stuck += 1;
  saveProgress();
  renderProgress();
});

resetBtn.addEventListener("click", () => {
  progress = { attempted: 0, solved: 0, stuck: 0 };
  saveProgress();
  renderProgress();
});

saveInterestBtn.addEventListener("click", async () => {
  const email = parentEmailEl.value.trim();
  const studentName = studentNameEl.value.trim();

  if (!email) {
    interestStatusEl.textContent = "Please enter a parent email first.";
    return;
  }

  interestStatusEl.textContent = "Saving...";

  try {
    const response = await fetch("/api/interest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, studentName }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Could not save");
    }

    interestStatusEl.textContent = "Saved. Parent contact added to MVP updates.";
    parentEmailEl.value = "";
  } catch (error) {
    interestStatusEl.textContent = `Save failed: ${error.message}`;
  }
});

renderProgress();
updateInputStatus();
