// World map data from Natural Earth (ne_110m_admin_0_countries.geojson)

class FlightPathVisualizer {
    constructor() {
        this.map = null;
        this.flightData = null;
        this.currentPath = null;
        this.currentMarkers = [];
        this.worldLayer = null;
        
        this.init();
    }

    async init() {
        try {
            // Load flight data
            await this.loadFlightData();
            
            // Initialize map
            this.initMap();
            
            // Load world map
            await this.loadWorldMap();
            
            // Setup UI
            this.setupUI();
            
            // Hide loading overlay
            this.hideLoading();
            
        } catch (error) {
            console.error('Error initializing app:', error);
            this.showError('Failed to load application data');
        }
    }

    async loadFlightData() {
        const response = await fetch('flights.jsonl');
        if (!response.ok) {
            throw new Error('Failed to load flight data');
        }

        // Parse JSONL format (each line is a separate JSON object)
        const text = await response.text();
        const lines = text.trim().split('\n');
        this.flightData = lines.map(line => {
            try {
                return JSON.parse(line);
            } catch (error) {
                console.warn('Failed to parse line:', line);
                return null;
            }
        }).filter(item => item !== null); // Remove any failed parses

        console.log('Flight data loaded:', this.flightData.length, 'destinations');
    }

    initMap() {
        // Initialize map centered on world view
        this.map = L.map('map', {
            center: [20, 0],
            zoom: 2,
            minZoom: 2,
            maxZoom: 10,
            zoomControl: true,
            attributionControl: false
        });

        // Add custom attribution
        L.control.attribution({
            position: 'bottomright',
            prefix: false
        }).addAttribution('Map data © Natural Earth').addTo(this.map);
    }

    async loadWorldMap() {
        try {
            const response = await fetch('data/ne_110m_admin_0_countries.geojson');
            if (!response.ok) {
                throw new Error('Failed to load world map data');
            }
            
            const worldData = await response.json();
            
            this.worldLayer = L.geoJSON(worldData, {
                style: {
                    fillColor: '#3b82f6',
                    fillOpacity: 0.6,
                    color: '#1e40af',
                    weight: 1,
                    opacity: 0.8
                }
            }).addTo(this.map);
            
            console.log('World map loaded successfully');
        } catch (error) {
            console.error('Error loading world map:', error);
            // Fallback to basic tile layer
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(this.map);
        }
    }

    setupUI() {
        this.populateOriginDropdown();
        this.setupEventListeners();
    }

    populateOriginDropdown() {
        const originSelect = document.getElementById('origin-select');
        const origins = new Set();

        // Collect all unique origin cities
        this.flightData.forEach(destination => {
            destination.direct_services.forEach(service => {
                origins.add(`${service.origin_city_name}, ${service.origin_country}`);
            });
        });

        // Sort and populate dropdown
        Array.from(origins).sort().forEach(origin => {
            const option = document.createElement('option');
            option.value = origin;
            option.textContent = origin;
            originSelect.appendChild(option);
        });
    }

    setupEventListeners() {
        const originSelect = document.getElementById('origin-select');
        const destinationSelect = document.getElementById('destination-select');
        const clearBtn = document.getElementById('clear-route');

        originSelect.addEventListener('change', () => {
            this.onOriginChange();
        });

        destinationSelect.addEventListener('change', () => {
            this.onDestinationChange();
        });

        clearBtn.addEventListener('click', () => {
            this.clearRoute();
        });
    }

    onOriginChange() {
        const originSelect = document.getElementById('origin-select');
        const destinationSelect = document.getElementById('destination-select');
        const selectedOrigin = originSelect.value;

        // Clear destination dropdown
        destinationSelect.innerHTML = '<option value="">Select destination city...</option>';
        destinationSelect.disabled = !selectedOrigin;

        if (selectedOrigin) {
            this.populateDestinationDropdown(selectedOrigin);
        }

        this.clearRoute();
    }

