// =============================
// CONFIG & AUTH
// =============================
const API = "http://localhost:3000";

function getAuthHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token && { Authorization: "Bearer " + token })
  };
}

let selectedModuleId = null;

// =============================
// GUARD: ADMIN ONLY
// =============================
async function guardAdmin() {
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.href = "login.html";
    return false;
  }

  try {
    const res = await fetch(API + "/api/me", {
      headers: getAuthHeaders()
    });

    if (!res.ok) {
      localStorage.removeItem("token");
      window.location.href = "login.html";
      return false;
    }

    const me = await res.json();
    if (me.role !== "admin") {
      alert("Akses admin saja!");
      window.location.href = "index.html";
      return false;
    }

    return true;
  } catch (err) {
    console.error("Guard admin error:", err);
    localStorage.removeItem("token");
    window.location.href = "login.html";
    return false;
  }
}

// =============================
// ELEMENTS
// =============================
const modulesTbody = document.getElementById("modulesTbody");
const moduleForm = document.getElementById("moduleForm");
const moduleIdEl = document.getElementById("moduleId");
const moduleTitleEl = document.getElementById("moduleTitle");
const moduleDescEl = document.getElementById("moduleDesc");
const moduleFileEl = document.getElementById("moduleFile");
const btnResetModule = document.getElementById("btnResetModule");

const quizModuleInfo = document.getElementById("quizModuleInfo");
const quizTitle = document.getElementById("quizTitle");
const quizBuilder = document.getElementById("quizBuilder");

const btnGenerateAI = document.getElementById("btnGenerateAI");
const aiQuizStatus = document.getElementById("aiQuizStatus");

const btnSaveQuiz = document.getElementById("btnSaveQuiz");
const btnDeleteQuiz = document.getElementById("btnDeleteQuiz");

const communityReqTbody = document.getElementById("communityReqTbody");
const btnLogout = document.getElementById("btnLogout");
const btnRefresh = document.getElementById("btnRefresh");

// =============================
// DOM READY
// =============================
document.addEventListener("DOMContentLoaded", async () => {
  const ok = await guardAdmin();
  if (!ok) return;

  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      localStorage.removeItem("token");
      window.location.href = "login.html";
    });
  }

  if (btnRefresh) {
    btnRefresh.addEventListener("click", () => {
      loadModules();
      loadCommunityRequests();
    });
  }

  if (moduleForm) {
    moduleForm.addEventListener("submit", submitModuleForm);
  }

  if (btnResetModule) {
    btnResetModule.addEventListener("click", resetModuleForm);
  }

  if (btnSaveQuiz) {
    btnSaveQuiz.addEventListener("click", saveQuiz);
  }

  if (btnDeleteQuiz) {
    btnDeleteQuiz.addEventListener("click", deleteQuiz);
  }

  if (btnGenerateAI) {
    btnGenerateAI.addEventListener("click", generateQuizWithAI);
  }

  loadModules();
  loadCommunityRequests();
});

