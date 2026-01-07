document.addEventListener("DOMContentLoaded", async () => {
  const token = localStorage.getItem("token");

  const authButtons = document.getElementById("authButtons");
  const userMenu = document.getElementById("userMenu");
  const userName = document.getElementById("userName");
  const adminLink = document.getElementById("adminLink");
  const userTrigger = document.getElementById("userTrigger");
  const userDropdown = document.getElementById("userDropdown");
  const btnLogout = document.getElementById("btnLogout");

  // kalau halaman tidak punya navbar → skip
  if (!authButtons || !userMenu) return;

  // default
  authButtons.classList.remove("hidden");
  userMenu.classList.add("hidden");

  if (!token) return;

  try {
    const res = await fetch("http://localhost:3000/api/me", {
      headers: { Authorization: "Bearer " + token }
    });

    if (!res.ok) {
      localStorage.removeItem("token");
      return;
    }

    const user = await res.json();

    // tampilkan user menu
    authButtons.classList.add("hidden");
    userMenu.classList.remove("hidden");
    userName.textContent = user.name;

    if (user.role === "admin" && adminLink) {
      adminLink.classList.remove("hidden");
    }

  } catch (err) {
    console.error("Auth UI error:", err);
  }

  // toggle dropdown
  userTrigger?.addEventListener("click", () => {
    userDropdown.classList.toggle("hidden");
  });

  // logout
  btnLogout?.addEventListener("click", () => {
    localStorage.removeItem("token");
    window.location.href = "index.html";
  });
});