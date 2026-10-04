/**
 * Geographic 3D Building Footprints for T. Nagar, Chennai, Tamil Nadu.
 * Coordinates centered around Usman Road, Pondy Bazaar, Panagal Park (13.0418 N, 80.2341 E).
 */

export const CHENNAI_TNAGAR_BUILDINGS_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    // Commercial Towers on Usman Road
    {
      type: 'Feature',
      properties: { name: 'Saravana Stores Tower', height: 42, levels: 12 },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [80.2332, 13.0410],
          [80.2338, 13.0410],
          [80.2338, 13.0415],
          [80.2332, 13.0415],
          [80.2332, 13.0410],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'RMKV Silks Complex', height: 38, levels: 10 },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [80.2342, 13.0412],
          [80.2347, 13.0412],
          [80.2347, 13.0417],
          [80.2342, 13.0417],
          [80.2342, 13.0412],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Pothys Super Store', height: 45, levels: 13 },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [80.2325, 13.0422],
          [80.2331, 13.0422],
          [80.2331, 13.0427],
          [80.2325, 13.0427],
          [80.2325, 13.0422],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Chennai Silks Commercial Hub', height: 35, levels: 9 },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [80.2348, 13.0425],
          [80.2354, 13.0425],
          [80.2354, 13.0430],
          [80.2348, 13.0430],
          [80.2348, 13.0425],
        ]],
      },
    },

    // Pondy Bazaar Shopping Arcades
    {
      type: 'Feature',
      properties: { name: 'Pondy Bazaar Pedestrian Plaza Arcade A', height: 18, levels: 5 },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [80.2360, 13.0405],
          [80.2368, 13.0405],
          [80.2368, 13.0409],
          [80.2360, 13.0409],
          [80.2360, 13.0405],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Pondy Bazaar Pedestrian Plaza Arcade B', height: 22, levels: 6 },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [80.2370, 13.0408],
          [80.2377, 13.0408],
          [80.2377, 13.0412],
          [80.2370, 13.0412],
          [80.2370, 13.0408],
        ]],
      },
    },

    // GN Chetty Road Office & Hotel Towers
    {
      type: 'Feature',
      properties: { name: 'G.N. Chetty Heights', height: 50, levels: 14 },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [80.2350, 13.0440],
          [80.2357, 13.0440],
          [80.2357, 13.0446],
          [80.2350, 13.0446],
          [80.2350, 13.0440],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'T. Nagar IT & Business Centre', height: 40, levels: 11 },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [80.2362, 13.0445],
          [80.2369, 13.0445],
          [80.2369, 13.0451],
          [80.2362, 13.0451],
          [80.2362, 13.0445],
        ]],
      },
    },

    // Venkatanarayana Road Institutions & Residences
    {
      type: 'Feature',
      properties: { name: 'Venkatanarayana Residential Complex 1', height: 28, levels: 8 },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [80.2320, 13.0395],
          [80.2326, 13.0395],
          [80.2326, 13.0401],
          [80.2320, 13.0401],
          [80.2320, 13.0395],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Venkatanarayana Residential Complex 2', height: 25, levels: 7 },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [80.2328, 13.0390],
          [80.2334, 13.0390],
          [80.2334, 13.0396],
          [80.2328, 13.0396],
          [80.2328, 13.0390],
        ]],
      },
    },

    // Panagal Park Surrounding Establishments
    {
      type: 'Feature',
      properties: { name: 'Panagal Commercial Pavilion North', height: 20, levels: 5 },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [80.2335, 13.0432],
          [80.2341, 13.0432],
          [80.2341, 13.0436],
          [80.2335, 13.0436],
          [80.2335, 13.0432],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Panagal Commercial Pavilion West', height: 24, levels: 6 },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [80.2315, 13.0428],
          [80.2320, 13.0428],
          [80.2320, 13.0434],
          [80.2315, 13.0434],
          [80.2315, 13.0428],
        ]],
      },
    },

    // South Boag Road Residential Enclave
    {
      type: 'Feature',
      properties: { name: 'Boag Road Apartments', height: 22, levels: 6 },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [80.2372, 13.0420],
          [80.2378, 13.0420],
          [80.2378, 13.0425],
          [80.2372, 13.0425],
          [80.2372, 13.0420],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { name: 'Mangesh Street Commercial Block', height: 26, levels: 7 },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [80.2380, 13.0430],
          [80.2386, 13.0430],
          [80.2386, 13.0435],
          [80.2380, 13.0435],
          [80.2380, 13.0430],
        ]],
      },
    },

    // Anna Salai Junction Landmarks
    {
      type: 'Feature',
      properties: { name: 'Anna Salai Gateway Tower', height: 55, levels: 16 },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [80.2385, 13.0450],
          [80.2392, 13.0450],
          [80.2392, 13.0457],
          [80.2385, 13.0457],
          [80.2385, 13.0450],
        ]],
      },
    },
  ],
};
