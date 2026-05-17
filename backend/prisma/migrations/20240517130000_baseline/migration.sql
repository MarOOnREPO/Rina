-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('WORK', 'SHARED');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'AUDIO', 'VIDEO');

-- CreateTable User
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "displayName" VARCHAR(100) NOT NULL,
    "avatarUrl" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex User
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateTable CalendarEvent
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000),
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "type" "EventType" NOT NULL DEFAULT 'SHARED',
    "creatorId" TEXT NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "color" VARCHAR(7),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex CalendarEvent
CREATE INDEX "CalendarEvent_startTime_idx" ON "CalendarEvent"("startTime");
CREATE INDEX "CalendarEvent_type_idx" ON "CalendarEvent"("type");
CREATE INDEX "CalendarEvent_creatorId_idx" ON "CalendarEvent"("creatorId");

-- CreateTable CycleEntry
CREATE TABLE "CycleEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "flowIntensity" SMALLINT,
    "symptoms" TEXT[],
    "temperature" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CycleEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex CycleEntry
CREATE UNIQUE INDEX "CycleEntry_userId_date_key" ON "CycleEntry"("userId", "date");
CREATE INDEX "CycleEntry_date_idx" ON "CycleEntry"("date");

-- CreateTable Movie
CREATE TABLE "Movie" (
    "id" TEXT NOT NULL,
    "tmdbId" INTEGER NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "overview" TEXT,
    "posterPath" TEXT,
    "backdropPath" TEXT,
    "releaseDate" TIMESTAMP(3),
    "watched" BOOLEAN NOT NULL DEFAULT false,
    "watchedAt" TIMESTAMP(3),
    "rating" SMALLINT,
    "addedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Movie_pkey" PRIMARY KEY ("id")
);

-- CreateIndex Movie
CREATE UNIQUE INDEX "Movie_tmdbId_key" ON "Movie"("tmdbId");
CREATE INDEX "Movie_watched_idx" ON "Movie"("watched");
CREATE INDEX "Movie_addedBy_idx" ON "Movie"("addedBy");

-- CreateTable Message
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" VARCHAR(4000) NOT NULL,
    "type" "MessageType" NOT NULL DEFAULT 'TEXT',
    "mediaUrl" TEXT,
    "replyToId" TEXT,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex Message
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");

-- CreateTable TimeCapsule
CREATE TABLE "TimeCapsule" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000),
    "encryptedData" TEXT NOT NULL,
    "mediaType" VARCHAR(20) NOT NULL,
    "unlockAt" TIMESTAMP(3) NOT NULL,
    "creatorId" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeCapsule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex TimeCapsule
CREATE INDEX "TimeCapsule_unlockAt_idx" ON "TimeCapsule"("unlockAt");
CREATE INDEX "TimeCapsule_creatorId_idx" ON "TimeCapsule"("creatorId");

-- CreateTable Countdown
CREATE TABLE "Countdown" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "location" VARCHAR(200),
    "imageUrl" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Countdown_pkey" PRIMARY KEY ("id")
);

-- CreateIndex Countdown
CREATE INDEX "Countdown_targetDate_idx" ON "Countdown"("targetDate");
CREATE INDEX "Countdown_createdBy_idx" ON "Countdown"("createdBy");

-- CreateTable ScrapbookPhoto
CREATE TABLE "ScrapbookPhoto" (
    "id" TEXT NOT NULL,
    "s3Key" VARCHAR(500) NOT NULL,
    "thumbnailUrl" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "caption" VARCHAR(500),
    "takenAt" TIMESTAMP(3),
    "exifData" JSONB,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapbookPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex ScrapbookPhoto
CREATE INDEX "ScrapbookPhoto_lat_lng_idx" ON "ScrapbookPhoto"("lat", "lng");
CREATE INDEX "ScrapbookPhoto_uploadedBy_idx" ON "ScrapbookPhoto"("uploadedBy");

-- CreateTable Goal
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "targetAmount" INTEGER NOT NULL,
    "currentAmount" INTEGER NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
    "deadline" TIMESTAMP(3),
    "icon" VARCHAR(50),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex Goal
CREATE INDEX "Goal_createdBy_idx" ON "Goal"("createdBy");

-- CreateTable WhiteboardSession
CREATE TABLE "WhiteboardSession" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "ydocState" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhiteboardSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex WhiteboardSession
CREATE INDEX "WhiteboardSession_createdBy_idx" ON "WhiteboardSession"("createdBy");

-- CreateTable PushSubscription
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex PushSubscription
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- AddForeignKey CalendarEvent
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey CycleEntry
ALTER TABLE "CycleEntry" ADD CONSTRAINT "CycleEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey Movie
ALTER TABLE "Movie" ADD CONSTRAINT "Movie_addedBy_fkey" FOREIGN KEY ("addedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey Message
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey TimeCapsule
ALTER TABLE "TimeCapsule" ADD CONSTRAINT "TimeCapsule_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey Countdown
ALTER TABLE "Countdown" ADD CONSTRAINT "Countdown_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey ScrapbookPhoto
ALTER TABLE "ScrapbookPhoto" ADD CONSTRAINT "ScrapbookPhoto_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey Goal
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey WhiteboardSession
ALTER TABLE "WhiteboardSession" ADD CONSTRAINT "WhiteboardSession_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey PushSubscription
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
