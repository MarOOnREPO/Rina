<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading, currentUser } from '$lib/stores/auth.svelte';
  import { socketStore } from '$lib/stores/socket.svelte';
  import { fade, scale } from 'svelte/transition';
  import GlassCard from '$lib/components/GlassCard.svelte';
  import { api } from '$lib/utils/api';

  let localVideo = $state<HTMLVideoElement | undefined>(undefined);
  let remoteVideo = $state<HTMLVideoElement | undefined>(undefined);
  let peerConnection: RTCPeerConnection | null = null;

  let localStream = $state<MediaStream | null>(null);
  let remoteStream = $state<MediaStream | null>(null);
  let callState: 'idle' | 'calling' | 'incoming' | 'connected' | 'ended' = $state('idle');
  let error = $state('');
  let audioEnabled = $state(true);
  let videoEnabled = $state(true);

  let iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  let incomingOffer = $state<RTCSessionDescriptionInit | null>(null);
  let incomingSender = $state('');
  let incomingDisplayName = $state('');
  let endedResetTimeout = $state<ReturnType<typeof setTimeout> | null>(null);

  async function loadIceServers() {
    try {
      const config = await api.get<{ iceServers: RTCIceServer[] }>('/rtc/ice-servers');
      iceServers = config.iceServers;
    } catch (err) {
      console.warn('[WebRTC] Failed to load TURN config, using STUN only');
    }
  }

  function createPeerConnection() {
    const pc = new RTCPeerConnection({ iceServers });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const partner = currentUser()?.partner;
        if (!partner) return;
        socketStore.send('webrtc:ice-candidate', {
          target: partner.username,
          candidate: event.candidate.toJSON()
        });
      }
    };

    pc.ontrack = (event) => {
      if (event.streams[0]) {
        remoteStream = event.streams[0];
        callState = 'connected';
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        endCall();
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        pc.restartIce();
      }
    };

    return pc;
  }

  async function startCall() {
    let stream: MediaStream | null = null;
    try {
      error = '';
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStream = stream;

      peerConnection = createPeerConnection();
      localStream.getTracks().forEach((track) => {
        peerConnection!.addTrack(track, localStream!);
      });

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const partner = currentUser()?.partner;
      if (!partner) {
        error = 'No partner found. Please check your partnership setup.';
        endCall();
        return;
      }

      socketStore.send('webrtc:offer', {
        target: partner.username,
        offer: { type: offer.type, sdp: offer.sdp! }
      });

      callState = 'calling';
    } catch (err) {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      localStream = null;
      error = 'Could not access camera/microphone. Please check permissions.';
      console.error('[WebRTC]', err);
    }
  }

  async function cancelCall() {
    const partner = currentUser()?.partner;
    if (partner) {
      socketStore.send('webrtc:decline', { target: partner.username });
    }
    endCall();
  }

  function handleOffer(data: { sender: string; senderDisplayName: string; offer: { type: 'offer'; sdp: string } }) {
    if (callState !== 'idle' && callState !== 'ended') {
      socketStore.send('webrtc:decline', { target: data.sender });
      return;
    }
    if (endedResetTimeout) {
      clearTimeout(endedResetTimeout);
      endedResetTimeout = null;
    }
    incomingOffer = data.offer;
    incomingSender = data.sender;
    incomingDisplayName = data.senderDisplayName;
    callState = 'incoming';
  }

  async function acceptCall() {
    if (!incomingOffer) return;
    try {
      error = '';
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

      peerConnection = createPeerConnection();
      localStream.getTracks().forEach((track) => {
        peerConnection!.addTrack(track, localStream!);
      });

      await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingOffer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      socketStore.send('webrtc:answer', {
        target: incomingSender,
        answer: { type: answer.type, sdp: answer.sdp! }
      });

      incomingOffer = null;
      incomingSender = '';
      callState = 'connected';
    } catch (err) {
      error = 'Failed to accept call.';
      console.error('[WebRTC]', err);
      endCall();
    }
  }

  function declineCall() {
    if (incomingSender) {
      socketStore.send('webrtc:decline', { target: incomingSender });
    }
    resetIncoming();
    callState = 'idle';
  }

  function handleDeclined(data: { sender: string; senderDisplayName: string }) {
    if (callState === 'calling') {
      error = `${data.senderDisplayName} declined the call.`;
      endCall();
    }
  }

  async function handleAnswer(data: { answer: { type: 'answer'; sdp: string } }) {
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      callState = 'connected';
    }
  }

  async function handleIceCandidate(data: { candidate: RTCIceCandidateInit }) {
    if (peerConnection && data.candidate) {
      try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        console.warn('[WebRTC] Failed to add ICE candidate:', err);
      }
    }
  }

  function handleHungup(data: { sender: string; senderDisplayName: string }) {
    if (callState === 'connected' || callState === 'calling' || callState === 'incoming') {
      error = `${data.senderDisplayName} ended the call.`;
      endCall();
    }
  }

  function toggleAudio() {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      audioEnabled = !audioEnabled;
    }
  }

  function toggleVideo() {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      videoEnabled = !videoEnabled;
    }
  }

  function endCall() {
    if (callState === 'connected' || callState === 'calling') {
      const partner = currentUser()?.partner;
      if (partner) {
        socketStore.send('webrtc:hangup', { target: partner.username });
      }
    }

    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localStream = null;
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach((track) => track.stop());
      remoteStream = null;
    }
    resetIncoming();

    if (callState !== 'ended') {
      callState = 'ended';
      if (endedResetTimeout) clearTimeout(endedResetTimeout);
      endedResetTimeout = setTimeout(() => {
        callState = 'idle';
        error = '';
      }, 3000);
    }
  }

  function resetIncoming() {
    incomingOffer = null;
    incomingSender = '';
    incomingDisplayName = '';
  }

  // Redirect if not authenticated
  $effect(() => {
    if (!isLoading() && !isAuthenticated() && typeof window !== 'undefined') {
      goto('/login');
    }
  });

  // Reactively bind video elements to streams
  $effect(() => {
    if (localVideo) {
      localVideo.srcObject = localStream ?? null;
    }
  });

  $effect(() => {
    if (remoteVideo) {
      remoteVideo.srcObject = remoteStream ?? null;
    }
  });

  // End call on page refresh/close
  $effect(() => {
    const handler = () => endCall();
    window.addEventListener('beforeunload', handler);
    return () => {
      window.removeEventListener('beforeunload', handler);
    };
  });

  // Attach/detach socket listeners
  function attachListeners() {
    socketStore.on('webrtc:offer', handleOffer);
    socketStore.on('webrtc:answer', handleAnswer);
    socketStore.on('webrtc:ice-candidate', handleIceCandidate);
    socketStore.on('webrtc:declined', handleDeclined);
    socketStore.on('webrtc:hungup', handleHungup);
  }

  function detachListeners() {
    socketStore.off('webrtc:offer', handleOffer);
    socketStore.off('webrtc:answer', handleAnswer);
    socketStore.off('webrtc:ice-candidate', handleIceCandidate);
    socketStore.off('webrtc:declined', handleDeclined);
    socketStore.off('webrtc:hungup', handleHungup);
  }

  onMount(() => {
    loadIceServers();
    attachListeners();
  });

  onDestroy(() => {
    endCall();
    detachListeners();
    if (endedResetTimeout) clearTimeout(endedResetTimeout);
  });
