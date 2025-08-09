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
        this.LABEL_SEPARATION_PIXELS = 35; // Configurable label separation distance
        this.selectedOrigin = null;
        this.selectedRoute = null;
        this.zoomCache = new Map(); // Cache zoom levels for route combinations

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
        const response = await fetch('flightsonetoone.jsonl');
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

        console.log('Flight data loaded:', this.flightData.length, 'airport pairs');
    }

    initMaps() {
        // Initialize world map
        this.worldMap = L.map('world-map', {
            center: [19.0, -70.0],
            zoom: 3,
            minZoom: 2,
            maxZoom: 10,
            zoomControl: false, // Remove zoom controls
            attributionControl: false,
            dragging: false, // Disable panning
            touchZoom: false, // Disable touch zoom
            doubleClickZoom: false, // Disable double-click zoom
            scrollWheelZoom: false, // Disable scroll wheel zoom
            boxZoom: false, // Disable box zoom
            keyboard: false // Disable keyboard navigation
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
            // Fade out is handled by addMapFadeEffect() for synchronization
            // Change image immediately since fade out is instant
            setTimeout(() => {
                imageElement.src = newImageSrc;
                imageElement.alt = `View from ${destinationName}`;
            }, 0); // Change image immediately
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
        const origins = new Map(); // IATA -> {city, country, displayName}

        // Dominican Republic IATA codes to exclude from origin options
        const drIataCodes = this.destinations.map(dest => dest.iata);

        // Step 1: Collect airports with direct routes to DR destinations
        this.flightData.forEach(airportPair => {
            // Check if either airport is a DR destination
            const airport1IsDR = drIataCodes.includes(airportPair.airport1_iata);
            const airport2IsDR = drIataCodes.includes(airportPair.airport2_iata);

            // Add the non-DR airport as a potential origin
            if (airport1IsDR && !drIataCodes.includes(airportPair.airport2_iata)) {
                const iata = airportPair.airport2_iata;
                const city = airportPair.airport2_city_name;
                const country = airportPair.airport2_country;
                const displayName = `${city}, ${country}`;
                origins.set(iata, {city, country, displayName});
            } else if (airport2IsDR && !drIataCodes.includes(airportPair.airport1_iata)) {
                const iata = airportPair.airport1_iata;
                const city = airportPair.airport1_city_name;
                const country = airportPair.airport1_country;
                const displayName = `${city}, ${country}`;
                origins.set(iata, {city, country, displayName});
            }
        });

        // Step 2: Add airports with connecting routes (2-hop routes)
        // Get all airports that connect to the direct-route airports
        const directRouteAirports = new Set(origins.keys());

        this.flightData.forEach(airportPair => {
            const airport1Iata = airportPair.airport1_iata;
            const airport2Iata = airportPair.airport2_iata;

            // If airport1 connects to a direct-route airport, add airport2 as potential origin
            if (directRouteAirports.has(airport1Iata) && !drIataCodes.includes(airport2Iata) && !origins.has(airport2Iata)) {
                const iata = airport2Iata;
                const city = airportPair.airport2_city_name;
                const country = airportPair.airport2_country;
                const displayName = `${city}, ${country}`;
                origins.set(iata, {city, country, displayName});
            }

            // If airport2 connects to a direct-route airport, add airport1 as potential origin
            if (directRouteAirports.has(airport2Iata) && !drIataCodes.includes(airport1Iata) && !origins.has(airport1Iata)) {
                const iata = airport1Iata;
                const city = airportPair.airport1_city_name;
                const country = airportPair.airport1_country;
                const displayName = `${city}, ${country}`;
                origins.set(iata, {city, country, displayName});
            }
        });

        // Sort by display name and populate dropdown
        Array.from(origins.entries())
            .sort((a, b) => a[1].displayName.localeCompare(b[1].displayName))
            .forEach(([iata, airport]) => {
                const option = document.createElement('option');
                option.value = iata; // Use IATA code as value
                option.textContent = `${airport.displayName} (${iata})`; // Display city, country (IATA)
                option.dataset.city = airport.city;
                option.dataset.country = airport.country;
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

        // Create a map of all unique airports from flight data
        const airports = new Map(); // IATA -> {name, lat, lng}
        const drIataCodes = this.destinations.map(dest => dest.iata);

        this.flightData.forEach(airportPair => {
            // Add airport1 if it's not a DR destination
            if (!drIataCodes.includes(airportPair.airport1_iata)) {
                const coords1 = this.parseCoordinates(airportPair.airport1_coordinates);
                airports.set(airportPair.airport1_iata, {
                    iata: airportPair.airport1_iata,
                    name: `${airportPair.airport1_city_name}, ${airportPair.airport1_country}`,
                    lat: coords1[0],
                    lng: coords1[1]
                });
            }

            // Add airport2 if it's not a DR destination
            if (!drIataCodes.includes(airportPair.airport2_iata)) {
                const coords2 = this.parseCoordinates(airportPair.airport2_coordinates);
                airports.set(airportPair.airport2_iata, {
                    iata: airportPair.airport2_iata,
                    name: `${airportPair.airport2_city_name}, ${airportPair.airport2_country}`,
                    lat: coords2[0],
                    lng: coords2[1]
                });
            }
        });

        // Find closest airport
        airports.forEach(airport => {
            const distance = this.calculateDistance([userLat, userLng], [airport.lat, airport.lng]);
            if (distance < minDistance) {
                minDistance = distance;
                closestAirport = airport.iata; // Return IATA code instead of name
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

        // Update the options title with city name only (remove country)
        const optionsTitle = document.getElementById('options-title');
        const originCityOnly = selectedOrigin.split(',')[0].trim(); // Extract city name only
        optionsTitle.innerHTML = `${originCityOnly} ${this.createDurationArrow('varies')} <img src="assets/logo-final-2023-05-20.svg" class="inline-logo" alt="Green Office">`;

        // Clear all destination columns and reset styling
        this.destinations.forEach(dest => {
            const columnId = this.getColumnId(dest.name);
            const column = document.getElementById(columnId);
            if (column) {
                column.innerHTML = '';
                // Reset column styling to default (remove selected/unselected classes)
                const columnContainer = column.closest('.destination-column');
                if (columnContainer) {
                    columnContainer.classList.remove('selected', 'unselected');
                }
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

        // Create a mock destination data object for compatibility
        const destData = {
            destination_city_name: destination.name,
            destination_country: destination.country,
            destination_airport_iata: destination.iata,
            destination_airport_coordinates: destination.coords.join(',')
        };



        // Step 1: Get ServicesStartingAirport1 - airports that Starting Airport serves directly
        const servicesStartingAirport1 = this.getDirectServicesFromAirport(originKey);

        // Step 2: Get ServicesStartingAirport2 - airports that have Starting Airport as a service
        const servicesStartingAirport2 = this.getAirportsServingOrigin(originKey);

        // Step 3: Combine into ServicesStartingAirportCombined
        const servicesStartingAirportCombined = this.combineAirportSets(servicesStartingAirport1, servicesStartingAirport2);

        // Step 4-6: Get ServicesEndingAirportCombined for this destination
        const servicesEndingAirport1 = this.getDirectServicesFromAirport(`${destination.name}, ${destination.country}`);
        const servicesEndingAirport2 = this.getAirportsServingOrigin(`${destination.name}, ${destination.country}`);
        const servicesEndingAirportCombined = this.combineAirportSets(servicesEndingAirport1, servicesEndingAirport2);

        // Check for direct flight first (always at top if available)
        const directFlight = this.findDirectFlight(originKey, `${destination.name}, ${destination.country}`);
        if (directFlight) {
            routes.push({
                type: 'direct',
                duration: directFlight.flight_duration_minutes,
                segments: [directFlight],
                destination: destData,
                transferAirport: null
            });
        }

        // Find intersection - these are the transfer airports
        const transferAirports = this.findIntersection(servicesStartingAirportCombined, servicesEndingAirportCombined);

        // Debug logging
        if (originKey === "Calgary, Canada" && destination.name === "Santiago") {
            console.log(`DEBUG: Calgary -> Santiago`);
            console.log(`ServicesStartingAirportCombined:`, Array.from(servicesStartingAirportCombined));
            console.log(`ServicesEndingAirportCombined:`, Array.from(servicesEndingAirportCombined));
            console.log(`Transfer airports found:`, Array.from(transferAirports));
        }

        // Create connecting routes for each transfer airport
        transferAirports.forEach(transferAirportKey => {
            // Skip if transfer airport is the same as origin or destination
            if (transferAirportKey === originKey || transferAirportKey === `${destination.name}, ${destination.country}`) {
                return;
            }

            // Get flight details for both legs
            const firstLegDetails = this.getFlightDetails(originKey, transferAirportKey);
            const secondLegDetails = this.getFlightDetails(transferAirportKey, `${destination.name}, ${destination.country}`);

            if (firstLegDetails && secondLegDetails) {
                const transferCity = transferAirportKey.split(', ')[0]; // Extract city name
                const transferIata = this.getIataFromAirportKey(transferAirportKey);
                const totalDuration = firstLegDetails.flight_duration_minutes + secondLegDetails.flight_duration_minutes;

                routes.push({
                    type: 'connecting',
                    duration: totalDuration,
                    segments: [firstLegDetails, secondLegDetails],
                    destination: destData,
                    via: `${transferCity} (${transferIata})`,
                    transferAirport: transferAirportKey
                });
            }
        });

        // Calculate efficiency ratio for each route and sort
        routes.forEach(route => {
            const overallVolumeFactor = this.calculateRouteVolume(route);
            route.volumeFactor = Math.max(overallVolumeFactor, 0.1);
            route.efficiencyRatio = route.duration / route.volumeFactor;
        });

        // Sort routes: direct flights first, then connecting flights by efficiency (lowest to highest)
        const directFlights = routes.filter(r => r.type === 'direct');
        const connectingFlights = routes.filter(r => r.type === 'connecting')
            .sort((a, b) => a.efficiencyRatio - b.efficiencyRatio);

        const sortedRoutes = [...directFlights, ...connectingFlights];

        return sortedRoutes.slice(0, 30);
    }

    // Helper function: Convert IATA code to "City, Country" format
    iataToDisplayName(iata) {
        for (const airportPair of this.flightData) {
            if (airportPair.airport1_iata === iata) {
                return `${airportPair.airport1_city_name}, ${airportPair.airport1_country}`;
            }
            if (airportPair.airport2_iata === iata) {
                return `${airportPair.airport2_city_name}, ${airportPair.airport2_country}`;
            }
        }
        return iata; // Fallback to IATA if not found
    }

    // Helper function: Convert "City, Country" format to IATA code
    displayNameToIata(displayName) {
        const [city, country] = displayName.split(', ');
        for (const airportPair of this.flightData) {
            if (airportPair.airport1_city_name === city && airportPair.airport1_country === country) {
                return airportPair.airport1_iata;
            }
            if (airportPair.airport2_city_name === city && airportPair.airport2_country === country) {
                return airportPair.airport2_iata;
            }
        }
        return displayName; // Fallback if not found
    }

    // Helper function: Get IATA code from airport key (handles both IATA and "City, Country" formats)
    getIataFromAirportKey(airportKey) {
        // If it's already an IATA code (3 letters), return it
        if (airportKey.length === 3 && airportKey.match(/^[A-Z]{3}$/)) {
            return airportKey;
        }
        // If it's in "City, Country" format, convert to IATA
        return this.displayNameToIata(airportKey);
    }

    // Helper function: Normalize airport key (convert to "City, Country" format for compatibility)
    normalizeAirportKey(key) {
        // If it's already in "City, Country" format, return as is
        if (key.includes(', ')) {
            return key;
        }
        // If it's an IATA code, convert to display name
        return this.iataToDisplayName(key);
    }

    // Helper function: Get airports that a given airport serves directly (ServicesX1)
    getDirectServicesFromAirport(airportKey) {
        const services = new Set();
        const normalizedKey = this.normalizeAirportKey(airportKey);

        // In the new one-to-one structure, find all airports connected to this airport
        this.flightData.forEach(airportPair => {
            const airport1Key = `${airportPair.airport1_city_name}, ${airportPair.airport1_country}`;
            const airport2Key = `${airportPair.airport2_city_name}, ${airportPair.airport2_country}`;

            // If airport1 matches our target, add airport2 as a service
            if (airport1Key === normalizedKey) {
                services.add(airport2Key);
            }
            // If airport2 matches our target, add airport1 as a service
            else if (airport2Key === normalizedKey) {
                services.add(airport1Key);
            }
        });

        return services;
    }

    // Helper function: Get airports that have the given airport as a service (ServicesX2)
    getAirportsServingOrigin(originKey) {
        const services = new Set();
        const normalizedKey = this.normalizeAirportKey(originKey);

        // In the new one-to-one structure, this is the same as getDirectServicesFromAirport
        // since the relationship is bidirectional
        this.flightData.forEach(airportPair => {
            const airport1Key = `${airportPair.airport1_city_name}, ${airportPair.airport1_country}`;
            const airport2Key = `${airportPair.airport2_city_name}, ${airportPair.airport2_country}`;

            // If airport1 matches our target, add airport2 as a service
            if (airport1Key === normalizedKey) {
                services.add(airport2Key);
            }
            // If airport2 matches our target, add airport1 as a service
            else if (airport2Key === normalizedKey) {
                services.add(airport1Key);
            }
        });

        return services;
    }

    // Helper function: Combine two sets of airports (union operation)
    combineAirportSets(set1, set2) {
        const combined = new Set();
        set1.forEach(airport => combined.add(airport));
        set2.forEach(airport => combined.add(airport));
        return combined;
    }

    // Helper function: Find intersection of two sets
    findIntersection(set1, set2) {
        const intersection = new Set();
        set1.forEach(airport => {
            if (set2.has(airport)) {
                intersection.add(airport);
            }
        });
        return intersection;
    }

    // Helper function: Find direct flight between two airports
    findDirectFlight(originKey, destinationKey) {
        const normalizedOriginKey = this.normalizeAirportKey(originKey);
        const normalizedDestinationKey = this.normalizeAirportKey(destinationKey);

        // Find the airport pair that connects these two airports
        const airportPair = this.flightData.find(pair => {
            const airport1Key = `${pair.airport1_city_name}, ${pair.airport1_country}`;
            const airport2Key = `${pair.airport2_city_name}, ${pair.airport2_country}`;

            return (airport1Key === normalizedOriginKey && airport2Key === normalizedDestinationKey) ||
                   (airport1Key === normalizedDestinationKey && airport2Key === normalizedOriginKey);
        });

        if (!airportPair) return null;

        // Create a flight service object compatible with the existing structure
        const airport1Key = `${airportPair.airport1_city_name}, ${airportPair.airport1_country}`;

        // Determine which airport is the origin and which is the destination
        const isForward = airport1Key === normalizedOriginKey;

        return {
            origin_city_name: isForward ? airportPair.airport1_city_name : airportPair.airport2_city_name,
            origin_country: isForward ? airportPair.airport1_country : airportPair.airport2_country,
            origin_airport_iata: isForward ? airportPair.airport1_iata : airportPair.airport2_iata,
            origin_airport_coordinates: isForward ? airportPair.airport1_coordinates : airportPair.airport2_coordinates,
            flight_duration_minutes: airportPair.flight_duration_minutes,
            airlines: airportPair.airlines
        };
    }

    // Helper function: Get flight details for a specific route leg
    getFlightDetails(originKey, destinationKey) {
        // The findDirectFlight method now handles bidirectional lookup automatically
        return this.findDirectFlight(originKey, destinationKey);
    }

    findBidirectionalFlight(originKey, destinationKey) {
        // In the new one-to-one structure, this is the same as findDirectFlight
        // since bidirectional logic is already handled there
        return this.findDirectFlight(originKey, destinationKey);
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
        if (route.type === 'direct') {
            // For direct flights, calculate volume normally
            return this.calculateSegmentVolume(route.segments[0]);
        } else {
            // For connecting flights, calculate duration-weighted average
            const segment1 = route.segments[0]; // Flight 1
            const segment2 = route.segments[1]; // Flight 2

            const volume1 = this.calculateSegmentVolume(segment1);
            const volume2 = this.calculateSegmentVolume(segment2);

            const duration1 = segment1.flight_duration_minutes;
            const duration2 = segment2.flight_duration_minutes;
            const totalDuration = duration1 + duration2;

            // Calculate duration weights (excluding shuttle portion)
            const weight1 = duration1 / totalDuration;
            const weight2 = duration2 / totalDuration;

            // Calculate duration-weighted average volume
            const overallVolumeFactor = (weight1 * volume1) + (weight2 * volume2);

            // Debug logging for specific routes
            if (segment1.origin_city_name === "Winnipeg" && segment2.destination_city_name === "Puerto Plata") {
                console.log(`DEBUG: Winnipeg -> Calgary -> Puerto Plata volume calculation:`);
                console.log(`  Flight 1 (${segment1.origin_city_name} -> ${segment1.destination_city_name}): duration=${duration1}min, volume=${volume1.toFixed(3)}, weight=${weight1.toFixed(3)}`);
                console.log(`  Flight 2 (${segment2.origin_city_name} -> ${segment2.destination_city_name}): duration=${duration2}min, volume=${volume2.toFixed(3)}, weight=${weight2.toFixed(3)}`);
                console.log(`  Overall volume factor: ${overallVolumeFactor.toFixed(3)}`);
                console.log(`  Efficiency ratio: ${(duration1 + duration2) / overallVolumeFactor}`);
            }

            return overallVolumeFactor;
        }
    }

    calculateSegmentVolume(segment) {
        let totalVolume = 0;

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

        routes.forEach((route) => {
            const button = document.createElement('button');
            // Add transfer class for connecting flights
            button.className = route.type === 'connecting' ? 'flight-option-btn transfer' : 'flight-option-btn';

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

        // Update destination column styling
        this.updateDestinationColumnStyling(route.destination.destination_city_name);

        // Update flight options header with selected route details
        this.updateFlightOptionsHeader(route);

        // Add fade effect to maps
        this.addMapFadeEffect();

        // Draw the route on map (always show the whole route, no additional zoom)
        this.drawFlightPath(route);

        // Switch destination image
        this.switchDestinationImage(route.destination.destination_city_name);

        // Show flight details
        this.displayFlightDetails(route);
    }

    updateDestinationColumnStyling(selectedDestinationName) {
        // Get all destination column containers (the parent divs with class 'destination-column')
        const destinationColumns = document.querySelectorAll('.destination-column');

        destinationColumns.forEach(column => {
            // Get the header text to identify which destination this column represents
            const header = column.querySelector('.destination-header');
            if (header) {
                const columnDestinationName = header.textContent.trim();

                // Remove existing styling classes
                column.classList.remove('selected', 'unselected');

                // Apply appropriate styling based on selection
                if (columnDestinationName === selectedDestinationName) {
                    column.classList.add('selected');
                } else {
                    column.classList.add('unselected');
                }
            }
        });
    }

    updateFlightOptionsHeader(route) {
        const optionsTitle = document.getElementById('options-title');
        const originCity = route.segments[0].origin_city_name; // Extract city name only
        const destCity = route.destination.destination_city_name;
        const shuttleTime = this.greenOfficeLocation.shuttleTimes[destCity];
        const totalDurationWithShuttle = route.duration + shuttleTime;
        const totalDuration = this.formatDuration(totalDurationWithShuttle);

        optionsTitle.innerHTML = `${originCity} ${this.createDurationArrow(totalDuration)} <img src="assets/logo-final-2023-05-20.svg" class="inline-logo" alt="Green Office">&nbsp; <span class="via-text">via</span> ${destCity}`;
    }

    addMapFadeEffect() {
        const worldMap = document.getElementById('world-map');
        const destinationImage = document.getElementById('destination-image');

        // Add fade-out class (instant)
        worldMap.classList.add('fade-out');
        if (destinationImage) {
            destinationImage.classList.add('fade-out');
        }

        // Remove fade-out class after 0.5 seconds for gradual fade in
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
        const markerInfos = [];

        // Collect all marker information first
        segments.forEach((segment, index) => {
            const originCoords = this.parseCoordinates(segment.origin_airport_coordinates);
            const icon = index === 0 ? '🛫' : '🔄';
            const type = index === 0 ? 'origin' : 'transfer';
            const markerInfo = this.addMarker(originCoords, segment.origin_city_name, icon, type);
            markerInfos.push(markerInfo);
        });

        // Add final destination marker info
        const destCoords = this.parseCoordinates(route.destination.destination_airport_coordinates);
        const destMarkerInfo = this.addMarker(destCoords, route.destination.destination_city_name, '🛬', 'destination');
        markerInfos.push(destMarkerInfo);

        // Create labels with collision detection
        this.createLabelsWithCollisionDetection(markerInfos);

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

        // Airport to office connection removed per user request

        // Fit world map to show route with optimized zoom
        this.optimizeWorldMapZoom();
    }



    parseCoordinates(coordString) {
        const [lat, lng] = coordString.split(',').map(coord => parseFloat(coord.trim()));
        return [lat, lng];
    }

    addMarker(coords, cityName, icon, type) {
        // Add dot marker first with lower z-index to ensure it appears under labels
        const dotMarker = L.marker(coords, {
            icon: L.divIcon({
                html: `<div class="city-dot ${type}"></div>`,
                className: 'custom-div-icon',
                iconSize: [12, 12],
                iconAnchor: [6, 6]
            }),
            zIndexOffset: -1000 // Ensure dots appear below labels
        }).addTo(this.worldMap);

        // Store marker info for collision detection
        const markerInfo = {
            coords: coords,
            type: type,
            cityName: cityName,
            icon: icon,
            dotMarker: dotMarker
        };

        this.currentMarkers.push(dotMarker);
        return markerInfo; // Return info instead of marker for batch processing
    }


    createLabelsWithCollisionDetection(markerInfos) {
        const TARGET_SEPARATION = this.LABEL_SEPARATION_PIXELS; // Configurable separation distance in pixels



        // Convert coordinates to screen positions for collision detection
        const screenPositions = markerInfos.map(info => {
            const point = this.worldMap.latLngToContainerPoint(info.coords);
            const result = {
                ...info,
                screenX: point.x,
                screenY: point.y,
                adjustedY: 20 // Default Y anchor
            };

            return result;
        });

        // Get map bounds for constraint checking
        const mapSize = this.worldMap.getSize();
        const minY = 0;
        const maxY = mapSize.y;
        // Sort by screen Y position for processing
        screenPositions.sort((a, b) => a.screenY - b.screenY);

        // Adjust Y positions to avoid collisions

        for (let i = 0; i < screenPositions.length; i++) {
            const current = screenPositions[i];

            // Skip collision detection for origin - never shift origin
            if (current.type === 'origin') {
                continue;
            }

            let hasCollision = false;
            let collidingMarkers = [];

            // Check collision with all previous markers
            for (let j = 0; j < i; j++) {
                const previous = screenPositions[j];
                const yDiff = Math.abs(current.screenY - previous.screenY);



                if (yDiff < TARGET_SEPARATION) {
                    hasCollision = true;
                    collidingMarkers.push(previous);

                    if (this.DEBUG_COLLISION_DETECTION) {
                        console.log(`   ⚠️ COLLISION with ${previous.type} (${previous.cityName})!`);
                    }
                }
            }

            if (hasCollision) {
                // Calculate needed separation (use largest collision)
                const maxCollision = Math.max(...collidingMarkers.map(m =>
                    TARGET_SEPARATION - Math.abs(current.screenY - m.screenY)
                ));

                // Determine shift options
                const shiftUp = current.adjustedY - maxCollision;
                const shiftDown = current.adjustedY + maxCollision;

                if (this.DEBUG_COLLISION_DETECTION) {
                    console.log(`   📊 Max collision needs ${maxCollision.toFixed(1)}px separation`);
                    console.log(`   📊 Shift options: UP=${shiftUp.toFixed(1)}, DOWN=${shiftDown.toFixed(1)}`);
                }

                // Check bounds
                const upInBounds = (current.screenY + shiftUp) >= minY;
                const downInBounds = (current.screenY + shiftDown) <= maxY;

                if (this.DEBUG_COLLISION_DETECTION) {
                    console.log(`   🚧 Bounds check: UP=${upInBounds}, DOWN=${downInBounds}`);
                }

                // Determine preferred direction based on marker type and colliding positions
                let preferUp = false;

                if (current.type === 'transfer') {
                    // For transfer: prefer opposite direction from origin
                    const originMarker = screenPositions.find(m => m.type === 'origin');
                    if (originMarker) {
                        preferUp = current.screenY > originMarker.screenY; // If transfer below origin, prefer up

                        if (this.DEBUG_COLLISION_DETECTION) {
                            console.log(`   🔄 Transfer logic: origin at ${originMarker.screenY.toFixed(1)}, transfer at ${current.screenY.toFixed(1)} → prefer ${preferUp ? 'UP' : 'DOWN'}`);
                        }
                    }
                } else if (current.type === 'destination') {
                    // For destination: consider all colliding markers
                    const collidingYs = collidingMarkers.map(m => m.screenY);
                    const offendingHighY = Math.min(...collidingYs);
                    const offendingLowY = Math.max(...collidingYs);

                    if (offendingHighY < current.screenY) {
                        preferUp = true; // Colliding markers above, prefer up
                    } else if (offendingLowY > current.screenY) {
                        preferUp = false; // Colliding markers below, prefer down
                    } else {
                        preferUp = false; // Default to down
                    }

                    if (this.DEBUG_COLLISION_DETECTION) {
                        console.log(`   🎯 Destination logic: offending range [${offendingHighY.toFixed(1)}, ${offendingLowY.toFixed(1)}], destination at ${current.screenY.toFixed(1)} → prefer ${preferUp ? 'UP' : 'DOWN'}`);
                    }
                }

                // Apply preference with bounds override
                const oldAdjustedY = current.adjustedY;

                if (preferUp && upInBounds) {
                    current.adjustedY = shiftUp;
                    if (this.DEBUG_COLLISION_DETECTION) {
                        console.log(`   ⬆️ Preferred UP direction applied: ${current.adjustedY.toFixed(1)} (was ${oldAdjustedY})`);
                    }
                } else if (!preferUp && downInBounds) {
                    current.adjustedY = shiftDown;
                    if (this.DEBUG_COLLISION_DETECTION) {
                        console.log(`   ⬇️ Preferred DOWN direction applied: ${current.adjustedY.toFixed(1)} (was ${oldAdjustedY})`);
                    }
                } else if (upInBounds) {
                    current.adjustedY = shiftUp;
                    if (this.DEBUG_COLLISION_DETECTION) {
                        console.log(`   ⬆️ Bounds override - only UP valid: ${current.adjustedY.toFixed(1)} (was ${oldAdjustedY})`);
                    }
                } else if (downInBounds) {
                    current.adjustedY = shiftDown;
                    if (this.DEBUG_COLLISION_DETECTION) {
                        console.log(`   ⬇️ Bounds override - only DOWN valid: ${current.adjustedY.toFixed(1)} (was ${oldAdjustedY})`);
                    }
                } else {
                    if (this.DEBUG_COLLISION_DETECTION) {
                        console.log(`   🚫 No valid direction, keeping default position ${current.adjustedY}`);
                    }
                }
            } else if (this.DEBUG_COLLISION_DETECTION) {
                console.log(`   ✅ No collisions detected, keeping default Y anchor: ${current.adjustedY}`);
            }
        }

        // Create label markers with adjusted positions
        if (this.DEBUG_COLLISION_DETECTION) {
            console.log('\n🏗️ === LABEL CREATION PHASE ===');
        }

        screenPositions.forEach((info, index) => {
            if (this.DEBUG_COLLISION_DETECTION) {
                console.log(`🏷️ Creating label ${index + 1}/${screenPositions.length}: ${info.type} (${info.cityName})`);
                console.log(`   📍 Position: [${info.coords[0].toFixed(2)}, ${info.coords[1].toFixed(2)}]`);
                console.log(`   📺 Screen: [${info.screenX.toFixed(1)}, ${info.screenY.toFixed(1)}]`);
                console.log(`   ⚓ Anchor: [-5, ${info.adjustedY}]`);
            }

            const labelMarker = L.marker(info.coords, {
                icon: L.divIcon({
                    html: `<div class="custom-marker ${info.type}">
                        <span class="marker-label">${info.cityName}</span>
                        <span class="marker-icon">${info.icon}</span>
                    </div>`,
                    className: 'custom-div-icon',
                    iconSize: [120, 40],
                    iconAnchor: [-5, info.adjustedY]
                }),
                zIndexOffset: 1000 // Ensure labels appear above dots
            }).addTo(this.worldMap);

            this.currentMarkers.push(labelMarker);
        });


    }

    optimizeWorldMapZoom() {
        if (this.currentMarkers.length === 0) return;

        // Cancel any pending zoom operation
        if (this.zoomTimeout) {
            clearTimeout(this.zoomTimeout);
        }

        // Delay the zoom operation slightly to ensure map state is stable
        this.zoomTimeout = setTimeout(() => {
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

            // Fit bounds with calculated padding - single call only
            this.worldMap.fitBounds(bounds.pad(padding), {
                maxZoom: 8, // Prevent over-zooming
                animate: true,
                duration: 1.0
            });
        }, 50); // Small delay to ensure stability
    }

    calculateBoundsDistance(bounds) {
        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        return this.calculateDistance([sw.lat, sw.lng], [ne.lat, ne.lng]);
    }

    drawDirectPath(start, end) {
        // Draw straight lines with black color (thin and dotted)
        const path = L.polyline([start, end], {
            color: '#000000',  // Black color
            weight: 1, // Thin line
            opacity: 0.5, // More subtle
            dashArray: '3, 6' // Dotted pattern: 3px dash, 6px gap
        }).addTo(this.worldMap);

        if (!this.currentPath) {
            this.currentPath = [];
        }
        this.currentPath.push(path);
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
        const destCity = route.destination.destination_city_name;

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

        // Don't reset map view here - let optimizeWorldMapZoom handle it
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

// Marker styles are now handled in styles.css to prevent conflicts

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new FlightPathVisualizer();
});
