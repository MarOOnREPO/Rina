export interface CinemaSource {
  type: 'torrent' | 'direct';
  uri: string;
}

export interface CinemaSession {
  id: string;
  source: CinemaSource;
  status: 'starting' | 'ready' | 'error' | 'completed';
  error?: string;
  createdAt: number;
  completedAt?: number;
}
