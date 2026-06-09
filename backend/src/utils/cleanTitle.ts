const COMMON_TAGS = [
  '1080p', '720p', '480p', '2160p', '4K', 'UHD', 'HDR', 'HEVC', 'x264', 'x265', 'h264', 'h265',
  'BluRay', 'Blu-Ray', 'BRRip', 'WEBRip', 'WEB-DL', 'WEBDL', 'HDTV', 'DVDRip', 'Cam', 'TS', 'Telesync',
  'HDTS', 'DVDSCR', 'SCR', 'EXTENDED', 'UNRATED', 'REMASTERED', 'DIRECTORS CUT', 'DC', 'REPACK',
  'PROPER', 'READNFO', 'SUBFRENCH', 'FRENCH', 'TRUEFRENCH', 'VOSTFR', 'MULTI', 'VF', 'VO',
  'AAC', 'AC3', 'DTS', 'DDP5\.1', 'DD5\.1', 'Atmos', 'MA', 'HDMA',
  'AMZN', 'NF', 'DSNP', 'HULU', 'HBO', 'APTV',
  'SPARKS', 'DRONES', 'RELOADED', 'SPARROW', 'ROVERS', 'NTb', 'KiNGS', 'MZABI',
  'CpasBien', 'YIFY', 'YTS', 'RARBG', 'EZTV', 'ETTV',
  'S\d{1,2}E\d{1,2}', 'Season \d+', 'Episode \d+',
];

const TAG_REGEX = new RegExp(
  '\\b(' + COMMON_TAGS.join('|') + ')\\b',
  'gi'
);

export function cleanTitleFromFilename(filename: string): { title: string; year?: string; isTv?: boolean } {
  // Remove extension
  let base = filename.replace(/\.[^/.]+$/, '');

  // Replace separators with spaces
  let cleaned = base.replace(/[._\-]+/g, ' ').replace(/\s+/g, ' ').trim();

  // Detect TV pattern S01E02 or Season 1 Episode 2
  const tvMatch = cleaned.match(/\bS(\d{1,2})E(\d{1,2})\b/i) ||
                  cleaned.match(/\bSeason\s+(\d+)\s+Episode\s+(\d+)\b/i);
  const isTv = !!tvMatch;

  // Extract year
  const yearMatch = cleaned.match(/\b(19\d{2}|20\d{2})\b/);
  const year = yearMatch ? yearMatch[1] : undefined;

  // Remove tags (case insensitive)
  cleaned = cleaned
    .replace(TAG_REGEX, '')
    .replace(/\b(19\d{2}|20\d{2})\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Clean up trailing/leading junk
  cleaned = cleaned.replace(/^[\s\-–—]+|[\s\-–—]+$/g, '').trim();

  return { title: cleaned, year, isTv };
}
