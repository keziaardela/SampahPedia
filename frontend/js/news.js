document.addEventListener("DOMContentLoaded", () => {
  const newsContainer = document.getElementById("newsContainer");

  // Safety check
  if (!newsContainer) {
    console.error("newsContainer tidak ditemukan di HTML");
    return;
  }

  // Data berita (masih kosong)
  const newsData = [];

  renderNews();

  function renderNews() {
    newsContainer.innerHTML = "";

    // Jika belum ada berita
    if (newsData.length === 0) {
      newsContainer.innerHTML = `
        <div style="
          width:100%;
          text-align:center;
          padding:60px 20px;
          color:#666;
          font-size:1rem;
        ">
          <p>Belum ada berita kegiatan yang ditampilkan.</p>
        </div>
      `;
      return;
    }

    // Kalau nanti sudah ada data
    newsData.forEach(item => {
      const card = document.createElement("div");
      card.className = "news-card";

      card.innerHTML = `
        <img src="${item.image}" alt="${item.title}">
        <h3>${item.title}</h3>
        <p>${item.description}</p>
      `;

      newsContainer.appendChild(card);
    });
  }
});