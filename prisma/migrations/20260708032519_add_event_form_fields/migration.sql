-- CreateEnum
CREATE TYPE "FormFieldType" AS ENUM ('TEXT', 'SELECT', 'CHECKBOX');

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "customFields" JSONB;

-- CreateTable
CREATE TABLE "EventFormField" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "FormFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventFormField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventFormField_eventId_idx" ON "EventFormField"("eventId");

-- AddForeignKey
ALTER TABLE "EventFormField" ADD CONSTRAINT "EventFormField_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
