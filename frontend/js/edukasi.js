/* =======================
   KONFIGURASI
======================= */
const API = "http://localhost:3000";
const token = localStorage.getItem("token");

/* =======================
   LOGIN CHECK
======================= */
if (!token) {
  window.location.href = "login.html";
}

/* =======================
   ARTIKEL EDUKASI (STATIS)
======================= */
const artikel = {
  jenis: {
    judul: "Mengenal Jenis Sampah",
    isi: `
      <p>Sampah dibagi menjadi:</p>
      <ul>
        <li><b>Organik</b>: sisa makanan, daun</li>
        <li><b>Anorganik</b>: plastik, kaca</li>
        <li><b>B3</b>: baterai, cat</li>
      </ul>
    `
  },
  dampak: {
    judul: "Dampak Sampah",
    isi: `
      <ul>
        <li>Pencemaran lingkungan</li>
        <li>Banjir</li>
        <li>Penyakit</li>
      </ul>
    `
  }
};

window.showArticle = function (key) {
  document.getElementById("modal-body").innerHTML =
    `<h2>${artikel[key].judul}</h2>${artikel[key].isi}`;
  document.getElementById("modal").style.display = "flex";
};

window.closeModal = function () {
  document.getElementById("modal").style.display = "none";
};

/* =======================
   FETCH MODUL (ADMIN)
======================= */
async function loadModules() {
  try {
    const res = await fetch(`${API}/api/modules`, {
      headers: { Authorization: "Bearer " + token }
    });

    if (!res.ok) {
      console.error("Gagal fetch modul:", res.status);
      return;
    }

    const modules = await res.json();
    console.log("MODULES:", modules);

    const container = document.getElementById("modules-container");
    if (!container) {
      console.error("modules-container TIDAK ADA di HTML");
      return;
    }

    container.innerHTML = "";

    if (modules.length === 0) {
      container.innerHTML = "<p>Belum ada modul tersedia.</p>";
      return;
    }

    modules.forEach(mod => {
      const card = document.createElement("div");
      card.className = "module-card";

      card.innerHTML = `
        <h3>${mod.title}</h3>
        <p>${mod.description || "-"}</p>
        <button onclick="openModule(${mod.id}, '${mod.file || ""}')" class="btn-buka">
          Buka Modul
        </button>
      `;

      container.appendChild(card);
    });

  } catch (err) {
    console.error("ERROR loadModules:", err);
  }
}

/* =======================
   BUKA MODUL
======================= */
window.openModule = function (moduleId, file) {
  if (file) {
    window.open(`data/${file}`, "_blank");
  }
  loadQuiz(moduleId);
};

/* =======================
   LOAD QUIZ (BACKEND)
======================= */
async function loadQuiz(moduleId) {
  const res = await fetch(`${API}/api/modules/${moduleId}/quiz`, {
    headers: { Authorization: "Bearer " + token }
  });

  if (!res.ok) {
    alert("Quiz belum tersedia");
    return;
  }

  const quiz = await res.json();
  const box = document.getElementById("quizQuestions");
  document.getElementById("quizTitle").innerText = quiz.title;
  box.innerHTML = "";

  quiz.questions.forEach((q, i) => {
    box.innerHTML += `
      <div class="quiz-question" data-question-id="${q.id}">
        <p>${q.question}</p>
        ${q.options.map(o => `
          <label>
            <input type="radio" name="q${q.id}" value="${o.id}">
            ${o.option_text}
          </label>
        `).join("<br>")}
      </div>
    `;
  });

  document.getElementById("quizModal").dataset.moduleId = moduleId;
  document.getElementById("quizModal").style.display = "flex";
}

