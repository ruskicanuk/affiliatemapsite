// World map data from Natural Earth (ne_110m_admin_0_countries.geojson)

class FlightPathVisualizer {
    constructor() {
        this.worldMap = null;
        this.drMap = null;
        this.flightData = null;
        this.drGeoData = null;
        this.currentPath = null;
        this.currentMarkers = [];
        this.drMarkers = [];
        this.currentShuttleLine = null;
        this.worldLayer = null;
        this.selectedOrigin = null;
        this.selectedRoute = null;

        // Fixed Dominican Republic destinations with coordinates
        this.destinations = [
            { name: 'Puerto Plata', country: 'Dominican Republic', iata: 'POP', coords: [19.7579, -70.5700] },
            { name: 'Santiago', country: 'Dominican Republic', iata: 'STI', coords: [19.4062, -70.6046] },
            { name: 'Santo Domingo', country: 'Dominican Republic', iata: 'SDQ', coords: [18.4296, -69.6689] },
            { name: 'Punta Cana', country: 'Dominican Republic', iata: 'PUJ', coords: [18.5601, -68.3725] }
        ];

        // Green Office location
        this.greenOfficeLocation = {
            name: 'Green Office Villas',
            coords: [19.69397702287666, -70.35694318206437],
            shuttleTimes: {
                'Puerto Plata': 50,
                'Santiago': 89,
                'Santo Domingo': 222,
                'Punta Cana': 329
            }
        };

        this.init();
    }

    async init() {
        try {
            // Load flight data
            await this.loadFlightData();

            // Initialize maps
            this.initMaps();

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

    initMaps() {
        // Initialize world map
        this.worldMap = L.map('world-map', {
            center: [19.0, -70.0],
            zoom: 3,
            minZoom: 2,
            maxZoom: 10,
            zoomControl: false, // Remove zoom controls
            attributionControl: false
        });

        // Initialize destination image mapping
        this.destinationImages = {
            'Puerto Plata': 'assets/fromPuertoPlata.jpg',
            'Santiago': 'assets/fromSantiago.jpg',
            'Santo Domingo': 'assets/fromSantoDomingo.jpg',
            'Punta Cana': 'assets/fromPuntaCana.jpg'
        };

        // No attribution controls as per requirements
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
                    fillColor: 'rgb(201, 245, 218)',  // Updated land color to match DR images
                    fillOpacity: 0.8,
                    color: 'rgb(137, 216, 236)', // Border color matching ocean
                    weight: 1,
                    opacity: 0.6
                }
            }).addTo(this.worldMap);

