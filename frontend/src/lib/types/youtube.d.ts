/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */
// YouTube IFrame Player API Type Declarations
// https://developers.google.com/youtube/iframe_api_reference

declare namespace YT {
  interface Player {
    playVideo(): void;
    pauseVideo(): void;
    stopVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    getCurrentTime(): number;
    getPlayerState(): PlayerState;
    getVideoData(): { title: string; video_id: string; author: string };
    loadVideoById(videoId: string): void;
    destroy(): void;
  }

  interface PlayerOptions {
    height?: string | number;
    width?: string | number;
    videoId?: string;
    playerVars?: Record<string, unknown>;
    events?: {
      onReady?: (event: { target: Player }) => void;
      onStateChange?: (event: OnStateChangeEvent) => void;
      onError?: (event: { data: number }) => void;
    };
  }

  interface OnStateChangeEvent {
    data: PlayerState;
    target: Player;
  }

  enum PlayerState {
    UNSTARTED = -1,
    ENDED = 0,
    PLAYING = 1,
    PAUSED = 2,
    BUFFERING = 3,
    CUED = 5
  }

  class Player {
    constructor(elementId: string, options: PlayerOptions);
  }
}

interface Window {
  YT: {
    Player: typeof YT.Player;
    PlayerState: typeof YT.PlayerState;
  };
  onYouTubeIframeAPIReady?: () => void;
}