/* =======================
   SUBMIT QUIZ
======================= */
document.addEventListener("DOMContentLoaded", () => {
  const quizForm = document.getElementById("quizForm");
  const closeBtn = document.getElementById("closeQuizBtn");

  if (!quizForm || !closeBtn) {
    console.error("quizForm atau closeQuizBtn tidak ditemukan di DOM");
    return;
  }

  quizForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const modal = document.getElementById("quizModal");
    const moduleId = modal.dataset.moduleId;

    if (!moduleId) {
      alert("Module tidak ditemukan");
      return;
    }

    const answers = [];
    const questions = document.querySelectorAll(".quiz-question");

    questions.forEach(q => {
      const questionId = Number(q.dataset.questionId);
      const selected = q.querySelector("input[type=radio]:checked");

      if (selected) {
        answers.push({
          questionId,
          optionId: Number(selected.value)
        });
      }
    });

    if (answers.length < questions.length) {
      alert("Harap jawab semua pertanyaan sebelum submit");
      return;
    }

    const res = await fetch(`${API}/api/modules/${moduleId}/quiz/submit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({ answers })
    });

    if (!res.ok) {
      alert("Gagal submit quiz");
      return;
    }

    const data = await res.json();

    if (data.status === "done") {
      alert(`🎉 Selamat! Skor kamu ${data.score}/${data.total}. Modul selesai.`);
    } else {
      alert(`Skor kamu ${data.score}/${data.total}. Coba ulangi agar lulus.`);
    }

    closeModal();
    await loadProgress();
    await loadModules();
  });

  /* =======================
     CLOSE MODAL
  ======================= */
  function closeModal() {
    const modal = document.getElementById("quizModal");
    modal.style.display = "none";
    modal.dataset.moduleId = "";
  }

  closeBtn.addEventListener("click", closeModal);

  // klik area gelap = tutup
  document.getElementById("quizModal").addEventListener("click", (e) => {
    if (e.target.id === "quizModal") {
      closeModal();
    }
  });

});

/* =======================
   PROGRESS USER
======================= */
async function loadProgress() {
  const res = await fetch(`${API}/api/progress/me`, {
    headers: { Authorization: "Bearer " + token }
  });

  if (!res.ok) return;

  const data = await res.json();

  // === ANGKA MODUL SELESAI ===
  document.getElementById("modul-selesai").innerText = data.done;

  // === PERSENTASE ===
  const percent = data.total === 0
    ? 0
    : Math.round((data.done / data.total) * 100);

  document.getElementById("progress-percent").innerText = percent + "%";

  // === PROGRESS BAR ===
  document.getElementById("progress-fill").style.width = percent + "%";

  // === TEKS BAWAH (FORMAT SESUAI HTML) ===
  document.getElementById("progress-text").innerText =
    `${data.done} dari ${data.total} modul telah diselesaikan`;
}

/* =======================
   INIT
======================= */
document.addEventListener("DOMContentLoaded", () => {
  loadModules();
  loadProgress();
});

/* =======================
   AI CHATBOT
======================= */

const chatSessionId = 'session-' + Date.now();

window.askAI = async function () {
  const questionInput = document.getElementById("question");
  const question = questionInput.value.trim();

  if (!question) return;

  const chatBox = document.getElementById("chatBox");

  // 1. Tampilkan pesan user ke dalam chatBox secara lokal terlebih dahulu
  chatBox.innerHTML += `
    <div class="user-message">
      ${question}
    </div>
  `;
  
  // Kosongkan kolom input teks setelah tombol kirim ditekan
  questionInput.value = "";
  chatBox.scrollTop = chatBox.scrollHeight;

  // 2. Tampilkan indikator loading dari Bot
  const botLoadingId = "bot-loading-" + Date.now();
  chatBox.innerHTML += `
    <div class="bot-message" id="${botLoadingId}">
      ⏳ Menunggu tanggapan asisten...
    </div>
  `;
  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    // 3. Kirim data ke backend dengan menyertakan 'chatSessionId'
    const response = await fetch(`${API}/api/ask-ai`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        question: question,
        sessionId: chatSessionId // 💡 Mengirimkan ID Sesi agar backend bisa membaca riwayat chat dari DB
      })
    });

    const data = await response.json();
    const botLoadingElement = document.getElementById(botLoadingId);

    if (data.success) {
      // Ganti indikator loading dengan jawaban asli dari AI
      botLoadingElement.innerHTML = `🤖 ${data.answer}`;
    } else {
      botLoadingElement.innerText = `❌ Gagal: ${data.message || "Terjadi kesalahan pada AI"}`;
    }
  } catch (error) {
    console.error("Error pada askAI Frontend:", error);
    const botLoadingElement = document.getElementById(botLoadingId);
    if (botLoadingElement) {
      botLoadingElement.innerText = "❌ Hubungan ke server terputus atau server error.";
    }
  } finally {
    // Pastikan chat otomatis bergulir ke posisi paling bawah setelah teks muncul
    chatBox.scrollTop = chatBox.scrollHeight;
  }
};

function setQuestion(text){
  document.getElementById("question").value = text;
}

window.setQuestion = setQuestion;

function setQuestion(text){
    document.getElementById("question").value = text;
}

window.setQuestion = setQuestion;

window.askAI = askAI;

async function uploadCameraImage() {
    const fileInput = document.getElementById('cameraInput');
    const file = fileInput.files[0];
    if (!file) return;

    const questionInput = document.getElementById('question');
    const userQuestion = questionInput.value.trim();
    const chatBox = document.getElementById('chatBox');

    // 1. Buat ID unik untuk pesan user dan loading bot
    const userMsgId = 'msg-' + Date.now();
    const botLoadingId = 'bot-' + Date.now();

    // 2. Gunakan FileReader untuk membaca gambar dan menampilkan preview di Chat
    const reader = new FileReader();
    reader.onload = function(e) {
        // Buat struktur pesan user yang berisi gambar kecil dan teks pertanyaan
        let userMessageHtml = `
            <div style="display: flex; flex-direction: column; gap: 5px; align-items: flex-end;">
                <img src="${e.target.result}" style="max-width: 120px; max-height: 120px; border-radius: 8px; object-fit: cover; border: 1px solid #ddd;" alt="Sampah">
        `;
        
        if (userQuestion) {
            userMessageHtml += `<span style="margin-top: 5px;">💬 <b>Pertanyaan:</b> ${userQuestion}</span>`;
        } else {
            userMessageHtml += `<i style="font-size: 12px; color: #7f8c8d;">🖼️ Mengirim foto sampah...</i>`;
        }
        
        userMessageHtml += `</div>`;

        // Masukkan pesan user ke dalam chatBox
        chatBox.innerHTML += `<div class="user-message" id="${userMsgId}">${userMessageHtml}</div>`;
        
        // Langsung tampilkan animasi loading di bawah pesan user
        chatBox.innerHTML += `
            <div class="bot-message" id="${botLoadingId}">
                ⏳ Gemini sedang menganalisis foto dan pertanyaanmu...
            </div>
        `;
        chatBox.scrollTop = chatBox.scrollHeight;
    };
    
    // Mulai membaca file gambar untuk dijadikan preview URL (Base64)
    reader.readAsDataURL(file);

    // 3. Siapkan FormData untuk dikirim ke backend
    const formData = new FormData();
    formData.append('image', file);
    formData.append('question', userQuestion);
    formData.append('sessionId', String(chatSessionId));

    // Kosongkan input teks segera setelah tombol ditekan
    questionInput.value = "";

    try {
        // 4. Lakukan fetch ke backend (tunggu proses FileReader selesai di latar belakang)
        const response = await fetch('http://localhost:3000/api/scan-sampah', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        const botMessageElement = document.getElementById(botLoadingId);
        
        if (data.success) {
            botMessageElement.innerHTML = `🤖 <b>Tanggapan AI:</b><br>${data.answer}`;
        } else {
            botMessageElement.innerText = `❌ Gagal: ${data.message}`;
        }
    } catch (error) {
        console.error(error);
        const botMessageElement = document.getElementById(botLoadingId);
        if (botMessageElement) {
            botMessageElement.innerText = "❌ Terjadi kesalahan saat menyambung ke server.";
        }
    } finally {
        fileInput.value = "";
        // Pastikan posisi chat otomatis scroll ke paling bawah setelah jawaban muncul
        setTimeout(() => {
            chatBox.scrollTop = chatBox.scrollHeight;
        }, 100);
    }
}