    populateDestinationDropdown(selectedOrigin) {
        const destinationSelect = document.getElementById('destination-select');
        const destinations = new Set();

        // Find destinations available from selected origin
        this.flightData.forEach(destination => {
            destination.direct_services.forEach(service => {
                const originKey = `${service.origin_city_name}, ${service.origin_country}`;
                if (originKey === selectedOrigin) {
                    destinations.add(`${destination.destination_city_name}, ${destination.destination_country}`);
                }
            });
        });

        // Sort and populate dropdown
        Array.from(destinations).sort().forEach(dest => {
            const option = document.createElement('option');
            option.value = dest;
            option.textContent = dest;
            destinationSelect.appendChild(option);
        });
    }

    onDestinationChange() {
        const originSelect = document.getElementById('origin-select');
        const destinationSelect = document.getElementById('destination-select');
        const origin = originSelect.value;
        const destination = destinationSelect.value;

        if (origin && destination) {
            this.drawFlightPath(origin, destination);
            document.getElementById('clear-route').disabled = false;
        }
    }

    drawFlightPath(originKey, destinationKey) {
        this.clearRoute();

        // Find flight data
        const flightInfo = this.findFlightInfo(originKey, destinationKey);
        if (!flightInfo) {
            this.showError('Flight route not found');
            return;
        }

        // Parse coordinates
        const originCoords = this.parseCoordinates(flightInfo.origin.origin_airport_coordinates);
        const destCoords = this.parseCoordinates(flightInfo.destination.destination_airport_coordinates);

        // Add markers
        this.addMarker(originCoords, flightInfo.origin.origin_city_name, '🛫', 'origin');
        this.addMarker(destCoords, flightInfo.destination.destination_city_name, '🛬', 'destination');

        // Draw curved path
        this.drawCurvedPath(originCoords, destCoords);

        // Update flight details
        this.updateFlightDetails(flightInfo);

        // Fit map to show route
        const group = new L.featureGroup(this.currentMarkers);
        this.map.fitBounds(group.getBounds().pad(0.1));
    }

    findFlightInfo(originKey, destinationKey) {
        for (const destination of this.flightData) {
            const destKey = `${destination.destination_city_name}, ${destination.destination_country}`;
            if (destKey === destinationKey) {
                for (const service of destination.direct_services) {
                    const serviceOriginKey = `${service.origin_city_name}, ${service.origin_country}`;
                    if (serviceOriginKey === originKey) {
                        return {
                            origin: service,
                            destination: destination
                        };
                    }
                }
            }
        }
        return null;
    }

    parseCoordinates(coordString) {
        const [lat, lng] = coordString.split(',').map(coord => parseFloat(coord.trim()));
        return [lat, lng];
    }

    addMarker(coords, cityName, icon, type) {
        const marker = L.marker(coords, {
            icon: L.divIcon({
                html: `<div class="custom-marker ${type}">
                    <span class="marker-icon">${icon}</span>
                    <span class="marker-label">${cityName}</span>
                </div>`,
                className: 'custom-div-icon',
                iconSize: [120, 40],
                iconAnchor: [60, 40]
            })
        }).addTo(this.map);

        this.currentMarkers.push(marker);
        return marker;
    }

    drawCurvedPath(start, end) {
        // Calculate control point for curve (higher arc for longer distances)
        const midLat = (start[0] + end[0]) / 2;
        const midLng = (start[1] + end[1]) / 2;
        
        // Calculate distance to determine curve height
        const distance = this.calculateDistance(start, end);
        const curveHeight = Math.min(distance * 0.3, 30); // Max 30 degrees offset
        
        const controlPoint = [midLat + curveHeight, midLng];

        // Create curved path using Leaflet.Curve if available, otherwise use polyline
        if (typeof L.curve !== 'undefined') {
            this.currentPath = L.curve([
                'M', start,
                'Q', controlPoint, end
            ], {
                color: '#ffd700',
                weight: 4,
                opacity: 0.8,
                animate: {duration: 2000, iterations: 1}
            }).addTo(this.map);
        } else {
            // Fallback to polyline with multiple points to simulate curve
            const curvePoints = this.generateCurvePoints(start, controlPoint, end, 20);
            this.currentPath = L.polyline(curvePoints, {
                color: '#ffd700',
                weight: 4,
                opacity: 0.8
            }).addTo(this.map);
        }
    }

