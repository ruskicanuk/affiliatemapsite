# "Via X" City Button Logic - Pseudo Code

## Overview
This document describes the algorithm for determining which "Via X" city buttons to show under each destination column. The goal is to find all possible connecting flights from an origin city to each Dominican Republic destination through intermediate cities.

## Current Implementation Analysis

### Main Function: `findRoutesForDestination(originKey, destination)`

```pseudocode
FUNCTION findRoutesForDestination(originKey, destination):
    routes = []
    
    // Step 1: Find the destination data in flight database
    destData = FIND destination in flightData WHERE 
        destination_city_name = destination.name AND 
        destination_country = destination.country
    
    IF destData NOT FOUND:
        RETURN empty routes
    
    // Step 2: Build candidate connection cities using bidirectional lookup
    candidateCities = new Set()
    
    // 2a: Add cities that the origin can reach directly
    FOR EACH destination_record IN flightData:
        FOR EACH service IN destination_record.direct_services:
            serviceOriginKey = service.origin_city_name + ", " + service.origin_country
            IF serviceOriginKey = originKey:
                candidateCity = destination_record.destination_city_name + ", " + destination_record.destination_country
                candidateCities.ADD(candidateCity)
    
    // 2b: Add cities that can reach the target destination directly
    FOR EACH service IN destData.direct_services:
        candidateCity = service.origin_city_name + ", " + service.origin_country
        candidateCities.ADD(candidateCity)
    
    // Step 3: Check for direct flight (bidirectional)
    directFlight = findBidirectionalFlight(originKey, destination.name + ", " + destination.country)
    IF directFlight EXISTS:
        routes.ADD({
            type: 'direct',
            duration: directFlight.flight_duration_minutes,
            segments: [directFlight],
            destination: destData
        })
    
    // Step 4: Find connecting routes through candidate cities
    FOR EACH candidateCity IN candidateCities:
        // Skip if candidate is origin or destination
        IF candidateCity = originKey OR candidateCity = destination.name + ", " + destination.country:
            CONTINUE
        
        // Find first leg: origin → via city
        firstLeg = findBidirectionalFlight(originKey, candidateCity)
        IF firstLeg NOT EXISTS:
            CONTINUE
        
        // Find second leg: via city → destination
        secondLeg = findBidirectionalFlight(candidateCity, destination.name + ", " + destination.country)
        IF secondLeg NOT EXISTS:
            CONTINUE
        
        // Create connecting route
        viaCity = EXTRACT city name from candidateCity (before comma)
        totalDuration = firstLeg.flight_duration_minutes + secondLeg.flight_duration_minutes
        
        // Check for duplicate routes
        existingRoute = FIND route IN routes WHERE 
            route.type = 'connecting' AND 
            route.via = viaCity AND 
            route.duration = totalDuration
        
        IF existingRoute NOT FOUND:
            routes.ADD({
                type: 'connecting',
                duration: totalDuration,
                segments: [firstLeg, secondLeg],
                destination: destData,
                via: viaCity
            })
    
    // Step 5: Calculate efficiency and sort routes
    FOR EACH route IN routes:
        volume = calculateRouteVolume(route)
        route.volumeFactor = MAX(volume, 0.1)
        route.efficiencyRatio = route.duration / route.volumeFactor
    
    // Step 6: Sort and limit results
    directFlights = FILTER routes WHERE type = 'direct'
    connectingFlights = FILTER routes WHERE type = 'connecting'
    
    SORT connectingFlights BY efficiencyRatio ASC
    
    sortedRoutes = CONCATENATE(directFlights, connectingFlights)
    RETURN FIRST 30 routes from sortedRoutes
END FUNCTION
```

### Helper Function: `findBidirectionalFlight(originKey, destinationKey)`

```pseudocode
FUNCTION findBidirectionalFlight(originKey, destinationKey):
    // Parse destination key
    [destCity, destCountry] = SPLIT destinationKey BY ", "
    
    // Find destination data
    destData = FIND destination IN flightData WHERE 
        destination_city_name = destCity AND 
        destination_country = destCountry
    
    // Look for forward flight (origin → destination)
    forwardFlight = NULL
    IF destData EXISTS:
        forwardFlight = FIND service IN destData.direct_services WHERE
            service.origin_city_name + ", " + service.origin_country = originKey
    
    // Parse origin key
    [originCity, originCountry] = SPLIT originKey BY ", "
    
    // Find origin data
    originData = FIND destination IN flightData WHERE 
        destination_city_name = originCity AND 
        destination_country = originCountry
    
    // Look for reverse flight (destination → origin, then reverse)
    reverseFlight = NULL
    IF originData EXISTS:
        reverseFlight = FIND service IN originData.direct_services WHERE
            service.origin_city_name + ", " + service.origin_country = destinationKey
    
    // Combine results
    IF forwardFlight EXISTS AND reverseFlight EXISTS:
        // Take more conservative option (longer duration, fewer days)
        RETURN {
            ...forwardFlight,
            flight_duration_minutes: MAX(forwardFlight.duration, reverseFlight.duration),
            airlines: combineAirlineData([forwardFlight], [reverseFlight])
        }
    
    IF reverseFlight EXISTS AND forwardFlight NOT EXISTS:
        // Swap origin/destination to match requested direction
        RETURN {
            ...reverseFlight,
            origin_city_name: originCity,
            origin_country: originCountry,
            origin_airport_iata: originData.destination_airport_iata,
            origin_airport_coordinates: originData.destination_airport_coordinates
        }
    
    RETURN forwardFlight
END FUNCTION
```

