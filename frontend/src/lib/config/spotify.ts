// ⬇️⬇️⬇️ Set VITE_SPOTIFY_CLIENT_ID in frontend/.env.local
// 1. Go to https://developer.spotify.com/dashboard
// 2. Create an app (it's free)
// 3. Copy the Client ID into frontend/.env.local:
//    VITE_SPOTIFY_CLIENT_ID=your_client_id_here
// 4. In your Spotify app settings, add these Redirect URIs:
//    - http://localhost:5173/jam   (for local dev)
//    - https://your-domain.com/jam (for production)

export const SPOTIFY_CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID || '';
