# ✈️ Flight Path Visualizer

A stunning, offline-capable web application that visualizes flight routes between cities around the world using interactive maps and beautiful curved flight paths.

## Features

- **Interactive World Map**: Powered by Leaflet.js with Natural Earth GeoJSON data
- **Beautiful Flight Paths**: Smooth, curved routes using Leaflet.Curve plugin
- **Offline Capability**: Runs completely offline with bundled dependencies
- **Responsive Design**: Modern, mobile-friendly interface
- **Real Flight Data**: Comprehensive flight information including airlines and durations
- **Stunning Visuals**: Vibrant blue and gold color scheme with smooth animations

## Project Structure

```
affiliateMapSite/
├── index.html              # Main HTML file
├── styles.css              # Modern CSS styling
├── script.js               # JavaScript functionality
├── flights.jsonl           # Flight data in JSONL format (~100+ routes)
├── lib/                    # JavaScript libraries
│   ├── leaflet.js          # Leaflet.js mapping library
│   ├── leaflet.css         # Leaflet CSS styles
│   └── leaflet.curve.js    # Leaflet.Curve plugin for curved paths
├── data/                   # Map data
│   └── ne_110m_admin_0_countries.geojson  # Natural Earth world map
├── assets/                 # Additional assets (optional)
└── README.md              # This file
```

## How to Use

1. **Open the Website**: Simply open `index.html` in any modern web browser
2. **Select Origin**: Choose your departure city from the dropdown menu
3. **Select Destination**: Pick your destination from the filtered list
4. **View Route**: Watch as a beautiful curved flight path appears on the map
5. **Flight Details**: See comprehensive flight information below the map
6. **Clear Route**: Use the clear button to reset and try another route

## Technical Details

### Dependencies
- **Leaflet.js v1.9.4**: Interactive mapping library
- **Leaflet.Curve**: Plugin for drawing curved flight paths
- **Natural Earth GeoJSON**: Simplified world map data for offline use

### Browser Compatibility
- Chrome/Edge 80+
- Firefox 75+
- Safari 13+
- Mobile browsers (iOS Safari, Chrome Mobile)

### Performance
- Lightweight design (~2MB total including map data)
- Fast loading with optimized JSON parsing
- Smooth animations and transitions
- Responsive design for all screen sizes

## Data Sources

- **Flight Data**: Custom curated dataset with major international routes
- **Map Data**: Natural Earth (ne_110m_admin_0_countries.geojson)
- **Coordinates**: Airport coordinate data for accurate positioning

## Customization

### Adding New Routes
Edit `flights.jsonl` to add new flight routes. Each line should be a separate JSON object following this structure:

```json
{
  "destination_city_name": "City Name",
  "destination_country": "Country",
  "destination_airport_iata": "XXX",
  "destination_airport_coordinates": "lat,lng",
  "direct_services": [
    {
      "origin_city_name": "Origin City",
      "origin_country": "Origin Country",
      "origin_airport_iata": "YYY",
      "origin_airport_coordinates": "lat,lng",
      "flight_duration_minutes": 480,
      "airlines": [
        {
          "airline_name": "Airline Name",
          "service_start_month": "Jan",
          "service_end_month": "Dec",
          "status": "Current",
          "days_per_week": 7
        }
      ]
    }
  ]
}
```

### Styling
Modify `styles.css` to customize:
- Color schemes
- Animation effects
- Layout and spacing
- Responsive breakpoints

### Map Appearance
Adjust map styling in `script.js`:
- Country fill colors
- Border styles
- Flight path colors and weights
- Marker designs

## Credits

- **Leaflet.js**: © Vladimir Agafonkin, CloudMade
- **Natural Earth**: Free vector and raster map data
- **Leaflet.Curve**: © elfalem for curved path functionality

## License

This project is open source and available under the MIT License.

---

**Enjoy exploring the world's flight routes! ✈️🌍**
