# FloodTwin · Urban Flood Digital Twin (Chennai Pilot)

**FloodTwin** is an AI-powered, physics-guided hyper-local urban flood simulation and emergency response platform tailored for **T. Nagar, Chennai**.

---

## 🌟 Key Features

1. **Google Maps 3D Satellite Integration**
   - Renders 3D photorealistic satellite terrain and buildings for Chennai T. Nagar using the official Google Maps Platform JS API (`v=beta`).
   - Seamless standalone fallback mode using **Deck.gl + Carto Dark** basemap when `VITE_GOOGLE_MAPS_API_KEY` is not provided.

2. **Hydrodynamic Simulation Engine**
   - 0–3 hour predictive flood timeline with step-by-step playback controls (Play, Pause, Reset, Slider).
   - Real-time road flood depth visualization (Safe, Caution, High, Critical).
   - SWMM-inspired drainage network status monitoring with 3-tier confidence tracking.

3. **Scenario & What-If Analysis**
   - Test scenarios: *Normal*, *Moderate Rain*, *Heavy Monsoon*, and *Extreme Burst*.
   - What-If Blockage Simulator: Simulate drain channel blockages (0–100%) and instantly compute downstream flood spillover.

4. **Emergency Flood-Safe Routing**
   - Multimodal route computation (Ambulance, Bus, Car, Pedestrian) avoiding submerged road segments.
   - Interactive origin and destination selection directly on the 3D map.

5. **Automated Alerting**
   - Time-to-Flood (TTF) and Time-to-Critical (TTC) predictive warnings.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- Python 3.10+ (for backend)

### 1. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will run at `http://localhost:5173`.

### 2. Environment Variables

Create a `.env` file in the `frontend/` directory (refer to `.env.example`):

```env
# Optional: Enables official Google 3D Satellite Map mode
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
VITE_GOOGLE_MAPS_MAP_ID=your_map_id_here
```

> **Note**: If `VITE_GOOGLE_MAPS_API_KEY` is omitted, FloodTwin automatically runs in standalone mode using Deck.GL and Carto Dark tiles with 100% feature support!

### 3. Backend Setup (Optional)

```bash
cd backend
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
python main.py
```

The backend server runs on `http://localhost:8000`.

---

## 🛠 Tech Stack

- **Frontend**: React 18, Vite 8, Deck.gl, Google Maps Platform API (`v=beta`), Lucide Icons.
- **Styling**: Vanilla CSS with dark mode aesthetic, glassmorphism, responsive panels, and smooth micro-animations.
- **Backend**: FastAPI, Uvicorn, Python Hydrodynamic Solver engine.
- **Deployment**: Vercel ready (`vercel.json` included).

---

## 🛡 Security & Deployment

- Secrets are strictly managed via standard environment variables (`VITE_GOOGLE_MAPS_API_KEY`).
- Security headers and Vite build isolation configured.
- No user-facing API key forms or sensitive client storage.

---

## 📜 License
MIT License. Developed for SIH 2026.
