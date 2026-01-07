// Ambil elemen
const menuBtn = document.getElementById('menuBtn');
const sidebar = document.getElementById('sidebar');
const closeBtn = document.getElementById('closeBtn');

// Buka sidebar
menuBtn.addEventListener('click', () => {
  sidebar.classList.add('active');
});

// Tutup sidebar
closeBtn.addEventListener('click', () => {
  sidebar.classList.remove('active');
});

// Tambahkan event ke semua link di navbar & sidebar
document.querySelectorAll('nav a, .sidebar a').forEach(link => {
  link.addEventListener('click', function (e) {
    const target = this.getAttribute('href');

    // Kalau link ke bagian dalam halaman (pakai #)
    if (target.startsWith('#')) {
      e.preventDefault();
      document.querySelector(target)?.scrollIntoView({ behavior: 'smooth' });
    } 
    // Kalau link ke halaman lain, biarkan pindah halaman
    else {
      window.location.href = target;
    }

    // Tutup sidebar setiap kali klik link
    sidebar.classList.remove('active');
  });
});