// =============================
// MODULE LIST
// =============================
async function loadModules() {
  if (!modulesTbody) return;

  try {
    const res = await fetch(API + "/api/admin/modules", {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error("Gagal load modules");

    const modules = await res.json();
    renderModules(modules);
  } catch (err) {
    console.error("loadModules error:", err);
  }
}

function renderModules(modules) {
  modulesTbody.innerHTML = "";

  modules.forEach(m => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>#${m.id}</td>
      <td>${escapeHtml(m.title)}</td>
      <td>${m.file || "-"}</td>
      <td>
        <button data-act="edit" data-id="${m.id}">Edit</button>
        <button data-act="quiz" data-id="${m.id}" data-title="${escapeHtml(m.title)}">Quiz</button>
        <button data-act="delete" data-id="${m.id}">Hapus</button>
      </td>
    `;
    modulesTbody.appendChild(tr);
  });

  modulesTbody.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", async () => {
      const { id, act, title } = btn.dataset;
      if (act === "edit") loadModuleToForm(id);
      if (act === "delete") deleteModule(id);
      if (act === "quiz") selectModuleForQuiz(id, title);
    });
  });
}

// =============================
// MODULE CRUD
// =============================
async function submitModuleForm(e) {
  e.preventDefault();

  if (!moduleTitleEl.value.trim()) {
    alert("Judul modul wajib diisi");
    return;
  }

  const payload = {
    title: moduleTitleEl.value.trim(),
    description: moduleDescEl.value.trim(),
    file: moduleFileEl.value.trim()
  };

  const id = moduleIdEl.value;
  const url = id
    ? `${API}/api/admin/modules/${id}`
    : `${API}/api/admin/modules`;

  const method = id ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    headers: getAuthHeaders(),
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) return alert(data.message || "Gagal simpan modul");

  alert(id ? "Modul diupdate ✅" : "Modul ditambahkan ✅");
  resetModuleForm();
  loadModules();
}

function resetModuleForm() {
  moduleIdEl.value = "";
  moduleTitleEl.value = "";
  moduleDescEl.value = "";
  moduleFileEl.value = "";
}

async function loadModuleToForm(id) {
  const res = await fetch(API + "/api/admin/modules", {
    headers: getAuthHeaders()
  });
  const modules = await res.json();
  const m = modules.find(x => String(x.id) === String(id));
  if (!m) return;

  moduleIdEl.value = m.id;
  moduleTitleEl.value = m.title || "";
  moduleDescEl.value = m.description || "";
  moduleFileEl.value = m.file || "";
}

async function deleteModule(id) {
  if (!confirm("Yakin hapus modul ini?")) return;

  const res = await fetch(`${API}/api/admin/modules/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders()
  });

  if (!res.ok) return alert("Gagal hapus modul");
  alert("Modul dihapus ✅");

  if (String(selectedModuleId) === String(id)) resetQuizPanel();
  loadModules();
}

// =============================
// QUIZ
// =============================
function buildQuizForm() {
  quizBuilder.innerHTML = "";
  for (let i = 1; i <= 3; i++) {
    quizBuilder.innerHTML += `
      <div class="qbox">
        <input class="qText" placeholder="Pertanyaan ${i}">
        ${[1,2,3,4].map(j => `
          <label>
            <input type="radio" name="correct-${i}" value="${j}">
            <input class="optText" placeholder="Opsi ${j}">
          </label>
        `).join("")}
      </div>
    `;
  }
}

function resetQuizPanel() {
  selectedModuleId = null;

  quizModuleInfo.value = "Belum dipilih";
  quizTitle.value = "";
  quizBuilder.innerHTML = "";

  btnSaveQuiz.disabled = true;
  btnDeleteQuiz.disabled = true;

  if (btnGenerateAI) {
    btnGenerateAI.disabled = true;
  }

  if (aiQuizStatus) {
    aiQuizStatus.style.display = "none";
    aiQuizStatus.textContent = "";
  }
}

async function selectModuleForQuiz(id, title) {
  selectedModuleId = id;

  quizModuleInfo.value = `#${id} - ${title}`;

  btnSaveQuiz.disabled = false;
  btnDeleteQuiz.disabled = false;

  if (btnGenerateAI) {
    btnGenerateAI.disabled = false;
  }

  buildQuizForm();

  try {
    const res = await fetch(
      `${API}/api/admin/modules/${id}/quiz`,
      {
        headers: getAuthHeaders()
      }
    );

    if (res.ok) {
      const q = await res.json();

      quizTitle.value =
        q.title || `Quiz ${title}`;

    } else {
      quizTitle.value = `Quiz ${title}`;
    }

  } catch (err) {
    console.error("Load quiz error:", err);
    quizTitle.value = `Quiz ${title}`;
  }
}

async function generateQuizWithAI() {
  if (!selectedModuleId) {
    alert("Pilih modul terlebih dahulu");
    return;
  }

  btnGenerateAI.disabled = true;
  btnGenerateAI.textContent = "⏳ AI sedang membuat soal...";

  if (aiQuizStatus) {
    aiQuizStatus.style.display = "block";
    aiQuizStatus.textContent =
      "AI sedang membaca materi dan membuat 3 soal...";
  }

  try {
    const res = await fetch(
      `${API}/api/admin/modules/${selectedModuleId}/generate-quiz`,
      {
        method: "POST",
        headers: getAuthHeaders()
      }
    );

    const data = await res.json();

    if (!res.ok) {
      throw new Error(
        data.message || "Gagal generate quiz"
      );
    }

    fillQuizFromAI(data);

    if (aiQuizStatus) {
      aiQuizStatus.textContent =
        "Quiz berhasil dibuat oleh AI. Silakan periksa dan edit sebelum disimpan.";
    }

  } catch (err) {
    console.error("Generate AI error:", err);

    alert(err.message || "Gagal generate quiz dengan AI");

    if (aiQuizStatus) {
      aiQuizStatus.textContent =
        "Generate quiz gagal.";
    }

  } finally {
    btnGenerateAI.disabled = false;
    btnGenerateAI.textContent =
      "✨ Generate Quiz dengan AI";
  }
}

function fillQuizFromAI(data) {
  if (data.title) {
    quizTitle.value = data.title;
  }

  if (!Array.isArray(data.questions)) {
    alert("Format quiz dari AI tidak valid");
    return;
  }

  const qBoxes =
    document.querySelectorAll("#quizBuilder .qbox");

  data.questions.slice(0, 3).forEach((q, index) => {
    const box = qBoxes[index];

    if (!box) return;

    // isi pertanyaan
    const qText = box.querySelector(".qText");
    qText.value = q.question || "";

    // isi pilihan jawaban
    const optionInputs =
      box.querySelectorAll(".optText");

    q.options.slice(0, 4).forEach((opt, optIndex) => {
      if (!optionInputs[optIndex]) return;

      optionInputs[optIndex].value =
        opt.text || "";

      if (opt.is_correct) {
        const radio = box.querySelector(
          `input[type="radio"][value="${optIndex + 1}"]`
        );

        if (radio) {
          radio.checked = true;
        }
      }
    });
  });
}

async function saveQuiz() {
  if (!selectedModuleId) return;
  const payload = collectQuizPayload();
  if (!payload) return;

  const res = await fetch(
    `${API}/api/admin/modules/${selectedModuleId}/quiz`,
    {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(payload)
    }
  );

  if (!res.ok) return alert("Gagal simpan quiz");
  alert("Quiz tersimpan ✅");
}

async function deleteQuiz() {
  if (!selectedModuleId) return;
  if (!confirm("Yakin hapus quiz?")) return;

  const res = await fetch(
    `${API}/api/admin/modules/${selectedModuleId}/quiz`,
    {
      method: "DELETE",
      headers: getAuthHeaders()
    }
  );

  if (!res.ok) return alert("Gagal hapus quiz");
  alert("Quiz dihapus ✅");
  buildQuizForm();
}

function collectQuizPayload() {
  const title = quizTitle.value.trim();
  if (!title) {
    alert("Judul quiz wajib diisi");
    return null;
  }

  const qBoxes = document.querySelectorAll("#quizBuilder .qbox");
  const questions = [];

  for (let i = 0; i < qBoxes.length; i++) {
    const box = qBoxes[i];
    const qText = box.querySelector(".qText").value.trim();
    if (!qText) {
      alert(`Pertanyaan ${i + 1} belum diisi`);
      return null;
    }

    const optTexts = box.querySelectorAll(".optText");
    const checked = box.querySelector(`input[type="radio"]:checked`);
    if (!checked) {
      alert(`Pilih 1 jawaban benar di pertanyaan ${i + 1}`);
      return null;
    }

    const options = [];
    optTexts.forEach((opt, idx) => {
      options.push({
        text: opt.value.trim(),
        is_correct: checked.value == idx + 1
      });
    });

    questions.push({
      question: qText,
      options
    });
  }

  return {
    title,
    questions
  };
}

// =============================
// COMMUNITY REQUESTS
// =============================
async function loadCommunityRequests() {
  if (!communityReqTbody) return;

  const res = await fetch(`${API}/api/admin/community/requests`, {
    headers: getAuthHeaders()
  });
  const data = await res.json();

  communityReqTbody.innerHTML = "";

  if (!Array.isArray(data) || data.length === 0) {
    communityReqTbody.innerHTML = `<tr><td colspan="7">Belum ada request</td></tr>`;
    return;
  }

  data.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>#${r.id}</td>
      <td>${r.pengaju}</td>
      <td>${r.email}</td>
      <td>${r.community_name}</td>
      <td>${r.city || "-"}</td>
      <td>${r.status}</td>
      <td>
        ${
          r.status === "pending"
            ? `
              <button class="btn sm primary"
                onclick="approveCommunityRequest(${r.id})">
                Approve
              </button>
              <button class="btn sm danger"
                onclick="rejectCommunityRequest(${r.id})">
                Reject
              </button>
            `
            : r.status === "approved"
              ? `
                <button class="btn sm danger"
                  onclick="revokeCommunityAccount(${r.user_id})">
                  Hapus Community
                </button>
              `
              : `<span class="muted">—</span>`
        }
      </td>
    `;
    communityReqTbody.appendChild(tr);
  });
}

async function approveCommunityRequest(id) {
  if (!confirm("Approve request ini?")) return;
  await fetch(`${API}/api/admin/community/requests/${id}/approve`, {
    method: "PUT",
    headers: getAuthHeaders()
  });
  loadCommunityRequests();
}

async function rejectCommunityRequest(id) {
  if (!confirm("Reject request ini?")) return;
  await fetch(`${API}/api/admin/community/requests/${id}/reject`, {
    method: "PUT",
    headers: getAuthHeaders()
  });
  loadCommunityRequests();
}

// =============================
// REVOKE COMMUNITY (ADMIN)
// =============================
async function revokeCommunityAccount(userId) {
  if (!confirm("Hapus status community dan kembalikan akun ini ke user?")) return;

  try {
    const res = await fetch(
      `${API}/api/admin/community/${userId}/revoke`,
      {
        method: "PUT",
        headers: getAuthHeaders()
      }
    );

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Gagal revoke community");

    alert("Akun community berhasil dikembalikan ke user ✅");
    loadCommunityRequests();

  } catch (err) {
    console.error("REVOKE COMMUNITY ERROR:", err);
    alert(err.message || "Terjadi kesalahan");
  }
}

/* =============================
   ADMIN - JADWAL KEGIATAN
============================= */

const adminEventList = document.getElementById("adminEventList");
const adminEventForm = document.getElementById("adminEventForm");

if (adminEventList && adminEventForm) {
  initAdminEvents();
}

async function initAdminEvents() {
  loadAdminEvents();

  adminEventForm.addEventListener("submit", submitAdminEvent);
  document.getElementById("btnCancelEvent")
    .addEventListener("click", resetAdminEventForm);
}

async function loadAdminEvents() {
  const res = await fetch(`${API_BASE}/api/community/events`);
  const data = await res.json();

  adminEventList.innerHTML = "";

  data.forEach(ev => {
    const div = document.createElement("div");
    div.className = "event-item";

    div.innerHTML = `
      <h3>${ev.title}</h3>
      <p><b>Tanggal:</b> ${ev.event_date}</p>
      <p><b>Lokasi:</b> ${ev.location}</p>
      <p>${ev.description}</p>

      <div class="row">
        <button class="btn ghost" onclick="editAdminEvent(${ev.id})">Edit</button>
        <button class="btn danger" onclick="deleteAdminEvent(${ev.id})">Hapus</button>
      </div>
    `;

    adminEventList.appendChild(div);
  });
}

async function submitAdminEvent(e) {
  e.preventDefault();

  const id = adminEventId.value;
  const payload = {
    title: adminEventTitle.value,
    event_date: adminEventDate.value,
    location: adminEventLocation.value,
    description: adminEventDesc.value,
    image_url: adminEventImage.value,
    whatsapp_url: adminEventWA.value
  };

  const url = id
    ? `${API_BASE}/api/community/events/${id}`
    : `${API_BASE}/api/community/events`;

  const method = id ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + localStorage.getItem("token")
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    alert("Gagal menyimpan jadwal");
    return;
  }

  resetAdminEventForm();
  loadAdminEvents();
}

window.editAdminEvent = async (id) => {
  const res = await fetch(`${API_BASE}/api/community/events`);
  const data = await res.json();
  const ev = data.find(e => e.id === id);

  adminEventId.value = ev.id;
  adminEventTitle.value = ev.title;
  adminEventDate.value = ev.event_date.split("T")[0];
  adminEventLocation.value = ev.location;
  adminEventDesc.value = ev.description;
  adminEventImage.value = ev.image_url || "";
  adminEventWA.value = ev.whatsapp_url || "";

  btnCancelEvent.classList.remove("hidden");
};

window.deleteAdminEvent = async (id) => {
  if (!confirm("Hapus jadwal ini?")) return;

  await fetch(`${API_BASE}/api/community/events/${id}`, {
    method: "DELETE",
    headers: {
      "Authorization": "Bearer " + localStorage.getItem("token")
    }
  });

  loadAdminEvents();
};

function resetAdminEventForm() {
  adminEventForm.reset();
  adminEventId.value = "";
  btnCancelEvent.classList.add("hidden");
}

async function loadAdminEvents() {
  const res = await fetch("http://localhost:3000/api/community/events", {
    headers: {
      Authorization: "Bearer " + localStorage.getItem("token")
    }
  });

  const events = await res.json();
  const tbody = document.getElementById("adminEventsTbody");
  tbody.innerHTML = "";

  events.forEach(ev => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>#${ev.id}</td>
      <td>${ev.title}</td>
      <td>${ev.event_date}</td>
      <td>${ev.location}</td>
      <td>${ev.description}</td>
      <td>
        <button class="btn ghost" onclick="editAdminEvent(${ev.id})">Edit</button>
        <button class="btn danger" onclick="deleteAdminEvent(${ev.id})">Hapus</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// =============================
// UTILS
// =============================
function escapeHtml(str = "") {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

window.editAdminEvent = async (id) => {
  const res = await fetch(`${API}/api/community/events`, {
    headers: {
      Authorization: "Bearer " + localStorage.getItem("token")
    }
  });

  const data = await res.json();
  const ev = data.find(e => e.id === id);
  if (!ev) return alert("Event tidak ditemukan");

  adminEventId.value = ev.id;
  adminEventTitle.value = ev.title;
  adminEventDate.value = ev.event_date.split("T")[0];
  adminEventLocation.value = ev.location;
  adminEventDesc.value = ev.description;
  adminEventImage.value = ev.image_url || "";
  adminEventWA.value = ev.whatsapp_url || "";

  btnCancelEvent.classList.remove("hidden");
};

window.deleteAdminEvent = async (id) => {
  if (!confirm("Hapus jadwal ini?")) return;

  await fetch(`${API}/api/community/events/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: "Bearer " + localStorage.getItem("token")
    }
  });

  loadAdminEvents();
};