</script>

{#if isAuthenticated()}
  <div class="max-w-md mx-auto px-3 py-4" in:fade>
    <h2 class="text-2xl font-bold mb-4">📹 Video Call</h2>

    {#if error}
      <div class="glass rounded-xl p-4 mb-4 text-rina-rose text-sm text-center" transition:fade>
        {error}
      </div>
    {/if}

    <GlassCard padding="none" class="relative aspect-video bg-rina-bg overflow-hidden mb-4">
      <video
        bind:this={remoteVideo}
        autoplay
        playsinline
        class="w-full h-full object-cover {callState === 'connected' ? 'opacity-100' : 'opacity-0'}"
      ></video>

      {#if callState !== 'connected'}
        <div class="absolute inset-0 flex flex-col items-center justify-center text-rina-slate p-4">
          {#if callState === 'idle'}
            <span class="text-5xl mb-3">📹</span>
            <p class="text-base font-medium">Ready to connect</p>
            <p class="text-sm text-rina-slate-dark mt-1">Start a call or wait for an incoming one</p>
          {:else if callState === 'calling'}
            <span class="text-5xl mb-3 animate-pulse">📞</span>
            <p class="text-base font-medium">Calling...</p>
            <p class="text-sm text-rina-slate-dark mt-1">Waiting for partner to answer</p>
          {:else if callState === 'incoming'}
            <span class="text-5xl mb-3 animate-bounce">📲</span>
            <p class="text-base font-medium">{incomingDisplayName} is calling</p>
            <div class="flex gap-3 mt-5 w-full justify-center">
              <button
                onclick={acceptCall}
                class="flex-1 max-w-[140px] px-6 py-3 rounded-full bg-green-500 text-white font-semibold hover:bg-green-600 active:scale-95 transition-all input-safe touch-target"
              >
                Accept
              </button>
              <button
                onclick={declineCall}
                class="flex-1 max-w-[140px] px-6 py-3 rounded-full bg-red-500 text-white font-semibold hover:bg-red-600 active:scale-95 transition-all input-safe touch-target"
              >
                Decline
              </button>
            </div>
          {:else if callState === 'ended'}
            <span class="text-5xl mb-3">📵</span>
            <p class="text-base font-medium">Call ended</p>
          {/if}
        </div>
      {/if}

      <div class="absolute bottom-3 right-3 w-28 md:w-44 aspect-video rounded-xl overflow-hidden border-2 border-rina-border shadow-lg">
        <video
          bind:this={localVideo}
          autoplay
          playsinline
          muted
          class="w-full h-full object-cover {localStream ? 'opacity-100' : 'opacity-0'}"
        ></video>
        {#if !localStream}
          <div class="absolute inset-0 flex items-center justify-center bg-rina-bg text-rina-slate-dark text-xs">
            Camera off
          </div>
        {/if}
      </div>
    </GlassCard>

    <div class="flex items-center justify-center gap-3 w-full" in:scale>
      {#if callState === 'idle'}
        <button
          onclick={startCall}
          class="w-full max-w-sm px-8 py-3 rounded-full bg-rina-rose text-white font-semibold hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2 input-safe touch-target"
        >
          <span>📞</span> Start Call
        </button>
      {:else if callState === 'calling'}
        <button
          onclick={cancelCall}
          class="w-full max-w-sm px-6 py-3 rounded-full bg-red-500 text-white font-semibold hover:bg-red-600 active:scale-95 transition-all flex items-center justify-center gap-2 input-safe touch-target"
        >
          <span>📵</span> Cancel
        </button>
      {:else if callState === 'incoming'}
        <div class="flex gap-4 w-full justify-center">
          <button
            onclick={acceptCall}
            class="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center text-xl hover:bg-green-600 active:scale-95 transition-all input-safe touch-target"
            title="Accept"
          >
            📞
          </button>
          <button
            onclick={declineCall}
            class="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-xl hover:bg-red-600 active:scale-95 transition-all input-safe touch-target"
            title="Decline"
          >
            📵
          </button>
        </div>
      {:else}
        <div class="flex gap-4 w-full justify-center">
          <button
            onclick={toggleAudio}
            class="w-14 h-14 rounded-full glass flex items-center justify-center text-xl hover:bg-white/10 transition-colors input-safe touch-target"
            title={audioEnabled ? 'Mute' : 'Unmute'}
          >
            {audioEnabled ? '🎤' : '🎤❌'}
          </button>
          <button
            onclick={toggleVideo}
            class="w-14 h-14 rounded-full glass flex items-center justify-center text-xl hover:bg-white/10 transition-colors input-safe touch-target"
            title={videoEnabled ? 'Turn off video' : 'Turn on video'}
          >
            {videoEnabled ? '📷' : '📷❌'}
          </button>
          <button
            onclick={endCall}
            class="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-xl hover:bg-red-600 active:scale-95 transition-all input-safe touch-target"
            title="End call"
          >
            📞
          </button>
        </div>
      {/if}
    </div>

    <div class="mt-4 text-center">
      <p class="text-xs text-rina-slate-dark">
        💡 Tip: Use your browser's Picture-in-Picture for match-day theater mode.
      </p>
    </div>
  </div>
{/if}
