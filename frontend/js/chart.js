// Jenis Sampah di Bali
new Chart(document.getElementById('chartJenisBali'), {
  type: 'doughnut',
  data: {
    labels: ['Organik', 'Anorganik', 'B3'],
    datasets: [{
      data: [65, 30, 5],
      backgroundColor: ['#4CAF50', '#2196F3', '#FF9800']
    }]
  },
  options: {
    plugins: {
      legend: { position: 'bottom' }
    }
  }
});

// Sampah per Kabupaten
new Chart(document.getElementById('chartKabupatenBali'), {
  type: 'bar',
  data: {
    labels: ['Denpasar', 'Badung', 'Gianyar', 'Tabanan', 'Buleleng', 'Bangli', 'Klungkung', 'Jembrana', 'Karangasem'],
    datasets: [{
      label: 'Ton Sampah per Hari',
      data: [850, 700, 600, 500, 400, 300, 250, 200, 180],
      backgroundColor: '#81C784'
    }]
  },
  options: {
    scales: {
      y: { beginAtZero: true }
    }
  }
});

// Daur Ulang di Bali
new Chart(document.getElementById('chartDaurBali'), {
  type: 'line',
  data: {
    labels: ['2019', '2020', '2021', '2022', '2023', '2024'],
    datasets: [{
      label: 'Persentase Daur Ulang (%)',
      data: [8, 10, 14, 17, 21, 27],
      borderColor: '#66BB6A',
      tension: 0.4,
      fill: false
    }]
  },
  options: {
    scales: {
      y: { beginAtZero: true }
    }
  }
});