document.addEventListener("DOMContentLoaded", () => {
  const newsForm = document.getElementById("newsForm");
  const adminNewsContainer = document.getElementById("adminNewsContainer");

  const titleInput = document.getElementById("newsTitle");
  const descInput = document.getElementById("newsDescription");
  const imageInput = document.getElementById("newsImage");

  // 🔥 INI KUNCINYA (PERSIST)
  let newsData = JSON.parse(localStorage.getItem("newsData")) || [];

  renderNews();

  // ======================
  // SIMPAN BERITA
  // ======================
  newsForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const title = titleInput.value.trim();
    const description = descInput.value.trim();
    const imageFile = imageInput.files[0];

    if (!title || !description || !imageFile) {
      alert("Semua field wajib diisi");
      return;
    }

    // Simpan gambar sebagai URL lokal
    const imageURL = URL.createObjectURL(imageFile);

    newsData.unshift({
      title,
      description,
      image: imageURL,
      createdAt: Date.now()
    });

    // 🔥 SIMPAN KE LOCALSTORAGE
    localStorage.setItem("newsData", JSON.stringify(newsData));

    newsForm.reset();
    renderNews();
  });

  // ======================
  // RENDER BERITA ADMIN
  // ======================
  function renderNews() {
    adminNewsContainer.innerHTML = "";

    if (newsData.length === 0) {
      adminNewsContainer.innerHTML =
        "<p style='text-align:center;color:#777'>Belum ada berita.</p>";
      return;
    }

    newsData.forEach((item, index) => {
      adminNewsContainer.innerHTML += `
        <div class="admin-news-card">
          <img src="${item.image}">
          <div class="admin-news-content">
            <h3>${item.title}</h3>
            <p>${item.description}</p>
            <div class="admin-news-actions">
              <button class="btn-delete" data-index="${index}">Hapus</button>
            </div>
          </div>
        </div>
      `;
    });

    // tombol hapus
    document.querySelectorAll(".btn-delete").forEach(btn => {
      btn.onclick = () => {
        const index = btn.dataset.index;
        if (confirm("Hapus berita ini?")) {
          newsData.splice(index, 1);
          localStorage.setItem("newsData", JSON.stringify(newsData));
          renderNews();
        }
      };
    });
  }
});