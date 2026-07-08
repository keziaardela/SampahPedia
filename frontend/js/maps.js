async function initMap() {

    const bali = {
        lat: -8.409518,
        lng: 115.188919
    };

    const map = new google.maps.Map(document.getElementById("map"), {
        zoom: 10,
        center: bali
    });

    try {

        const response = await fetch("http://localhost:3000/api/bank-sampah");
        const data = await response.json();

        data.forEach((lokasi) => {

            const marker = new google.maps.Marker({
                position: {
                    lat: parseFloat(lokasi.latitude),
                    lng: parseFloat(lokasi.longitude)
                },
                map: map,
                title: lokasi.nama
            });

            const infoWindow = new google.maps.InfoWindow({
                content: `
                    <h3>${lokasi.nama}</h3>
                    <p>${lokasi.alamat}</p>
                    <p><b>Jam Operasional:</b> ${lokasi.jam_operasional}</p>
                `
            });

            marker.addListener("click", () => {
                infoWindow.open(map, marker);
            });

        });

    } catch (err) {
        console.error(err);
    }
}