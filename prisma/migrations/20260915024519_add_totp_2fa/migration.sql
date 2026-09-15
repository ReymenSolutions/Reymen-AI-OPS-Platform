-- AlterTable
ALTER TABLE "User" ADD COLUMN     "totpBackupCodeHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totpSecret" TEXT;