## Potential Issues and Missing "Via X" Buttons

### Issue 1: Limited Candidate City Discovery
**Problem**: The current algorithm only considers cities that are either:
1. Directly reachable from the origin, OR
2. Can directly reach the destination

**Missing Case**: Cities that could serve as connections but don't appear in either list.

**Example**: Calgary → Santiago "via Boston"
- If Calgary doesn't have direct flights to Boston in the data
- AND Boston → Santiago exists but Boston isn't in Calgary's direct destinations
- THEN Boston won't be considered as a candidate

### Issue 2: Data Structure Limitations
**Problem**: The JSONL structure stores flights as destination-centric records. Each record contains all origins that can reach that destination.

**Missing Case**: If an origin city doesn't appear in any destination record, it won't be discovered as a potential connection point.

### Issue 3: Bidirectional Flight Logic
**Problem**: The `findBidirectionalFlight` function may fail to find valid connections due to:
1. Asymmetric flight data (A→B exists but B→A doesn't)
2. Different airport codes for the same city
3. Seasonal flight variations

## Improved Algorithm Suggestions

### Enhanced Candidate Discovery
```pseudocode
FUNCTION findAllCandidateCities(originKey, destinationKey):
    candidateCities = new Set()
    
    // Method 1: Direct connections from origin
    FOR EACH destRecord IN flightData:
        FOR EACH service IN destRecord.direct_services:
            IF service.origin_city_name + ", " + service.origin_country = originKey:
                candidateCities.ADD(destRecord.destination_city_name + ", " + destRecord.destination_country)
    
    // Method 2: Direct connections to destination
    destData = FIND destination WHERE matches destinationKey
    FOR EACH service IN destData.direct_services:
        candidateCities.ADD(service.origin_city_name + ", " + service.origin_country)
    
    // Method 3: Major hub cities (always consider)
    majorHubs = ["New York, USA", "London, United Kingdom", "Paris, France", 
                 "Amsterdam, Netherlands", "Frankfurt, Germany", "Madrid, Spain",
                 "Toronto, Canada", "Miami, USA", "Boston, USA"]
    
    FOR EACH hub IN majorHubs:
        candidateCities.ADD(hub)
    
    // Method 4: Cities with high connectivity (appear in many routes)
    cityConnectivity = COUNT connections for each city
    topConnectedCities = GET top 20 cities by connectivity
    FOR EACH city IN topConnectedCities:
        candidateCities.ADD(city)
    
    RETURN candidateCities
END FUNCTION
```

### Multi-hop Connection Discovery
```pseudocode
FUNCTION findMultiHopConnections(originKey, destinationKey, maxHops = 2):
    routes = []
    
    // Use breadth-first search to find connections
    queue = [{city: originKey, path: [], totalDuration: 0}]
    visited = new Set()
    
    WHILE queue NOT EMPTY AND routes.length < 50:
        current = queue.DEQUEUE()
        
        IF current.path.length >= maxHops:
            CONTINUE
        
        IF current.city IN visited:
            CONTINUE
        
        visited.ADD(current.city)
        
        // Find all cities reachable from current city
        reachableCities = findDirectDestinations(current.city)
        
        FOR EACH nextCity IN reachableCities:
            flight = findBidirectionalFlight(current.city, nextCity)
            IF flight NOT EXISTS:
                CONTINUE
            
            newPath = current.path + [current.city]
            newDuration = current.totalDuration + flight.flight_duration_minutes
            
            IF nextCity = destinationKey:
                // Found complete route
                routes.ADD({
                    type: 'connecting',
                    duration: newDuration,
                    path: newPath + [nextCity],
                    via: EXTRACT city names from newPath[1:-1]
                })
            ELSE:
                // Add to queue for further exploration
                queue.ENQUEUE({
                    city: nextCity,
                    path: newPath,
                    totalDuration: newDuration
                })
    
    RETURN routes
END FUNCTION
```

## Debugging Steps for Missing Routes

1. **Log Candidate Cities**: Add console logging to see which cities are being considered as candidates
2. **Verify Flight Data**: Check if both legs of the connection exist in the flight data
3. **Test Bidirectional Logic**: Verify that `findBidirectionalFlight` works for both directions
4. **Check Data Completeness**: Ensure all major connection cities are represented in the flight data
5. **Validate Route Filtering**: Confirm that routes aren't being filtered out by efficiency calculations

## Example Debug Output
```
Origin: Calgary, Canada
Destination: Santiago, Dominican Republic

Candidate Cities Found:
- Toronto, Canada (from Calgary direct routes)
- Montreal, Canada (from Calgary direct routes)
- New York, USA (to Santiago direct routes)
- Boston, USA (to Santiago direct routes)
- Miami, USA (to Santiago direct routes)

Testing Connections:
✓ Calgary → Toronto: Found (255 min)
✓ Toronto → Santiago: Found (255 min)
✗ Calgary → Boston: Not found
✓ Calgary → Montreal: Found (240 min)
✗ Montreal → Santiago: Not found

Result: Only "via Toronto" button shown
Missing: "via Boston" (Calgary→Boston flight not in data)
```
