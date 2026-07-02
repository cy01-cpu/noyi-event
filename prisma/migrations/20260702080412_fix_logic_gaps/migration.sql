-- AlterEnum
ALTER TYPE "RegistrationStatus" ADD VALUE 'WAITLISTED';

-- AlterTable
ALTER TABLE "Event" ALTER COLUMN "amount" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "branch" TEXT;

-- CreateIndex
CREATE INDEX "Registration_eventId_idx" ON "Registration"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_eventId_email_name_phone_key" ON "Registration"("eventId", "email", "name", "phone");
