<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { isAuthenticated, isLoading, currentUser } from '$lib/stores/auth.svelte';
  import { socketStore } from '$lib/stores/socket.svelte';
  import { fade, scale } from 'svelte/transition';
  import GlassCard from '$lib/components/GlassCard.svelte';
  import { api } from '$lib/utils/api';

  let localVideo: HTMLVideoElement;
  let remoteVideo: HTMLVideoElement;
  let peerConnection: RTCPeerConnection | null = null;
  let localStream: MediaStream | null = null;
  let callState: 'idle' | 'calling' | 'incoming' | 'connected' | 'ended' = 'idle';
  let error = '';
  let audioEnabled = true;
  let videoEnabled = true;
  let iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  // Incoming call state
  let incomingOffer: RTCSessionDescriptionInit | null = null;
  let incomingSender = '';
  let incomingDisplayName = '';

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
        const partner = currentUser?.username === 'maroon' ? 'rina' : 'maroon';
        socketStore.emit('webrtc:ice-candidate', {
          target: partner,
          candidate: event.candidate.toJSON()
        });
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideo && event.streams[0]) {
        remoteVideo.srcObject = event.streams[0];
        callState = 'connected';
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        endCall();
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

      if (localVideo) {
        localVideo.srcObject = localStream;
      }

      peerConnection = createPeerConnection();
      localStream.getTracks().forEach((track) => {
        peerConnection!.addTrack(track, localStream!);
      });

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const partner = currentUser?.username === 'maroon' ? 'rina' : 'maroon';
      socketStore.emit('webrtc:offer', {
        target: partner,
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
    const partner = currentUser?.username === 'maroon' ? 'rina' : 'maroon';
    socketStore.emit('webrtc:decline', { target: partner });
    endCall();
  }

  function handleOffer(data: { sender: string; senderDisplayName: string; offer: { type: 'offer'; sdp: string } }) {
    if (callState !== 'idle') {
      // Already in a call — auto-decline
      socketStore.emit('webrtc:decline', { target: data.sender });
      return;
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

      if (localVideo) {
        localVideo.srcObject = localStream;
      }

      peerConnection = createPeerConnection();
      localStream.getTracks().forEach((track) => {
        peerConnection!.addTrack(track, localStream!);
      });

      await peerConnection.setRemoteDescription(new RTCSessionDescription(incomingOffer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      socketStore.emit('webrtc:answer', {
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
      socketStore.emit('webrtc:decline', { target: incomingSender });
    }
    incomingOffer = null;
    incomingSender = '';
    incomingDisplayName = '';
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
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localStream = null;
    }
    if (localVideo) localVideo.srcObject = null;
    if (remoteVideo) remoteVideo.srcObject = null;
    incomingOffer = null;
    incomingSender = '';
    incomingDisplayName = '';
    callState = 'idle';
  }

  // Redirect if not authenticated (wait for auth loading to finish)
  $effect(() => {
    if (!isLoading && !isAuthenticated && typeof window !== 'undefined') {
      goto('/login');
    }
  });

  onMount(() => {
    loadIceServers();

    const sock = socketStore.getSocket();
    if (sock) {
      sock.on('webrtc:offer', handleOffer);
      sock.on('webrtc:answer', handleAnswer);
      sock.on('webrtc:ice-candidate', handleIceCandidate);
      sock.on('webrtc:declined', handleDeclined);
    }
  });

  onDestroy(() => {
    endCall();
    const sock = socketStore.getSocket();
    if (sock) {
      sock.off('webrtc:offer', handleOffer);
      sock.off('webrtc:answer', handleAnswer);
      sock.off('webrtc:ice-candidate', handleIceCandidate);
      sock.off('webrtc:declined', handleDeclined);
    }
  });
</script>

{#if isAuthenticated}
  <div class="max-w-5xl mx-auto px-4 py-6" in:fade>
    <h2 class="text-2xl font-bold mb-6">📹 Video Call</h2>

    {#if error}
      <div class="glass rounded-xl p-4 mb-4 text-rina-rose text-sm text-center" transition:fade>
        {error}
      </div>
    {/if}

    <GlassCard className="relative aspect-video bg-rina-bg overflow-hidden mb-4">
      <!-- Remote video (full area) -->
      <video
        bind:this={remoteVideo}
        autoplay
        playsinline
        class="w-full h-full object-cover {callState === 'connected' ? 'opacity-100' : 'opacity-0'}"
      ></video>

      <!-- Placeholder / status overlay -->
      {#if callState !== 'connected'}
        <div class="absolute inset-0 flex flex-col items-center justify-center text-rina-slate">
          {#if callState === 'idle'}
            <span class="text-6xl mb-4">📹</span>
            <p class="text-lg font-medium">Ready to connect</p>
            <p class="text-sm text-rina-slate-dark mt-1">Start a call or wait for an incoming one</p>
          {:else if callState === 'calling'}
            <span class="text-6xl mb-4 animate-pulse">📞</span>
            <p class="text-lg font-medium">Calling...</p>
            <p class="text-sm text-rina-slate-dark mt-1">Waiting for partner to answer</p>
          {:else if callState === 'incoming'}
            <span class="text-6xl mb-4 animate-bounce">📲</span>
            <p class="text-lg font-medium">{incomingDisplayName} is calling</p>
            <div class="flex gap-3 mt-6">
              <button
                on:click={acceptCall}
                class="px-6 py-2 rounded-full bg-green-500 text-white font-semibold hover:bg-green-600 active:scale-95 transition-all"
              >
                Accept
              </button>
              <button
                on:click={declineCall}
                class="px-6 py-2 rounded-full bg-red-500 text-white font-semibold hover:bg-red-600 active:scale-95 transition-all"
              >
                Decline
              </button>
            </div>
          {:else if callState === 'ended'}
            <span class="text-6xl mb-4">📵</span>
            <p class="text-lg font-medium">Call ended</p>
          {/if}
        </div>
      {/if}

      <!-- Local video (picture-in-picture) -->
      <div class="absolute bottom-4 right-4 w-32 md:w-48 aspect-video rounded-xl overflow-hidden border-2 border-rina-border shadow-lg">
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

    <!-- Controls -->
    <div class="flex items-center justify-center gap-3" in:scale>
      {#if callState === 'idle'}
        <button
          on:click={startCall}
          class="px-8 py-3 rounded-full bg-rina-rose text-white font-semibold hover:opacity-90 active:scale-95 transition-all flex items-center gap-2"
        >
          <span>📞</span> Start Call
        </button>
      {:else if callState === 'calling'}
        <button
          on:click={cancelCall}
          class="px-6 py-3 rounded-full bg-red-500 text-white font-semibold hover:bg-red-600 active:scale-95 transition-all flex items-center gap-2"
        >
          <span>📵</span> Cancel
        </button>
      {:else if callState === 'incoming'}
        <div class="flex gap-3">
          <button
            on:click={acceptCall}
            class="w-14 h-14 rounded-full bg-green-500 flex items-center justify-center text-xl hover:bg-green-600 active:scale-95 transition-all"
            title="Accept"
          >
            📞
          </button>
          <button
            on:click={declineCall}
            class="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center text-xl hover:bg-red-600 active:scale-95 transition-all"
            title="Decline"
          >
            📵
          </button>
        </div>
      {:else}
        <button
          on:click={toggleAudio}
          class="w-12 h-12 rounded-full glass flex items-center justify-center text-xl hover:bg-white/10 transition-colors"
          title={audioEnabled ? 'Mute' : 'Unmute'}
        >
          {audioEnabled ? '🎤' : '🎤❌'}
        </button>
        <button
          on:click={toggleVideo}
          class="w-12 h-12 rounded-full glass flex items-center justify-center text-xl hover:bg-white/10 transition-colors"
          title={videoEnabled ? 'Turn off video' : 'Turn on video'}
        >
          {videoEnabled ? '📷' : '📷❌'}
        </button>
        <button
          on:click={endCall}
          class="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center text-xl hover:bg-red-600 active:scale-95 transition-all"
          title="End call"
        >
          📞
        </button>
      {/if}
    </div>

    <!-- Match-Day PIP hint -->
    <div class="mt-6 text-center">
      <p class="text-xs text-rina-slate-dark">
        💡 Tip: Use your browser's Picture-in-Picture for match-day theater mode.
      </p>
    </div>
  </div>
{/if}
