<script lang="ts">
  import { onMount } from 'svelte';
  import SpotifyJam from '$lib/components/SpotifyJam.svelte';
  import { SPOTIFY_CLIENT_ID } from '$lib/config/spotify';

  let isPopupCallback = $state(false);
  let popupError = $state('');

  onMount(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const spotifyError = params.get('error');

    if ((code || spotifyError) && window.opener) {
      isPopupCallback = true;
      handlePopupCallback(code, spotifyError);
    }
  });

  async function handlePopupCallback(code: string | null, spotifyError: string | null) {
    if (spotifyError) {
      window.opener?.postMessage({ type: 'SPOTIFY_CONNECTED', error: spotifyError }, window.location.origin);
      setTimeout(() => window.close(), 500);
      return;
    }

    const verifier = sessionStorage.getItem('spotify_code_verifier');
    if (!code || !verifier) {
      window.opener?.postMessage({ type: 'SPOTIFY_CONNECTED', error: 'Missing code or verifier' }, window.location.origin);
      setTimeout(() => window.close(), 500);
      return;
    }

    try {
      const redirectUri = `${window.location.origin}/jam`;

      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          client_id: SPOTIFY_CLIENT_ID,
          code_verifier: verifier
        })
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`Token exchange failed: ${errText}`);
      }

      const data = await tokenRes.json();

      const storeRes = await fetch('/api/spotify/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresIn: data.expires_in
        })
      });

      if (!storeRes.ok) throw new Error('Failed to save tokens on server');

      window.opener?.postMessage({ type: 'SPOTIFY_CONNECTED' }, window.location.origin);
    } catch (err) {
      popupError = err instanceof Error ? err.message : String(err);
      window.opener?.postMessage({ type: 'SPOTIFY_CONNECTED', error: err.message }, window.location.origin);
    } finally {
      sessionStorage.removeItem('spotify_code_verifier');
      setTimeout(() => window.close(), 800);
    }
  }
</script>

{#if isPopupCallback}
  <div class="min-h-screen flex flex-col items-center justify-center gap-3 bg-rina-bg text-white">
    <div class="w-8 h-8 border-2 border-rina-rose border-t-transparent rounded-full animate-spin"></div>
    <p class="text-sm text-rina-slate">Connecting to Spotify…</p>
    {#if popupError}
      <p class="text-xs text-red-400 max-w-xs text-center">{popupError}</p>
    {/if}
  </div>
{:else}
  <div class="px-3 py-4 space-y-4">
    <div class="px-1">
      <h1 class="text-xl font-bold text-white">Spotify Jam</h1>
      <p class="text-xs text-rina-slate-dark mt-0.5">Synchronized listening with dual Premium accounts</p>
    </div>
    <SpotifyJam />
  </div>
{/if}
