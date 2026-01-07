document.addEventListener("DOMContentLoaded", () => {
  const API_BASE = "http://localhost:3000";
  const token = localStorage.getItem("token");

  let currentUser = null;
  let canManageEvent = false;

  /* ================= AUTH ================= */
  async function fetchMe() {
    if (!token) return null;
    try {
      const res = await fetch(`${API_BASE}/api/me`, {
        headers: { Authorization: "Bearer " + token }
      });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }

  /* ================= MODAL KOMUNITAS ================= */
  const btnReq = document.getElementById("btnRequestCommunity");
  const modal = document.getElementById("communityModal");
  const btnClose = document.getElementById("btnCloseModal");
  const formCommunity = document.getElementById("communityForm");

  if (btnReq && modal && btnClose && formCommunity) {
    btnReq.addEventListener("click", () => {
      modal.classList.remove("hidden");
    });

    btnClose.addEventListener("click", () => {
      modal.classList.add("hidden");
    });

    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.classList.add("hidden");
    });

    formCommunity.addEventListener("submit", async (e) => {
      e.preventDefault();

      const payload = {
        community_name: document.getElementById("community_name").value.trim(),
        city: document.getElementById("city").value.trim(),
        description: document.getElementById("description").value.trim(),
        contact: document.getElementById("contact").value.trim()
      };

      try {
        const res = await fetch(`${API_BASE}/api/community/requests`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
          },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) {
          alert(data.message || "Gagal mengirim request");
          return;
        }

        alert("Request komunitas terkirim. Tunggu approval admin.");
        modal.classList.add("hidden");
        formCommunity.reset();
      } catch (err) {
        console.error(err);
        alert("Server error");
      }
    });
  }

  /* ================= UTIL ================= */
  function escapeHtml(str = "") {
    return str.replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m]));
  }

  /* ================= EVENT ================= */
  function renderEvents(events) {
    const container = document.getElementById("eventList");
    if (!Array.isArray(events) || events.length === 0) {
      container.innerHTML = `<div class="empty">Belum ada jadwal kegiatan.</div>`;
      return;
    }

    container.innerHTML = "";
    events.forEach((ev) => {
      const item = document.createElement("div");
      item.className = "event-item";

      const img = ev.image_url
        ? `<img src="${escapeHtml(ev.image_url)}" style="width:100%;max-height:200px;object-fit:cover;border-radius:12px;margin:12px 0;">`
        : "";

      const waBtn = ev.whatsapp_url
        ? `<a class="btn-join" href="${escapeHtml(ev.whatsapp_url)}" target="_blank">Gabung WA</a>`
        : "";

      const actions = canManageEvent
        ? `
          <div class="post-actions">
            <button onclick="editEvent(${ev.id}, '${escapeHtml(ev.title)}', '${ev.event_date}', '${escapeHtml(ev.location)}', \`${escapeHtml(ev.description)}\`, '${escapeHtml(ev.image_url || "")}', '${escapeHtml(ev.whatsapp_url || "")}')">Edit</button>
            <button onclick="deleteEvent(${ev.id})" class="danger">Hapus</button>
          </div>`
        : "";

      item.innerHTML = `
        <h3>${escapeHtml(ev.title)}</h3>
        <p><b>Tanggal:</b> ${escapeHtml(ev.event_date)}</p>
        <p><b>Lokasi:</b> ${escapeHtml(ev.location)}</p>
        ${img}
        <p>${escapeHtml(ev.description)}</p>
        ${waBtn}
        ${actions}
      `;

      container.appendChild(item);
    });
  }

  async function loadEvents() {
    try {
        const res = await fetch(`${API_BASE}/api/community/events`);
        const data = await res.json();

        console.log("DATA EVENT DARI BACKEND:", data);

        renderEvents(data);
    } catch (err) {
        console.error("Gagal load event:", err);
    }
  }

  const eventForm = document.getElementById("eventForm");

  if (eventForm) {
    eventForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const payload = {
        title: eventTitle.value.trim(),
        event_date: eventDate.value,
        location: eventLocation.value.trim(),
        description: eventDesc.value.trim(),
        image_url: eventImage.value.trim(),
        whatsapp_url: eventWA.value.trim()
        };

        console.log("PAYLOAD:", payload);

        const res = await fetch("http://localhost:3000/api/community/events", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + localStorage.getItem("token")
        },
        body: JSON.stringify(payload)
        });

        const data = await res.json();
        console.log("RESPONSE:", data);

        if (!res.ok) {
        alert(data.message || "Gagal simpan jadwal");
        return;
        }

        alert("Jadwal berhasil ditambahkan");
        eventForm.reset();
        loadEvents();
    });
  }

  /* ================= INIT ================= */
  (async function init() {
    const hint = document.getElementById("requestHint");
    const btnReq = document.getElementById("btnRequestCommunity");
    const actions = document.getElementById("communityActions");

    currentUser = await fetchMe();

    const requestCard = document.getElementById("requestCommunityCard");

    if (!currentUser) {
    hint.textContent = "Login dulu untuk mengajukan akun komunitas.";
    btnReq.style.display = "inline-block";
    loadEvents();
    return;
    }

    if (currentUser.role === "community" || currentUser.role === "admin") {
    requestCard?.classList.add("hidden");
    btnReq.style.display = "none";
    } else {
    requestCard?.classList.remove("hidden");
    btnReq.style.display = "inline-block";
    }

    loadEvents();

    try {
      const res = await fetch(`${API_BASE}/api/community/me`, {
        headers: { Authorization: "Bearer " + token }
      });

      if (res.ok) {
        canManageEvent = true;
        actions.classList.remove("hidden");
        btnReq.style.display = "none";
      } else {
        canManageEvent = false;
        btnReq.style.display = "inline-block";
      }
    } catch {}

    loadEvents();
  })();
});