    generateCurvePoints(start, control, end, numPoints) {
        const points = [];
        for (let i = 0; i <= numPoints; i++) {
            const t = i / numPoints;
            const lat = (1 - t) * (1 - t) * start[0] + 2 * (1 - t) * t * control[0] + t * t * end[0];
            const lng = (1 - t) * (1 - t) * start[1] + 2 * (1 - t) * t * control[1] + t * t * end[1];
            points.push([lat, lng]);
        }
        return points;
    }

    calculateDistance(coord1, coord2) {
        const R = 6371; // Earth's radius in km
        const dLat = (coord2[0] - coord1[0]) * Math.PI / 180;
        const dLon = (coord2[1] - coord1[1]) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(coord1[0] * Math.PI / 180) * Math.cos(coord2[0] * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    updateFlightDetails(flightInfo) {
        const detailsDiv = document.getElementById('flight-details');
        const origin = flightInfo.origin;
        const destination = flightInfo.destination;

        document.getElementById('route-origin').textContent = 
            `${origin.origin_city_name}, ${origin.origin_country} (${origin.origin_airport_iata})`;
        document.getElementById('route-destination').textContent = 
            `${destination.destination_city_name}, ${destination.destination_country} (${destination.destination_airport_iata})`;
        document.getElementById('route-duration').textContent = 
            `${Math.floor(origin.flight_duration_minutes / 60)}h ${origin.flight_duration_minutes % 60}m`;
        
        const airlines = origin.airlines.map(airline => airline.airline_name).join(', ');
        document.getElementById('route-airlines').textContent = airlines;

        detailsDiv.style.display = 'block';
    }

    clearRoute() {
        // Remove current path
        if (this.currentPath) {
            this.map.removeLayer(this.currentPath);
            this.currentPath = null;
        }

        // Remove markers
        this.currentMarkers.forEach(marker => {
            this.map.removeLayer(marker);
        });
        this.currentMarkers = [];

        // Hide flight details
        document.getElementById('flight-details').style.display = 'none';
        document.getElementById('clear-route').disabled = true;

        // Reset map view
        this.map.setView([20, 0], 2);
    }

    hideLoading() {
        const loadingOverlay = document.querySelector('.map-overlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'none';
        }
    }

    showError(message) {
        console.error(message);

        // Create a toast notification
        const toast = document.createElement('div');
        toast.className = 'error-toast';
        toast.innerHTML = `
            <span class="error-icon">⚠️</span>
            <span class="error-message">${message}</span>
        `;

        document.body.appendChild(toast);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 5000);
    }
}

// Add custom marker styles
const style = document.createElement('style');
style.textContent = `
    .custom-div-icon {
        background: none !important;
        border: none !important;
    }
    
    .custom-marker {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
    }
    
    .marker-icon {
        font-size: 24px;
        margin-bottom: 4px;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
    }
    
    .marker-label {
        background: rgba(255,255,255,0.95);
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 600;
        color: #333;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        border: 1px solid rgba(0,0,0,0.1);
    }
    
    .custom-marker.origin .marker-label {
        background: linear-gradient(135deg, #10b981, #059669);
        color: white;
    }
    
    .custom-marker.destination .marker-label {
        background: linear-gradient(135deg, #3b82f6, #1d4ed8);
        color: white;
    }
`;
document.head.appendChild(style);

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new FlightPathVisualizer();
});
