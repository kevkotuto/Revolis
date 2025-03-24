-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "documents" TEXT[],
ADD COLUMN     "logo" TEXT;

-- AlterTable
ALTER TABLE "Contrat" ADD COLUMN     "document" TEXT;

-- AlterTable
ALTER TABLE "Devis" ADD COLUMN     "document" TEXT;

-- AlterTable
ALTER TABLE "Prestataire" ADD COLUMN     "avatar" TEXT,
ADD COLUMN     "documents" TEXT[],
ADD COLUMN     "portfolio" TEXT[];

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "documents" TEXT[],
ADD COLUMN     "images" TEXT[];

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "attachments" TEXT[];

-- AlterTable
ALTER TABLE "TaskComment" ADD COLUMN     "attachments" TEXT[];

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatar" TEXT;

-- CreateTable
CREATE TABLE "Upload" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileType" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "publicUrl" TEXT NOT NULL,
    "uploadType" TEXT NOT NULL,
    "relatedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Upload_uploadType_relatedId_idx" ON "Upload"("uploadType", "relatedId");

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