            console.log('World map loaded successfully');
        } catch (error) {
            console.error('Error loading world map:', error);
            // Fallback to basic tile layer
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(this.worldMap);
        }
    }

    switchDestinationImage(destinationName) {
        const imageElement = document.getElementById('destination-image');
        const newImageSrc = this.destinationImages[destinationName];

        if (newImageSrc && imageElement.src !== newImageSrc) {
            // Add fade out effect
            imageElement.classList.add('fade-out');

            // Change image after fade out completes
            setTimeout(() => {
                imageElement.src = newImageSrc;
                imageElement.alt = `View from ${destinationName}`;
                imageElement.classList.remove('fade-out');
            }, 250); // Half of the transition duration
        }
    }

    clearShuttleLines() {
        // No longer needed since we removed the DR map
    }

    setupUI() {
        this.populateOriginDropdown();
        this.setupEventListeners();
        this.detectUserLocation();
    }

    populateOriginDropdown() {
        const originSelect = document.getElementById('origin-select');
        const origins = new Set();

        // Dominican Republic cities to exclude from origin options
        const drCities = this.destinations.map(dest => `${dest.name}, ${dest.country}`);

        // Collect all unique origin cities
        this.flightData.forEach(destination => {
            destination.direct_services.forEach(service => {
                const originKey = `${service.origin_city_name}, ${service.origin_country}`;
                // Exclude Dominican Republic destination cities from origin options
                if (!drCities.includes(originKey)) {
                    origins.add(originKey);
                }
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

    async detectUserLocation() {
        try {
            // Try browser geolocation first
            const position = await this.getBrowserLocation();
            if (position) {
                const closestAirport = this.findClosestAirport(position.coords.latitude, position.coords.longitude);
                if (closestAirport) {
                    this.setDefaultOrigin(closestAirport);
                    return;
                }
            }
        } catch (error) {
            console.log('Geolocation not available or denied:', error);
        }

        try {
            // Fallback to IP-based location
            const ipLocation = await this.getIPLocation();
            if (ipLocation) {
                const closestAirport = this.findClosestAirport(ipLocation.lat, ipLocation.lng);
                if (closestAirport) {
                    this.setDefaultOrigin(closestAirport);
                    return;
                }
            }
        } catch (error) {
            console.log('IP-based location detection failed:', error);
        }

        // Fallback to smart defaults based on common origins
        this.setSmartDefault();
    }

    getBrowserLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation not supported'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                resolve,
                reject,
                {
                    timeout: 10000,
                    enableHighAccuracy: false,
                    maximumAge: 300000 // 5 minutes
                }
            );
        });
    }

    async getIPLocation() {
        try {
            // Using a free IP geolocation service
            const response = await fetch('https://ipapi.co/json/', {
                timeout: 5000
            });

            if (!response.ok) throw new Error('IP location service unavailable');

            const data = await response.json();

            if (data.latitude && data.longitude) {
                return {
                    lat: data.latitude,
                    lng: data.longitude,
                    city: data.city,
                    country: data.country_name
                };
            }
        } catch (error) {
            console.log('IP location detection failed:', error);
            return null;
        }
    }

    findClosestAirport(userLat, userLng) {
        let closestAirport = null;
        let minDistance = Infinity;

        // Create a set of all unique airports from flight data
        const airports = new Set();
        this.flightData.forEach(destination => {
            destination.direct_services.forEach(service => {
                const coords = this.parseCoordinates(service.origin_airport_coordinates);
                airports.add({
                    name: `${service.origin_city_name}, ${service.origin_country}`,
                    lat: coords[0],
                    lng: coords[1]
                });
            });
        });

        // Find closest airport
        airports.forEach(airport => {
            const distance = this.calculateDistance([userLat, userLng], [airport.lat, airport.lng]);
            if (distance < minDistance) {
                minDistance = distance;
                closestAirport = airport.name;
            }
        });

        // Only return if within reasonable distance (< 500km)
        return minDistance < 500 ? closestAirport : null;
    }

    setDefaultOrigin(airportName) {
        const originSelect = document.getElementById('origin-select');
        const option = Array.from(originSelect.options).find(opt => opt.value === airportName);

        if (option) {
            originSelect.value = airportName;
            this.selectedOrigin = airportName;
            this.displayFlightOptions(airportName);
            console.log(`Auto-selected closest airport: ${airportName}`);
        }
    }

    setSmartDefault() {
        // Set smart defaults based on common travel patterns to Dominican Republic
        const commonOrigins = [
            'New York, USA',
            'Miami, USA',
            'Toronto, Canada',
            'Madrid, Spain',
            'Paris, France'
        ];

        const originSelect = document.getElementById('origin-select');

        for (const origin of commonOrigins) {
            const option = Array.from(originSelect.options).find(opt => opt.value === origin);
            if (option) {
                originSelect.value = origin;
                this.selectedOrigin = origin;
                this.displayFlightOptions(origin);
                console.log(`Set smart default origin: ${origin}`);
                break;
            }
        }
    }

    setupEventListeners() {
        const originSelect = document.getElementById('origin-select');

        originSelect.addEventListener('change', () => {
            this.onOriginChange();
        });
    }

    onOriginChange() {
        const originSelect = document.getElementById('origin-select');
        const selectedOrigin = originSelect.value;

        this.selectedOrigin = selectedOrigin;
        this.clearRoute();

        if (selectedOrigin) {
            this.displayFlightOptions(selectedOrigin);
        } else {
            this.hideFlightOptions();
        }
    }

    displayFlightOptions(selectedOrigin) {
        const flightOptionsDiv = document.getElementById('flight-options');
        flightOptionsDiv.style.display = 'block';

        // Clear all destination columns
        this.destinations.forEach(dest => {
            const columnId = this.getColumnId(dest.name);
            const column = document.getElementById(columnId);
            if (column) {
                column.innerHTML = '';
            }
        });

        // Find and display routes for each destination
        this.destinations.forEach(dest => {
            const routes = this.findRoutesForDestination(selectedOrigin, dest);
            this.populateDestinationColumn(dest, routes);
        });

        // Auto-select best route
        this.autoSelectBestRoute();
    }

    hideFlightOptions() {
        const flightOptionsDiv = document.getElementById('flight-options');
        flightOptionsDiv.style.display = 'none';
        this.hideFlightDetails();
    }

    findRoutesForDestination(originKey, destination) {
        const routes = [];

        // Find the destination data
        const destData = this.flightData.find(d =>
            d.destination_city_name === destination.name &&
            d.destination_country === destination.country
        );

        if (!destData) return routes;

        // Step 1: Find candidate connection cities using bidirectional lookup
        const candidateCities = new Set();

        // Add cities from origin's direct routes
        this.flightData.forEach(destData => {
            destData.direct_services.forEach(service => {
                const serviceOriginKey = `${service.origin_city_name}, ${service.origin_country}`;
                if (serviceOriginKey === originKey) {
                    candidateCities.add(`${destData.destination_city_name}, ${destData.destination_country}`);
                }
            });
        });

        // Add cities that have direct routes to target destination
        destData.direct_services.forEach(service => {
            candidateCities.add(`${service.origin_city_name}, ${service.origin_country}`);
        });

        // Step 2: Add direct flight if exists (bidirectional check)
        const directFlight = this.findBidirectionalFlight(originKey, `${destination.name}, ${destination.country}`);
        if (directFlight) {
            routes.push({
                type: 'direct',
                duration: directFlight.flight_duration_minutes,
                segments: [directFlight],
                destination: destData
            });
        }

        // Step 3: Find connecting routes through candidate cities (bidirectional)
        candidateCities.forEach(candidateCity => {
            // Skip if this is our origin or final destination
            if (candidateCity === originKey ||
                candidateCity === `${destination.name}, ${destination.country}`) return;

            // Find first leg: origin to via city (bidirectional)
            const firstLeg = this.findBidirectionalFlight(originKey, candidateCity);
            if (!firstLeg) return;

            // Find second leg: via city to final destination (bidirectional)
            const secondLeg = this.findBidirectionalFlight(candidateCity, `${destination.name}, ${destination.country}`);
            if (!secondLeg) return;

            const viaCity = candidateCity.split(', ')[0]; // Extract city name
            const totalDuration = firstLeg.flight_duration_minutes + secondLeg.flight_duration_minutes;

            // Only add if we don't already have this exact route
            const existingRoute = routes.find(r =>
                r.type === 'connecting' &&
                r.via === viaCity &&
                r.duration === totalDuration
            );

            if (!existingRoute) {
                routes.push({
                    type: 'connecting',
                    duration: totalDuration,
                    segments: [firstLeg, secondLeg],
                    destination: destData,
                    via: viaCity
                });
            }
        });

        // Calculate efficiency ratio for each route and sort by it
        routes.forEach(route => {
            const volume = this.calculateRouteVolume(route);
            route.volumeFactor = Math.max(volume, 0.1); // Minimum volume factor to avoid division by zero
            route.efficiencyRatio = route.duration / route.volumeFactor;
        });

        // Separate direct and connecting flights
        const directFlights = routes.filter(route => route.type === 'direct');
        const connectingFlights = routes.filter(route => route.type === 'connecting');

        // Sort each group by efficiency ratio
        directFlights.sort((a, b) => a.efficiencyRatio - b.efficiencyRatio);
        connectingFlights.sort((a, b) => a.efficiencyRatio - b.efficiencyRatio);

        // Combine with direct flights first, then connecting flights
        const sortedRoutes = [...directFlights, ...connectingFlights];

        return sortedRoutes.slice(0, 30);
    }

    findBidirectionalFlight(originKey, destinationKey) {
        // Parse destination key to get city and country
        const [destCity, destCountry] = destinationKey.split(', ');

        // Find destination data
        const destData = this.flightData.find(d =>
            d.destination_city_name === destCity &&
            d.destination_country === destCountry
        );

        if (!destData) return null;

        // Look for flight in destination's record (origin -> destination)
        const forwardFlight = destData.direct_services.find(service => {
            const serviceOriginKey = `${service.origin_city_name}, ${service.origin_country}`;
            return serviceOriginKey === originKey;
        });

        // Parse origin key to get city and country
        const [originCity, originCountry] = originKey.split(', ');

        // Find origin data
        const originData = this.flightData.find(d =>
            d.destination_city_name === originCity &&
            d.destination_country === originCountry
        );

        // Look for flight in origin's record (destination -> origin, then reverse)
        let reverseFlight = null;
        if (originData) {
            reverseFlight = originData.direct_services.find(service => {
                const serviceOriginKey = `${service.origin_city_name}, ${service.origin_country}`;
                return serviceOriginKey === destinationKey;
            });
        }

        // Combine and return the more conservative option
        if (forwardFlight && reverseFlight) {
            // Take the more conservative flight (longer duration, fewer days per week)
            return {
                ...forwardFlight,
                flight_duration_minutes: Math.max(forwardFlight.flight_duration_minutes, reverseFlight.flight_duration_minutes),
                airlines: this.combineAirlineData([forwardFlight], [reverseFlight])
            };
        }

        return forwardFlight || reverseFlight;
    }

    combineAirlineData(airlines1, airlines2) {
        const airlineMap = new Map();

        // Process first set of airlines
        airlines1.forEach(segment => {
            segment.airlines.forEach(airline => {
                airlineMap.set(airline.airline_name, airline);
            });
        });

        // Process second set of airlines and combine
        airlines2.forEach(segment => {
            segment.airlines.forEach(airline => {
                if (airlineMap.has(airline.airline_name)) {
                    const existing = airlineMap.get(airline.airline_name);
                    // Take more conservative values
                    airlineMap.set(airline.airline_name, {
                        ...existing,
                        days_per_week: Math.min(existing.days_per_week, airline.days_per_week),
                        service_start_month: this.getMoreConservativeMonth(existing.service_start_month, airline.service_start_month, true),
                        service_end_month: this.getMoreConservativeMonth(existing.service_end_month, airline.service_end_month, false)
                    });
                } else {
                    airlineMap.set(airline.airline_name, airline);
                }
            });
        });

        return Array.from(airlineMap.values());
    }

    getMoreConservativeMonth(month1, month2, isStartMonth) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const index1 = months.indexOf(month1);
        const index2 = months.indexOf(month2);

        if (isStartMonth) {
            // For start month, take the later one (more conservative)
            return months[Math.max(index1, index2)];
        } else {
            // For end month, take the earlier one (more conservative)
            return months[Math.min(index1, index2)];
        }
    }

    calculateRouteVolume(route) {
        let totalVolume = 0;

        route.segments.forEach(segment => {
            segment.airlines.forEach(airline => {
                // Calculate months per year
                let monthsPerYear;
                if (airline.service_start_month === 'Jan' && airline.service_end_month === 'Dec') {
                    monthsPerYear = 12;
                } else {
                    // Simplified calculation - could be enhanced for exact month counting
                    monthsPerYear = 6; // Average seasonal operation
                }

                const flightsPerWeek = airline.days_per_week;
                totalVolume += (monthsPerYear * flightsPerWeek);
            });
        });

        return totalVolume / 84; // Normalize by dividing by 84
    }

    createVolumeIndicator(volume) {
        let fillPercentage = 0;

        if (volume >= 2.0) {
            fillPercentage = 100; // Full box
        } else if (volume === 0) {
            fillPercentage = 0; // Empty box
        } else {
            fillPercentage = (volume / 2.0) * 100; // Proportional fill
        }

        return `
            <div class="volume-indicator">
                <div class="volume-fill" style="width: ${fillPercentage}%"></div>
            </div>
        `;
    }

    getColumnId(destinationName) {
        const mapping = {
            'Puerto Plata': 'puerto-plata-options',
            'Santiago': 'santiago-options',
            'Santo Domingo': 'santo-domingo-options',
            'Punta Cana': 'punta-cana-options'
        };
        return mapping[destinationName] || destinationName.toLowerCase().replace(' ', '-') + '-options';
    }

    populateDestinationColumn(destination, routes) {
        const columnId = this.getColumnId(destination.name);
        const column = document.getElementById(columnId);
        if (!column) return;

        routes.forEach((route, index) => {
            const button = document.createElement('button');
            button.className = 'flight-option-btn';

            // Calculate volume for this route
            const volume = this.calculateRouteVolume(route);

            // Create button content with volume indicator
            const routeType = route.type === 'direct' ? 'Direct' : `via ${route.via}`;
            const duration = this.formatDuration(route.duration);
            const volumeIndicator = this.createVolumeIndicator(volume);

            button.innerHTML = `
                <div class="button-content">
                    <div class="route-type-row">
                        <span class="route-type">${routeType}</span>
                    </div>
                    <div class="volume-duration-row">
                        <div class="volume-section">
                            ${volumeIndicator}
                        </div>
                        <div class="duration-section">
                            <span class="duration">${duration}</span>
                        </div>
                    </div>
                </div>
            `;

            button.addEventListener('click', () => {
                this.selectRoute(route, button);
            });

            column.appendChild(button);
        });
    }

    autoSelectBestRoute() {
        // Find the best route (shortest in Puerto Plata, then Santiago, etc.)
        for (const dest of this.destinations) {
            const columnId = this.getColumnId(dest.name);
            const column = document.getElementById(columnId);
            if (column && column.children.length > 0) {
                // Trigger click on the first (shortest) option in this column
                const firstButton = column.children[0];
                firstButton.click();
                return;
            }
        }
    }

    selectRoute(route, buttonElement) {
        this.selectedRoute = route;

        // Update button states
        document.querySelectorAll('.flight-option-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        if (buttonElement) {
            buttonElement.classList.add('selected');
        }

        // Add fade effect to maps
        this.addMapFadeEffect();

        // Draw the route on map
        this.drawFlightPath(route);

        // Switch destination image
        this.switchDestinationImage(route.destination.destination_city_name);

        // Show flight details
        this.displayFlightDetails(route);
    }

    addMapFadeEffect() {
        const worldMap = document.getElementById('world-map');
        const destinationImage = document.getElementById('destination-image');

        // Add fade-out class
        worldMap.classList.add('fade-out');
        if (destinationImage) {
            destinationImage.classList.add('fade-out');
        }

        // Remove fade-out class after 0.5 seconds
        setTimeout(() => {
            worldMap.classList.remove('fade-out');
            if (destinationImage) {
                destinationImage.classList.remove('fade-out');
            }
        }, 500);
    }

    drawFlightPath(route) {
        this.clearRoute();

        const segments = route.segments;

        // Add markers for all points on world map
        segments.forEach((segment, index) => {
            const originCoords = this.parseCoordinates(segment.origin_airport_coordinates);
            const icon = index === 0 ? '🛫' : '🔄';
            const type = index === 0 ? 'origin' : 'transfer';
            this.addMarker(originCoords, segment.origin_city_name, icon, type);
        });

        // Add final destination marker on world map
        const lastSegment = segments[segments.length - 1];
        const destCoords = this.parseCoordinates(route.destination.destination_airport_coordinates);
        this.addMarker(destCoords, route.destination.destination_city_name, '🛬', 'destination');

        // Draw paths between all segments on world map
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            const originCoords = this.parseCoordinates(segment.origin_airport_coordinates);

            let destCoords;
            if (i === segments.length - 1) {
                // Last segment goes to final destination
                destCoords = this.parseCoordinates(route.destination.destination_airport_coordinates);
            } else {
                // Intermediate segment goes to next segment's origin
                destCoords = this.parseCoordinates(segments[i + 1].origin_airport_coordinates);
            }

            this.drawDirectPath(originCoords, destCoords);
        }

        // Draw line from destination airport to Green Office on world map
        this.drawAirportToOfficeConnection(destCoords);

        // Fit world map to show route with optimized zoom
        this.optimizeWorldMapZoom();
    }



    parseCoordinates(coordString) {
        const [lat, lng] = coordString.split(',').map(coord => parseFloat(coord.trim()));
        return [lat, lng];
    }

    addMarker(coords, cityName, icon, type) {
        // Check for collision with existing markers
        const adjustedCoords = this.adjustMarkerPosition(coords, cityName);

        const marker = L.marker(adjustedCoords, {
            icon: L.divIcon({
                html: `<div class="custom-marker ${type}">
                    <span class="marker-label">${cityName}</span>
                    <span class="marker-icon">${icon}</span>
                </div>`,
                className: 'custom-div-icon',
                iconSize: [120, 40],
                iconAnchor: [60, 40]
            })
        }).addTo(this.worldMap);

        this.currentMarkers.push(marker);
        return marker;
    }

    adjustMarkerPosition(coords, cityName) {
        const [lat, lng] = coords;
        const minDistance = 2.0; // Minimum distance in degrees to avoid collision

        // Check collision with existing markers
        for (const existingMarker of this.currentMarkers) {
            const existingPos = existingMarker.getLatLng();
            const distance = this.calculateDistance([lat, lng], [existingPos.lat, existingPos.lng]);

            if (distance < 300) { // If markers are within 300km (increased for better separation)
                // Calculate smart offset based on relative position
                const deltaLat = lat - existingPos.lat;
                const deltaLng = lng - existingPos.lng;

                // Normalize the direction vector
                const magnitude = Math.sqrt(deltaLat * deltaLat + deltaLng * deltaLng);
                const normalizedLat = magnitude > 0 ? deltaLat / magnitude : 0;
                const normalizedLng = magnitude > 0 ? deltaLng / magnitude : 1;

                // Apply offset in the direction away from existing marker
                const offsetDistance = minDistance + 1.0; // Extra buffer
                const offsetLat = normalizedLat * offsetDistance;
                const offsetLng = normalizedLng * offsetDistance;

                return [existingPos.lat + offsetLat, existingPos.lng + offsetLng];
            }
        }

        return coords; // No collision, return original coordinates
    }



    optimizeWorldMapZoom() {
        if (this.currentMarkers.length === 0) return;

        const group = new L.featureGroup(this.currentMarkers);
        const bounds = group.getBounds();

        // Calculate optimal padding based on route distance
        const distance = this.calculateBoundsDistance(bounds);
        let padding = 0.15; // Default padding

        // Adjust padding based on distance
        if (distance < 1000) { // Short routes (< 1000km)
            padding = 0.25;
        } else if (distance < 5000) { // Medium routes (1000-5000km)
            padding = 0.2;
        } else { // Long routes (> 5000km)
            padding = 0.1;
        }

        // Fit bounds with calculated padding
        this.worldMap.fitBounds(bounds.pad(padding), {
            maxZoom: 8, // Prevent over-zooming
            animate: true,
            duration: 1.0
        });
    }

    calculateBoundsDistance(bounds) {
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        return this.calculateDistance([sw.lat, sw.lng], [ne.lat, ne.lng]);
    }

    drawDirectPath(start, end) {
        // Draw more direct, nearly straight lines as requested
        const path = L.polyline([start, end], {
            color: '#22c55e',  // Green color to match branding
            weight: 4,
            opacity: 0.8
        }).addTo(this.worldMap);

        if (!this.currentPath) {
            this.currentPath = [];
        }
        this.currentPath.push(path);
    }

    drawAirportToOfficeConnection(airportCoords) {
        // Draw line from airport to Green Office on world map
        const officeLine = L.polyline([airportCoords, this.greenOfficeLocation.coords], {
            color: '#109a48',  // Same green color as other paths
            weight: 3,
            opacity: 0.8,
            dashArray: '8, 4' // Dashed line to distinguish from flight paths
        }).addTo(this.worldMap);

        if (!this.currentPath) {
            this.currentPath = [];
        }
        this.currentPath.push(officeLine);
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

    displayFlightDetails(route) {
        const detailsDiv = document.getElementById('flight-details');
        const titleElement = document.getElementById('details-title');

        // Set overall header with total duration including shuttle
        const originCity = route.segments[0].origin_city_name;
        const destCity = route.destination.destination_city_name;
        const shuttleTime = this.greenOfficeLocation.shuttleTimes[destCity];
        const totalDurationWithShuttle = route.duration + shuttleTime;
        const totalDuration = this.formatDuration(totalDurationWithShuttle);
        titleElement.innerHTML = `${originCity} ${this.createDurationArrow(totalDuration)} <img src="assets/logo-final-2023-05-20.svg" class="inline-logo" alt="Green Office">`;

        // Show first segment
        const firstSegment = document.getElementById('first-segment');
        this.populateSegmentDetails(firstSegment, route.segments[0], route.destination);

        // Show second segment if connecting flight
        const secondSegment = document.getElementById('second-segment');
        if (route.segments.length > 1) {
            secondSegment.style.display = 'block';
            this.populateSegmentDetails(secondSegment, route.segments[1], route.destination);
        } else {
            secondSegment.style.display = 'none';
        }

        // Show shuttle segment
        const shuttleSegment = document.getElementById('shuttle-segment');
        const shuttleMinutes = this.greenOfficeLocation.shuttleTimes[destCity];
        const shuttleDuration = this.formatDuration(shuttleMinutes);

        shuttleSegment.querySelector('.segment-content').innerHTML = `
            <div class="segment-header">
                ${destCity} ${this.createDurationArrow(shuttleDuration)} <img src="assets/logo-final-2023-05-20.svg" class="inline-logo" alt="Green Office">
            </div>
            <div class="airlines-list">
                <div class="airline-item">
                    <span class="airline-name">🚐 Green Office Shuttle Pickup</span>
                </div>
                <div class="airline-item">
                    <span class="airline-name">🚁 Helicopter Pickup (By Request)</span>
                </div>
            </div>
        `;
        shuttleSegment.style.display = 'block';

        detailsDiv.style.display = 'block';
    }

    populateSegmentDetails(segmentElement, segment, finalDestination) {
        const content = segmentElement.querySelector('.segment-content');

        // Determine destination for this segment
        let segmentDest;
        const segmentIndex = this.selectedRoute.segments.indexOf(segment);

        if (segmentIndex === this.selectedRoute.segments.length - 1) {
            // Last segment goes to final destination
            segmentDest = {
                city: finalDestination.destination_city_name,
                country: finalDestination.destination_country,
                iata: finalDestination.destination_airport_iata
            };
        } else {
            // Intermediate segment - goes to next segment's origin
            const nextSegment = this.selectedRoute.segments[segmentIndex + 1];
            segmentDest = {
                city: nextSegment.origin_city_name,
                country: nextSegment.origin_country,
                iata: nextSegment.origin_airport_iata
            };
        }

        const duration = this.formatDuration(segment.flight_duration_minutes);

        content.innerHTML = `
            <div class="segment-header">
                ${segment.origin_city_name} ${this.createDurationArrow(duration)} ${segmentDest.city}
            </div>
            <div class="airlines-list">
                ${this.formatAirlinesList(segment.airlines)}
            </div>
        `;
    }

    formatAirlinesList(airlines) {
        return airlines.map(airline => {
            const seasonDisplay = this.getServiceMonthsWithIcons(airline.service_start_month, airline.service_end_month);
            const daysPerWeek = airline.days_per_week;
            const frequencyDisplay = daysPerWeek === 7 ? 'Daily' : `${daysPerWeek}/week`;

            return `
                <div class="airline-item">
                    <span class="airline-name">${airline.airline_name}</span>
                    <span class="airline-season">${seasonDisplay}</span>
                    <span class="airline-frequency">${frequencyDisplay}</span>
                </div>
            `;
        }).join('');
    }

    getServiceMonthsWithIcons(startMonth, endMonth) {
        if (startMonth === 'Jan' && endMonth === 'Dec') {
            return `<span class="calendar-icon">📅</span><span class="month-text">All Year</span>`;
        } else {
            return `<span class="calendar-icon">📅</span><span class="month-text">${startMonth}</span> ${this.createSmallSeasonalArrow()} <span class="calendar-icon">📅</span><span class="month-text">${endMonth}</span>`;
        }
    }

    createSmallSeasonalArrow() {
        return `<span class="seasonal-arrow">
            <svg class="small-arrow-icon" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="smallArrowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" style="stop-color:rgb(16, 154, 72);stop-opacity:1" />
                        <stop offset="100%" style="stop-color:rgba(16, 154, 72, 0.7);stop-opacity:1" />
                    </linearGradient>
                </defs>
                <path d="M2 10 L16 10 L13 7 M16 10 L13 13" stroke="url(#smallArrowGradient)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </span>`;
    }

    getServiceMonths(startMonth, endMonth) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

        if (startMonth === 'Jan' && endMonth === 'Dec') {
            return 'Year-round';
        }

        return `${startMonth} - ${endMonth}`;
    }

    formatDuration(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;

        if (hours === 0) {
            return `${mins}m`;
        } else if (mins === 0) {
            return `${hours}h`;
        } else {
            return `${hours}h ${mins}m`;
        }
    }

    createDurationArrow(duration) {
        return `<span class="duration-arrow">
            <svg class="arrow-icon" viewBox="0 0 100 20" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="arrowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" style="stop-color:rgb(16, 154, 72);stop-opacity:1" />
                        <stop offset="100%" style="stop-color:rgba(16, 154, 72, 0.7);stop-opacity:1" />
                    </linearGradient>
                </defs>
                <path d="M5 10 L85 10 L80 5 M85 10 L80 15" stroke="url(#arrowGradient)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="duration-text">${duration}</span>
        </span>`;
    }

    hideFlightDetails() {
        const detailsDiv = document.getElementById('flight-details');
        detailsDiv.style.display = 'none';
    }

    clearRoute() {
        // Remove current paths from world map
        if (this.currentPath) {
            if (Array.isArray(this.currentPath)) {
                this.currentPath.forEach(path => this.worldMap.removeLayer(path));
            } else {
                this.worldMap.removeLayer(this.currentPath);
            }
            this.currentPath = null;
        }

        // Remove markers from world map
        this.currentMarkers.forEach(marker => {
            this.worldMap.removeLayer(marker);
        });
        this.currentMarkers = [];

        // Clear shuttle lines
        this.clearShuttleLines();

        // Hide flight details
        this.hideFlightDetails();

        // Reset world map view to Caribbean area
        this.worldMap.setView([19.0, -70.0], 3);
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
