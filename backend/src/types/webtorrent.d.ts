declare module 'webtorrent' {
  import { Readable } from 'stream';
  export interface TorrentFile {
    name: string;
    length: number;
    createReadStream(opts?: { start?: number; end?: number }): Readable;
  }
  export interface Torrent {
    files: TorrentFile[];
    destroy(): void;
  }
  export default class WebTorrent {
    add(uri: string, callback: (torrent: Torrent) => void): void;
  }
}
