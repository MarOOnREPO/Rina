<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { currentUser } from '$lib/stores/auth.svelte';
  import { socketStore } from '$lib/stores/socket.svelte';
  import { fade, scale } from 'svelte/transition';
  import { api } from '$lib/utils/api';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();

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

  export function startCall() {
    startCallInternal();
  }

  async function startCallInternal() {
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

  export function declineCall() {
    if (incomingSender) {
      socketStore.send('webrtc:decline', { target: incomingSender });
    }
    resetIncoming();
    callState = 'idle';
  }

  function handleDeclined(data: { sender: string; senderDisplayName: string }) {
    if (callState === 'calling' || callState === 'incoming') {
      error = `${data.senderDisplayName} declined the call.`;
      endCall();
    }
  }

  async function handleAnswer(data: { answer: { type: 'answer'; sdp: string } }) {
    if (!peerConnection) return;
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    callState = 'connected';
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

  export function endCall() {
    if (callState === 'connected' || callState === 'calling') {
      const partner = currentUser()?.partner;
      if (partner) {
        socketStore.send('webrtc:hangup', { target: partner.username });
      }
    } else if (callState === 'incoming' && incomingSender) {
      socketStore.send('webrtc:decline', { target: incomingSender });
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

  // When overlay closes, end any active call
  $effect(() => {
    if (!isOpen && (callState === 'connected' || callState === 'calling' || callState === 'incoming')) {
      endCall();
    }
  });

  // Reset ended state immediately when overlay is reopened
  $effect(() => {
    if (isOpen && callState === 'ended') {
      if (endedResetTimeout) clearTimeout(endedResetTimeout);
      endedResetTimeout = null;
      callState = 'idle';
      error = '';
    }
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

{#if isOpen}
  <div
    class="fixed inset-0 z-[100] bg-rina-text/80 backdrop-blur-md flex items-center justify-center"
    transition:fade={{ duration: 200 }}
  >
    <!-- Close button (top-right) for idle/ended states -->
    {#if callState === 'idle' || callState === 'ended'}
      <button
        onclick={onClose}
        class="absolute top-4 right-4 z-20 w-10 h-10 rounded-full glass flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        aria-label="Close video call"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    {/if}

    {#if error}
      <div class="absolute top-16 left-0 right-0 z-20 px-4" transition:fade>
        <div class="mx-auto max-w-sm glass rounded-xl p-3 text-rina-rose text-sm text-center">
          {error}
        </div>
      </div>
    {/if}

    <!-- Remote video (full background) -->
    <div class="absolute inset-0 bg-rina-bg">
      <video
        bind:this={remoteVideo}
        autoplay
        playsinline
        class="w-full h-full object-cover {callState === 'connected' ? 'opacity-100' : 'opacity-0'}"
      ></video>
    </div>

    <!-- Call state overlay -->
    {#if callState !== 'connected'}
      <div class="absolute inset-0 flex flex-col items-center justify-center text-white p-4 z-10">
        {#if callState === 'idle'}
          <span class="text-6xl mb-4" in:scale>📹</span>
          <p class="text-xl font-medium mb-1">Ready to connect</p>
          <p class="text-sm text-white/60 mb-8">Start a call with your partner</p>
          <button
            onclick={startCallInternal}
            class="px-8 py-3 rounded-full bg-rina-rose text-white font-semibold hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg"
          >
            <span>📞</span> Start Call
          </button>
        {:else if callState === 'calling'}
          <span class="text-6xl mb-4 animate-pulse">📞</span>
          <p class="text-xl font-medium mb-1">Calling...</p>
          <p class="text-sm text-white/60 mb-8">Waiting for partner to answer</p>
          <button
            onclick={cancelCall}
            class="px-6 py-3 rounded-full bg-red-500 text-white font-semibold hover:bg-red-600 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <span>📵</span> Cancel
          </button>
        {:else if callState === 'incoming'}
          <div class="flex flex-col items-center" in:scale>
            <div class="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mb-4 animate-bounce">
              <span class="text-4xl">📲</span>
            </div>
            <p class="text-xl font-medium mb-1">{incomingDisplayName || 'Partner'} is calling</p>
            <p class="text-sm text-white/60 mb-8">Incoming video call</p>
            <div class="flex gap-4">
              <button
                onclick={acceptCall}
                class="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center text-2xl hover:bg-green-600 active:scale-95 transition-all shadow-lg"
                title="Accept"
              >
                📞
              </button>
              <button
                onclick={declineCall}
                class="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-2xl hover:bg-red-600 active:scale-95 transition-all shadow-lg"
                title="Decline"
              >
                📵
              </button>
            </div>
          </div>
        {:else if callState === 'ended'}
          <span class="text-6xl mb-4">📵</span>
          <p class="text-xl font-medium mb-1">Call ended</p>
          <p class="text-sm text-white/60">Closing...</p>
        {/if}
      </div>
    {/if}

    <!-- Local video (small floating window) -->
    <div
      class="absolute bottom-24 right-4 z-20 w-40 h-32 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl bg-rina-bg"
    >
      <video
        bind:this={localVideo}
        autoplay
        playsinline
        muted
        class="w-full h-full object-cover {localStream ? 'opacity-100' : 'opacity-0'}"
      ></video>
      {#if !localStream}
        <div class="absolute inset-0 flex items-center justify-center text-white/50 text-xs">
          Camera off
        </div>
      {/if}
    </div>

    <!-- Call controls (bottom center) -->
    {#if callState === 'connected' || callState === 'calling'}
      <div class="absolute bottom-6 left-0 right-0 z-20 flex items-center justify-center gap-4" in:scale>
        <button
          onclick={toggleAudio}
          class="w-14 h-14 rounded-full glass bg-white/10 backdrop-blur-md flex items-center justify-center text-xl hover:bg-white/20 transition-colors border border-white/10"
          title={audioEnabled ? 'Mute' : 'Unmute'}
        >
          {#if audioEnabled}
            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"/>
            </svg>
          {:else}
            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/>
            </svg>
          {/if}
        </button>
        <button
          onclick={toggleVideo}
          class="w-14 h-14 rounded-full glass bg-white/10 backdrop-blur-md flex items-center justify-center text-xl hover:bg-white/20 transition-colors border border-white/10"
          title={videoEnabled ? 'Turn off video' : 'Turn on video'}
        >
          {#if videoEnabled}
            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
          {:else}
            <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 3l18 18"/>
            </svg>
          {/if}
        </button>
        <button
          onclick={endCall}
          class="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-xl hover:bg-red-600 active:scale-95 transition-all shadow-lg"
          title="End call"
        >
          <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z"/>
          </svg>
        </button>
      </div>
    {/if}

    <!-- Incoming call controls (bottom center) -->
    {#if callState === 'incoming'}
      <div class="absolute bottom-6 left-0 right-0 z-20 flex items-center justify-center gap-4" in:scale>
        <button
          onclick={acceptCall}
          class="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center text-2xl hover:bg-green-600 active:scale-95 transition-all shadow-lg"
          title="Accept"
        >
          📞
        </button>
        <button
          onclick={declineCall}
          class="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-2xl hover:bg-red-600 active:scale-95 transition-all shadow-lg"
          title="Decline"
        >
          📵
        </button>
      </div>
    {/if}
  </div>
{/if}
