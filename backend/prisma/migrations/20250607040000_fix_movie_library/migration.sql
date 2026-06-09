-- DropIndex
DROP INDEX "Movie_tmdbId_key";

-- AlterTable
ALTER TABLE "Movie" ALTER COLUMN "tmdbId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Movie" ADD COLUMN "s3Key" VARCHAR(500);

-- AlterTable
ALTER TABLE "Movie" ADD COLUMN "sourceUrl" VARCHAR(1000);
