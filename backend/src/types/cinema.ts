export interface CinemaTmdbMetadata {
  tmdbId?: number;
  title: string;
  overview?: string | null;
  posterPath?: string | null;
  backdropPath?: string | null;
  releaseDate?: string | null;
  mediaType?: 'movie' | 'tv';
}

export interface CinemaSource {
  type: 'torrent' | 'direct' | 'upload';
  uri: string;
  filename?: string;
  s3Key?: string;
  metadata?: CinemaTmdbMetadata;
}

export interface CinemaSession {
  id: string;
  source: CinemaSource;
  status: 'starting' | 'ready' | 'error' | 'completed';
  error?: string;
  createdAt: number;
  completedAt?: number;
}
