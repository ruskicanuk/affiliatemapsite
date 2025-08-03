# Refactored "Via X" Button Logic - Implementation Summary

## Overview
The "Via X" button logic has been completely refactored according to the specified algorithm using proper set operations and intersection logic to find transfer airports.

## Key Changes Made

### 1. Database Cleanup
- **Updated data source**: Changed from `flights.jsonl` to `flightsFixed.jsonl` (cleaned version with duplicates merged)
- **Duplicates removed**: Paris, France and Washington, United States entries were merged
- **Records reduced**: From 103 to 101 flight records

### 2. Algorithm Refactor
Completely replaced the old `findRoutesForDestination()` function with the new algorithm:

#### Old Algorithm Issues:
- Used bidirectional lookup with candidate cities
- Limited discovery of connection points
- Complex and potentially missed valid routes

#### New Algorithm (Per Specifications):
1. **Step 1**: Get `ServicesStartingAirport1` - airports that Starting Airport serves directly
2. **Step 2**: Get `ServicesStartingAirport2` - airports that have Starting Airport as a service
3. **Step 3**: Combine into `ServicesStartingAirportCombined` (union operation)
4. **Step 4-6**: Repeat for each ending airport (POP, STI, SDQ, PUJ) to get `ServicesEndingAirportCombined`
5. **Find Intersection**: Transfer airports = intersection of starting and ending airport services
6. **Direct flights first**: Always ensure direct flights appear at the top of each column

### 3. New Helper Functions Added

#### `getDirectServicesFromAirport(airportKey)`
- Returns airports that a given airport serves directly
- Implements "ServicesX1" logic

#### `getAirportsServingOrigin(originKey)`
- Returns airports that have the given airport as a service
- Implements "ServicesX2" logic

#### `combineAirportSets(set1, set2)`
- Performs union operation on two sets of airports
- Combines ServicesX1 and ServicesX2

#### `findIntersection(set1, set2)`
- Finds intersection between starting and ending airport services
- These intersections become the "Via X" transfer options

#### `findDirectFlight(originKey, destinationKey)`
- Simplified direct flight lookup
- Replaces complex bidirectional logic

#### `getFlightDetails(originKey, destinationKey, services1, services2)`
- Gets flight details for route legs
- Handles both forward and reverse flight lookups
- Used for displaying airline service details

### 4. Terminology Alignment
The code now uses the exact terminology specified:
- **Starting Airport**: User input from dropdown
- **Transfer Airport**: Intersection airports that serve as connections
- **Ending Airport**: One of POP, STI, SDQ, PUJ
- **FlightRecordsAll**: flightsFixed.jsonl file
- **FlightRecordsTarget**: Individual destination records
- **TargetAirportToServiceAirportRecord**: Specific origin-destination service records

### 5. Flight Details Display
- **Flight 1**: Uses union of ServicesStartingAirport1 and ServicesStartingAirport2
- **Flight 2**: Uses union of ServicesEndingAirport1 and ServicesEndingAirport2
- Maintains existing airline service detail display format

## Volume Factor Calculation Update

### New Duration-Weighted Volume Calculation
The volume factor calculation has been completely refactored to provide more accurate flight volume representation:

#### For Direct Flights:
- **Single segment calculation**: Uses existing volume calculation for the direct flight
- **Formula**: `volume = Σ(months_per_year × flights_per_week) / 84`

#### For Connecting Flights (NEW):
- **Separate calculations**: Each flight leg gets its own volume factor
- **Duration weighting**: Overall volume is weighted by flight duration (excluding shuttle)
- **Formula**: `overall_volume = (weight1 × volume1) + (weight2 × volume2)`

#### Example: Winnipeg → Calgary → Puerto Plata
```
Flight 1 (Winnipeg → Calgary):
- 5 airlines: 3 fly 7 days/week year-round, 2 fly 3 days/week year-round
- Volume1 = (12×7 + 12×7 + 12×7 + 12×3 + 12×3) / 84 = 3.85

Flight 2 (Calgary → Puerto Plata):
- Volume2 = 0.5 (calculated similarly)

Duration Weights:
- Flight 1 duration: 120 minutes (25% of total)
- Flight 2 duration: 360 minutes (75% of total)

Overall Volume Factor:
- 0.25 × 3.85 + 0.75 × 0.5 = 1.34
```

#### Efficiency Ratio Update:
- **New formula**: `efficiency_ratio = total_duration / overall_volume_factor`
- **Sorting**: Direct flights first, then connecting flights by efficiency (lowest to highest)
- **UI Display**: The overall volume factor is shown in the "Daily Flight Volume" bar

## Expected Improvements

### 1. More Comprehensive Route Discovery
- **Better coverage**: The intersection-based approach should find more valid "Via X" options
- **Calgary → Santiago "via Boston"**: Should now appear if Boston serves both Calgary and Santiago routes
- **Systematic approach**: No longer relies on bidirectional guessing

### 2. More Accurate Volume Representation
- **Individual flight volumes**: Each leg calculated separately for connecting flights
- **Duration-weighted averaging**: Longer flights have more influence on overall volume
- **Better sorting**: Routes sorted by true efficiency (duration vs. volume)

### 3. Cleaner Data Structure
- **Eliminated duplicates**: Merged duplicate destination records
- **Consistent data**: All flight information properly consolidated

### 4. Performance Benefits
- **Set operations**: More efficient than nested loops
- **Clear logic flow**: Easier to debug and maintain
- **Predictable results**: Deterministic intersection-based approach

## Testing Recommendations

1. **Test Calgary → Santiago**: Verify "via Boston" button appears
2. **Test major hubs**: Check that cities like Toronto, New York, Miami show as transfer options
3. **Test direct flights**: Ensure direct flights always appear first
4. **Test all 4 destinations**: Verify each column shows appropriate "Via X" options
5. **Test flight details**: Confirm airline information displays correctly for both legs
6. **Test volume calculations**:
   - Check Winnipeg → Calgary → Puerto Plata for debug logging
   - Verify volume bars reflect duration-weighted calculations
   - Confirm connecting flights are sorted by efficiency ratio
7. **Test sorting**: Verify routes are ordered by efficiency (duration/volume) with direct flights first

## Debugging Features

The new algorithm provides clear debugging points:
- Log `servicesStartingAirportCombined` to see all airports reachable from origin
- Log `servicesEndingAirportCombined` to see all airports that can reach destination
- Log `transferAirports` to see the intersection (actual "Via X" options)
- **Volume calculation debugging**: Special logging for Winnipeg → Calgary → Puerto Plata route showing:
  - Individual flight volumes and durations
  - Duration weights for each leg
  - Overall volume factor calculation
  - Final efficiency ratio

## Files Modified

1. **script.js**: Complete refactor of route finding logic
2. **flightsFixed.jsonl**: New cleaned flight data file (created by analyze_duplicates.js)

## Files Created

1. **analyze_duplicates.js**: Script to identify and merge duplicate destinations
2. **via_city_button_logic_pseudocode.md**: Detailed pseudo code documentation
3. **refactored_via_button_logic_summary.md**: This summary document

The refactored implementation should provide more comprehensive and reliable "Via X" button options while maintaining the existing user interface and flight details display functionality.
