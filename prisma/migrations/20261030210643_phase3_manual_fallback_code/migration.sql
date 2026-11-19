-- CreateTable
CREATE TABLE "AttendanceManualCode" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceManualCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceManualCode_codeHash_key" ON "AttendanceManualCode"("codeHash");

-- CreateIndex
CREATE INDEX "AttendanceManualCode_sessionId_idx" ON "AttendanceManualCode"("sessionId");

-- CreateIndex
CREATE INDEX "AttendanceManualCode_expiresAt_idx" ON "AttendanceManualCode"("expiresAt");

-- AddForeignKey
ALTER TABLE "AttendanceManualCode" ADD CONSTRAINT "AttendanceManualCode_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AttendanceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceManualCode" ADD CONSTRAINT "AttendanceManualCode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
