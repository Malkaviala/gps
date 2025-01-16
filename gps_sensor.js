// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyD3P4c3HTpBIYkbqe_PRwSndGJfNQIZtDg",
    authDomain: "raspberrygps-36044.firebaseapp.com",
    databaseURL: "https://raspberrygps-36044-default-rtdb.firebaseio.com",
    projectId: "raspberrygps-36044",
    storageBucket: "raspberrygps-36044.appspot.com",
    messagingSenderId: "514392510539",
    appId: "1:514392510539:web:77df43576174b9377a57a7"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Map Variables
let map, marker, path, geocoder;
let currentLat = null;
let currentLng = null;
let locationHistory = [];
const MAX_HISTORY_POINTS = 1000;
let totalDistance = 0;
let maxSpeed = 0;
let movementStartTime = null;
let totalMovementTime = 0;
let lastUpdateTimestamp = null;
const UPDATE_INTERVAL = 15 * 60 * 1000; // 15 minutes

// Initialize Google Maps
function initMap() {
    const defaultCenter = { lat: 0, lng: 0 };
    
    map = new google.maps.Map(document.getElementById('map'), {
        center: defaultCenter,
        zoom: 17,
        mapTypeId: 'hybrid',
        styles: [
            {
                featureType: "poi",
                elementType: "labels",
                stylers: [{ visibility: "off" }]
            }
        ]
    });
    
    marker = new google.maps.Marker({
        position: defaultCenter,
        map: map,
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#3498db",
            fillOpacity: 1,
            strokeColor: "#fff",
            strokeWeight: 2
        }
    });

    geocoder = new google.maps.Geocoder();

    path = new google.maps.Polyline({
        geodesic: true,
        strokeColor: '#3498db',
        strokeOpacity: 1.0,
        strokeWeight: 3,
        map: map
    });
}

// Utility Functions
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3959.87433; // Earth's radius in miles
    const lat1Rad = lat1 * Math.PI / 180;
    const lon1Rad = lon1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    const lon2Rad = lon2 * Math.PI / 180;
    
    const dLat = lat2Rad - lat1Rad;
    const dLon = lon2Rad - lon1Rad;
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1Rad) * Math.cos(lat2Rad) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c;
}

function formatDuration(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    return `${hours}:${mins.toString().padStart(2, '0')}`;
}

function updateAddress(lat, lng) {
    const latlng = { lat: parseFloat(lat), lng: parseFloat(lng) };
    
    geocoder.geocode({ location: latlng }, (results, status) => {
        if (status === 'OK' && results[0]) {
            document.getElementById('current-address').textContent = results[0].formatted_address;
        } else {
            document.getElementById('current-address').textContent = 'Address not available';
            console.error('Geocoding failed:', status);
        }
    });
}

function getDirections() {
    if (currentLat && currentLng) {
        const url = `https://www.google.com/maps/dir/?api=1&destination=${currentLat},${currentLng}`;
        window.open(url, '_blank');
    } else {
        alert('Waiting for GPS location data...');
    }
}

function updateTimers() {
    if (!lastUpdateTimestamp) return;
    
    const now = new Date();
    const timeSinceUpdate = now - lastUpdateTimestamp;
    const nextUpdate = UPDATE_INTERVAL - (timeSinceUpdate % UPDATE_INTERVAL);
    
    // Update "Last Update" timer
    const lastUpdateElement = document.getElementById('last-update');
    const lastUpdateMinutes = Math.floor(timeSinceUpdate / 60000);
    const lastUpdateSeconds = Math.floor((timeSinceUpdate % 60000) / 1000);
    lastUpdateElement.textContent = `${lastUpdateMinutes}m ${lastUpdateSeconds}s ago`;
    
    // Update "Next Update" timer
    const nextUpdateElement = document.getElementById('next-update');
    const nextUpdateMinutes = Math.floor(nextUpdate / 60000);
    const nextUpdateSeconds = Math.floor((nextUpdate % 60000) / 1000);
    nextUpdateElement.textContent = `in ${nextUpdateMinutes}m ${nextUpdateSeconds}s`;
    
    // Add alert if update is late
    if (timeSinceUpdate > UPDATE_INTERVAL) {
        lastUpdateElement.classList.add('alert');
        nextUpdateElement.classList.add('alert');
    } else {
        lastUpdateElement.classList.remove('alert');
        nextUpdateElement.classList.remove('alert');
    }
}

function updateDistanceFromUser(trackerLat, trackerLon) {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const distance = calculateDistance(
                    position.coords.latitude,
                    position.coords.longitude,
                    trackerLat,
                    trackerLon
                );
                document.getElementById('distance-info').textContent = 
                    `Distance: ${distance.toFixed(2)} miles`;
            },
            (error) => {
                console.error('Error getting user location:', error);
                document.getElementById('distance-info').textContent = 
                    'Unable to calculate distance';
            }
        );
    }
}