/* =============================
   FORUM KOMUNITAS (DINAMIS)
============================= */
document.addEventListener("DOMContentLoaded", () => {
  const forumList = document.getElementById("forumList");
  const forumForm = document.getElementById("forumForm");
  const forumContent = document.getElementById("forumContent");

  if (!forumList || !forumForm || !forumContent) return;

  const API_BASE = "http://localhost:3000";
  const token = localStorage.getItem("token");

  /* ===== helper waktu ===== */
  function timeAgo(dateString) {
    const diff = Math.floor((new Date() - new Date(dateString)) / 1000);
    if (diff < 60) return "baru saja";
    if (diff < 3600) return Math.floor(diff / 60) + " menit lalu";
    if (diff < 86400) return Math.floor(diff / 3600) + " jam lalu";
    return Math.floor(diff / 86400) + " hari lalu";
  }

  /* ===== render forum ===== */
  function renderForum(data) {
    forumList.innerHTML = "";

    data.forEach(item => {
      const div = document.createElement("div");
      div.className = "comment";

      div.innerHTML = `
        <div class="comment-header">
          <span class="name">${item.name}</span>
          <span class="time">${timeAgo(item.created_at)}</span>
        </div>
        <p>${item.content}</p>
      `;

      forumList.appendChild(div);
    });

    // auto scroll ke komentar terbaru
    forumList.scrollTop = forumList.scrollHeight;
  }

  /* ===== load forum ===== */
  async function loadForum() {
    try {
      const res = await fetch(`${API_BASE}/api/forum`);
      const data = await res.json();
      renderForum(data);
    } catch (err) {
      console.error("Gagal load forum:", err);
    }
  }

  /* ===== submit komentar ===== */
  forumForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const content = forumContent.value.trim();
    if (!content) return;

    console.log("FORUM TOKEN:", localStorage.getItem("token"));

    const token = localStorage.getItem("token");

    if (!token) {
        alert("Silakan login terlebih dahulu untuk mengirim komentar.");
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/api/forum`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ content })
        });

        if (!res.ok) {
        const err = await res.json();
        console.error("FORUM ERROR:", err);
        alert(err.message || "Gagal mengirim komentar");
        return;
        }

        forumContent.value = "";
        loadForum();
    } catch (err) {
        console.error("FETCH ERROR:", err);
        alert("Server error");
    }
  });

  /* ===== init ===== */
  loadForum();
});

// =======================
// GLOBAL FUNCTIONS
// =======================

window.editEvent = function (
  id,
  title,
  date,
  location,
  description,
  image,
  wa
) {
  console.log("EDIT EVENT:", id);

  // contoh: isi form dengan data lama
  document.getElementById("eventTitle").value = title;
  document.getElementById("eventDate").value = date;
  document.getElementById("eventLocation").value = location;
  document.getElementById("eventDesc").value = description;
  document.getElementById("eventImage").value = image;
  document.getElementById("eventWA").value = wa;

  // scroll ke form
  document.getElementById("communityActions")
    ?.scrollIntoView({ behavior: "smooth" });

  // nanti bisa tambahin mode edit (PUT)
};

window.deleteEvent = async function (id) {
  if (!confirm("Yakin mau hapus kegiatan ini?")) return;

  try {
    const res = await fetch(`http://localhost:3000/api/community/events/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer " + localStorage.getItem("token")
      }
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || "Gagal hapus kegiatan");
      return;
    }

    alert("Kegiatan berhasil dihapus");
    location.reload(); // atau loadEvents()
  } catch (err) {
    console.error(err);
    alert("Server error");
  }
};