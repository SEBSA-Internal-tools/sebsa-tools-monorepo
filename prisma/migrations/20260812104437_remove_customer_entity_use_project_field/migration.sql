/*
  Warnings:

  - You are about to drop the column `customerId` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the `customers` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_customerId_fkey";

-- DropIndex
DROP INDEX "projects_customerId_idx";

-- AlterTable
ALTER TABLE "projects" DROP COLUMN "customerId",
ADD COLUMN     "customerName" TEXT;

-- DropTable
DROP TABLE "customers";