function updateMapPosition(lat, lng, alt, speed) {
    const position = { lat: Number(lat), lng: Number(lng) };
    
    // Update marker position
    marker.setPosition(position);
    map.panTo(position);

    // Update path
    const pathCoords = path.getPath();
    pathCoords.push(position);
    if (pathCoords.getLength() > MAX_HISTORY_POINTS) {
        pathCoords.removeAt(0);
    }

    // Update location history and statistics
    const locationData = {
        lat: Number(lat),
        lng: Number(lng),
        alt: Number(alt),
        speed: Number(speed),
        timestamp: new Date()
    };

    if (locationHistory.length > 0) {
        const prevLocation = locationHistory[locationHistory.length - 1];
        const movementDistance = calculateDistance(
            prevLocation.lat, prevLocation.lng,
            locationData.lat, locationData.lng
        );
        
        if (movementDistance > 0.0001) {
            totalDistance += movementDistance;
            document.getElementById('total-distance').textContent = 
                `${totalDistance.toFixed(2)} mi`;
            
            if (!movementStartTime) {
                movementStartTime = new Date();
            }
        } else if (movementStartTime) {
            totalMovementTime += (new Date() - movementStartTime) / 60000;
            movementStartTime = null;
            document.getElementById('movement-time').textContent = 
                formatDuration(totalMovementTime);
        }
    }

    // Update speed statistics
    if (locationData.speed > maxSpeed) {
        maxSpeed = locationData.speed;
        document.getElementById('max-speed').textContent = `${maxSpeed.toFixed(1)} mph`;
    }

    if (totalMovementTime > 0) {
        const avgSpeed = totalDistance / (totalMovementTime / 60);
        document.getElementById('avg-speed').textContent = `${avgSpeed.toFixed(1)} mph`;
    }

    locationHistory.push(locationData);
    if (locationHistory.length > MAX_HISTORY_POINTS) {
        locationHistory.shift();
    }
}

// Tab Switching
function switchTab(tab) {
    const tabs = document.querySelectorAll('.tab-button');
    const contents = document.querySelectorAll('.dashboard-content');
    
    tabs.forEach(t => t.classList.remove('active'));
    contents.forEach(c => c.style.display = 'none');
    
    if (tab === 'gps') {
        tabs[0].classList.add('active');
        document.getElementById('gps-content').style.display = 'block';
    } else {
        tabs[1].classList.add('active');
        document.getElementById('env-content').style.display = 'block';
    }
}

// GPS Data Listener
database.ref('/gps_data').on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
        lastUpdateTimestamp = new Date(data.timestamp);
        updateTimers();

        // Update current coordinates
        currentLat = Number(data.lat);
        currentLng = Number(data.lon);

        // Update GPS data display
        document.getElementById('latitude').textContent = currentLat.toFixed(6);
        document.getElementById('longitude').textContent = currentLng.toFixed(6);
        document.getElementById('speed').textContent = `${Number(data.speed).toFixed(1)} mph`;
        document.getElementById('altitude').textContent = `${Number(data.alt).toFixed(1)} m`;

        // Update map and related displays
        updateMapPosition(currentLat, currentLng, data.alt, data.speed);
        updateAddress(currentLat, currentLng);
        updateDistanceFromUser(currentLat, currentLng);

        // Update GPS status
        const timeDiff = (new Date() - lastUpdateTimestamp) / 1000;
        const gpsStatus = document.getElementById('gps-status');
        if (timeDiff < 300) {
            gpsStatus.className = 'status online';
            gpsStatus.textContent = 'GPS Online';
        } else {
            gpsStatus.className = 'status offline';
            gpsStatus.textContent = 'GPS Offline';
        }
    }
});

// Environmental Data Listener
database.ref('/sensor_readings').on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
        const latestKey = Object.keys(data)[0];
        const latestData = data[latestKey];

        // Update temperature displays
        document.getElementById('temp-c').textContent = 
            `${latestData.temperature_c.toFixed(1)}°C`;
        document.getElementById('temp-f').textContent = 
            `${latestData.temperature_f.toFixed(1)}°F`;
        
        // Update humidity
        document.getElementById('humidity').textContent = 
            `${latestData.humidity.toFixed(1)}%`;
        
        // Update CPU temperature
        document.getElementById('cpu-temp-c').textContent = 
            `${latestData.cpu_temp_c.toFixed(1)}°C`;
        document.getElementById('cpu-temp-f').textContent = 
            `${latestData.cpu_temp_f.toFixed(1)}°F`;

        // Update environmental status
        const timestamp = new Date(latestData.timestamp);
        const timeDiff = (new Date() - timestamp) / 1000;
        const envStatus = document.getElementById('env-status');
        
        if (timeDiff < 300) {
            envStatus.className = 'status online';
            envStatus.textContent = 'Sensors Online';
        } else {
            envStatus.className = 'status offline';
            envStatus.textContent = 'Sensors Offline';
        }
    }
});

// Start timer updates
setInterval(updateTimers, 1000);

// Error handling for network requests
window.addEventListener('offline', () => {
    const errorMsg = 'Network connection lost';
    document.getElementById('gps-status').className = 'status offline';
    document.getElementById('gps-status').textContent = errorMsg;
    document.getElementById('env-status').className = 'status offline';
    document.getElementById('env-status').textContent = errorMsg;
});

window.addEventListener('online', () => {
    const successMsg = 'Reconnected - Waiting for data...';
    document.getElementById('gps-status').className = 'status online';
    document.getElementById('gps-status').textContent = successMsg;
    document.getElementById('env-status').className = 'status online';
    document.getElementById('env-status').textContent = successMsg;
});

// Handle Firebase connection state
const connectedRef = firebase.database().ref(".info/connected");
connectedRef.on("value", (snap) => {
    if (snap.val() === true) {
        console.log("Connected to Firebase");
    } else {
        console.log("Disconnected from Firebase");
        document.getElementById('gps-status').className = 'status offline';
        document.getElementById('gps-status').textContent = 'Database Connection Lost';
        document.getElementById('env-status').className = 'status offline';
        document.getElementById('env-status').textContent = 'Database Connection Lost';
    }
});